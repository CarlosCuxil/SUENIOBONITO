package gt.calin.sueno

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.media.AudioAttributes
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import org.json.JSONArray
import org.json.JSONObject

class SleepService : Service() {

    companion object {
        const val A_START = "start"
        const val A_STOP = "stop"
        const val A_RING = "ring"
        const val A_SNOOZE = "snooze"
        const val A_SOUNDS = "sounds"
        const val A_SOUNDS_STOP = "sounds_stop"

        @Volatile
        var instance: SleepService? = null

        fun liveJson(): String {
            val s = instance
            if (s != null) return s.live()
            return JSONObject()
                .put("recording", false)
                .put("ringing", false)
                .put("sounds", NoiseMixer.stateJson())
                .toString()
        }
    }

    private val main = Handler(Looper.getMainLooper())
    private lateinit var nm: NotificationManager

    // Estado de la noche
    @Volatile var recording = false
        private set
    @Volatile var ringing = false
        private set
    @Volatile private var ringOnly = false
    @Volatile private var ringWhy = ""
    private var id = ""
    private var start = 0L
    private var endTs = 0L
    private var cfg = JSONObject()
    private val minutes = ArrayList<DoubleArray>()
    private val events = ArrayList<Ev>()
    private val counts = HashMap<String, Int>()
    private var alarmOn = false
    @Volatile private var wakeTs = 0L
    @Volatile private var win = 0
    private var alarmSet = ""
    private var rangAt = 0L
    private var snoozes = 0
    private var baseline = Double.NaN
    @Volatile private var level = 0.0
    @Volatile private var inEvent = false
    @Volatile private var micError = false
    private val wave = ArrayDeque<Double>()
    private var recThread: Thread? = null
    private var wl: PowerManager.WakeLock? = null
    private var vib: Vibrator? = null
    private val clipState = HashMap<String, LongArray>() // tipo -> [cantidad, último]
    private var lastNotif = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        nm = getSystemService(NotificationManager::class.java)
        Notif.ensure(this)
    }

    override fun onDestroy() {
        instance = null
        super.onDestroy()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            A_START -> {
                val c = try { JSONObject(intent.getStringExtra("cfg") ?: "{}") } catch (_: Exception) { JSONObject() }
                if (!recording) startNight(c)
            }
            A_RING -> {
                if (recording) {
                    if (!ringing) ring("Es tu hora")
                } else if (!ringing) {
                    ringOnly = true
                    cfg = settingsCfg()
                    goForeground(false, buildRingOnlyNotif())
                    ring("Es tu hora")
                }
            }
            A_SNOOZE -> snooze()
            A_STOP -> stopNight()
            A_SOUNDS -> {
                val list = parseSounds(intent.getStringExtra("sounds") ?: "[]")
                val min = intent.getIntExtra("minutes", 30)
                if (!recording && !ringing) goForeground(false, buildSoundNotif(list))
                NoiseMixer.onEnded = { main.post { onSoundsEnded() } }
                NoiseMixer.play(list, min)
            }
            A_SOUNDS_STOP -> {
                NoiseMixer.stop()
                onSoundsEnded()
            }
        }
        return START_NOT_STICKY
    }

    private fun onSoundsEnded() {
        if (!recording && !ringing) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
        }
    }

    private fun parseSounds(json: String): List<Pair<String, Double>> {
        val out = ArrayList<Pair<String, Double>>()
        try {
            val arr = JSONArray(json)
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                out.add(o.getString("type") to o.optDouble("vol", 0.5))
            }
        } catch (_: Exception) {
        }
        return out
    }

    private fun settingsCfg(): JSONObject {
        val s = Store.settings(this)
        return JSONObject()
            .put("alarmSound", s.optString("alarmSound", "amanecer"))
            .put("vibrate", s.optBoolean("vibrate", true))
            .put("ramp", s.optBoolean("ramp", true))
            .put("snooze", s.optInt("snooze", 9))
    }

    private fun goForeground(mic: Boolean, n: Notification) {
        if (Build.VERSION.SDK_INT >= 30) {
            val type = if (mic) {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            } else {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            }
            startForeground(Notif.N_REC, n, type)
        } else {
            startForeground(Notif.N_REC, n)
        }
    }

    /* ---------------- Noche ---------------- */

    private fun startNight(c: JSONObject) {
        cfg = c
        start = System.currentTimeMillis()
        id = "n$start"
        endTs = 0L
        synchronized(minutes) { minutes.clear() }
        synchronized(events) { events.clear() }
        counts.clear(); clipState.clear()
        rangAt = 0L; snoozes = 0; micError = false; ringOnly = false
        baseline = Double.NaN
        val a = c.optJSONObject("alarm")
        alarmOn = a?.optBoolean("on", false) == true
        wakeTs = a?.optLong("wakeTs", 0L) ?: 0L
        win = a?.optInt("win", 0) ?: 0
        alarmSet = a?.optString("set", "") ?: ""

        goForeground(true, buildRecNotif())
        val pm = getSystemService(PowerManager::class.java)
        wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "sueno:noche").apply {
            setReferenceCounted(false)
            acquire(16 * 3600 * 1000L)
        }
        recording = true
        save("recording")
        if (alarmOn && wakeTs > 0) scheduleBackup(wakeTs)

        val aid = c.optJSONObject("aid")
        if (aid != null) {
            val list = parseSounds(aid.optJSONArray("types")?.toString() ?: "[]")
            if (list.isNotEmpty()) {
                NoiseMixer.onEnded = null
                NoiseMixer.play(list, aid.optInt("min", 30))
            }
        }
        Store.cleanOldClips(this, Store.settings(this).optInt("cleanDays", 30))
        recThread = Thread { recordLoop() }.apply {
            priority = Thread.MAX_PRIORITY
            start()
        }
    }

    private fun recordLoop() {
        val rec = openRecorder()
        if (rec == null) {
            micError = true
            return
        }
        val an = Analyzer(SAMPLE_RATE)
        val det = Detector(sensDb(cfg.optString("sens", "media")))
        val pre = Preroll(SAMPLE_RATE * 3)
        val buf = ShortArray(FRAME)
        var clip: ClipWriter? = null
        var mSum = 0.0
        var mN = 0
        var mPeak = -200.0
        var mT0 = start
        var frames = 0L
        try {
            rec.startRecording()
            while (recording) {
                var read = 0
                while (read < FRAME && recording) {
                    val r = rec.read(buf, read, FRAME - read)
                    if (r <= 0) break
                    read += r
                }
                if (read <= 0) {
                    Thread.sleep(50)
                    continue
                }
                val now = System.currentTimeMillis()
                an.analyze(buf, read)
                val cw = clip
                if (cw != null && cw.add(buf, read)) {
                    clip = null
                    Thread { cw.write() }.start()
                }
                pre.add(buf, read)
                mSum += an.db; mN++
                if (an.db > mPeak) mPeak = an.db
                if (!ringing) {
                    det.step(an.db, an.lr, an.vr, now) { e ->
                        onEvent(e)
                        if (clip == null) clip = maybeClip(e, pre)
                    }
                }
                baseline = det.base
                inEvent = det.inEv
                level = if (det.ready) ((an.db - det.base) / 25.0).coerceIn(0.0, 1.0) else 0.0
                frames++
                if (frames % 5 == 0L) synchronized(wave) {
                    wave.addLast(level)
                    if (wave.size > 60) wave.removeFirst()
                }
                while (now - mT0 >= 60_000) {
                    flushMinute(mSum, mN, mPeak)
                    mSum = 0.0; mN = 0; mPeak = -200.0
                    mT0 = start + minutes.size * 60_000L
                }
                if (frames % 10 == 0L) checkAlarm(now)
            }
            det.flush(System.currentTimeMillis()) { e -> onEvent(e) }
            if (mN >= 100) flushMinute(mSum, mN, mPeak)
            clip?.write()
        } catch (_: Exception) {
            micError = true
        } finally {
            try { rec.stop() } catch (_: Exception) {}
            rec.release()
        }
    }

    private fun sensDb(s: String) = when (s) {
        "baja" -> 12.0
        "alta" -> 6.0
        else -> 9.0
    }

    private fun onEvent(e: Ev) {
        synchronized(events) { events.add(e) }
        counts[e.type] = (counts[e.type] ?: 0) + 1
    }

    private fun maybeClip(e: Ev, pre: Preroll): ClipWriter? {
        if (!cfg.optBoolean("saveClips", true)) return null
        if (e.type == "ruido" && e.p < 20) return null
        val (max, gap, len) = when (e.type) {
            "ronquido" -> Triple(15L, 8 * 60_000L, 8)
            "habla" -> Triple(10L, 2 * 60_000L, 12)
            "tos" -> Triple(6L, 5 * 60_000L, 6)
            "ruido" -> Triple(6L, 10 * 60_000L, 7)
            else -> return null
        }
        val st = clipState.getOrPut(e.type) { longArrayOf(0L, 0L) }
        val now = System.currentTimeMillis()
        if (st[0] >= max || now - st[1] < gap) return null
        st[0]++; st[1] = now
        val f = java.io.File(Store.clipsDir(this), "${id}_${e.t}_${e.type}.wav")
        return ClipWriter(f, pre.snapshot(), SAMPLE_RATE * len)
    }

    private fun flushMinute(sum: Double, n: Int, peak: Double) {
        val prev = synchronized(minutes) { minutes.lastOrNull() }
        val a = if (n > 0) sum / n else prev?.get(0) ?: -60.0
        val p = if (n > 0) peak else a
        synchronized(minutes) { minutes.add(doubleArrayOf(round1(a), round1(p))) }
        save("recording")
        updateRecNotif()
    }

    private fun checkAlarm(now: Long) {
        if (!alarmOn || ringing || wakeTs == 0L) return
        if (now >= wakeTs) {
            main.post { ring("Es tu hora") }
            return
        }
        if (win > 0 && now >= wakeTs - win * 60_000L) {
            var act = 0
            synchronized(events) {
                for (i in events.indices.reversed()) {
                    val e = events[i]
                    if (e.t < now - 3 * 60_000L) break
                    if (e.type != "ronquido" && e.type != "posible") act++
                }
            }
            if (act >= 2) main.post { ring("Estabas en sueño ligero") }
        }
    }

    fun onBackupAlarm() {
        if (ringing) return
        if (recording && System.currentTimeMillis() >= wakeTs - 2000) ring("Es tu hora")
    }

    /** Cambia la alarma mientras graba. */
    fun setAlarm(on: Boolean, ts: Long, w: Int, set: String) {
        alarmOn = on; wakeTs = ts; win = w; alarmSet = set
        if (on && ts > 0) scheduleBackup(ts) else cancelBackup()
        save("recording")
        updateRecNotif()
    }

    /* ---------------- Alarma ---------------- */

    @Synchronized
    private fun ring(why: String) {
        if (ringing) return
        ringing = true
        ringWhy = why
        if (rangAt == 0L) rangAt = System.currentTimeMillis()
        NoiseMixer.stop()
        val ramp = if (cfg.optBoolean("ramp", true)) 90 else 0
        AlarmPlayer.start(cfg.optString("alarmSound", "amanecer"), ramp)
        if (cfg.optBoolean("vibrate", true)) startVibration()
        nm.notify(Notif.N_ALARM, buildAlarmNotif(why))
        if (recording) save("recording")
    }

    private fun silence() {
        AlarmPlayer.stop()
        try { vib?.cancel() } catch (_: Exception) {}
        nm.cancel(Notif.N_ALARM)
    }

    fun snooze() {
        if (!ringing) return
        silence()
        ringing = false
        snoozes++
        val ms = cfg.optInt("snooze", 9) * 60_000L
        wakeTs = System.currentTimeMillis() + ms
        win = 0
        alarmOn = true
        scheduleBackup(wakeTs)
        if (recording) {
            save("recording")
            updateRecNotif()
        } else {
            main.postDelayed({ if (!ringing && ringOnly) ring("Es tu hora") }, ms)
        }
    }

    private fun startVibration() {
        val v: Vibrator? = if (Build.VERSION.SDK_INT >= 31) {
            getSystemService(VibratorManager::class.java)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
        vib = v
        try {
            val effect = VibrationEffect.createWaveform(longArrayOf(0, 600, 400, 600, 1600), 0)
            @Suppress("DEPRECATION")
            v?.vibrate(effect, AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build())
        } catch (_: Exception) {
        }
    }

    private fun backupIntent(): PendingIntent =
        PendingIntent.getBroadcast(this, 100, Intent(this, AlarmReceiver::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    private fun scheduleBackup(ts: Long) {
        val am = getSystemService(AlarmManager::class.java) ?: return
        val show = Notif.openApp(this, "recording", 101)
        try {
            am.setAlarmClock(AlarmManager.AlarmClockInfo(ts, show), backupIntent())
        } catch (_: SecurityException) {
            try {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ts, backupIntent())
            } catch (_: Exception) {
            }
        }
    }

    private fun cancelBackup() {
        try { getSystemService(AlarmManager::class.java)?.cancel(backupIntent()) } catch (_: Exception) {}
    }

    /* ---------------- Terminar ---------------- */

    @Synchronized
    fun stopNight(): String {
        val nid = if (ringOnly) "" else id
        silence()
        NoiseMixer.stop()
        cancelBackup()
        if (recording) {
            recording = false
            try { recThread?.join(4000) } catch (_: Exception) {}
            recThread = null
            endTs = System.currentTimeMillis()
            save("done")
        }
        ringing = false
        ringOnly = false
        try { wl?.release() } catch (_: Exception) {}
        wl = null
        main.post {
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
        }
        SleepWidget.refresh(this)
        return nid
    }

    /* ---------------- Datos ---------------- */

    private fun nightJson(status: String): JSONObject {
        val mins = JSONArray()
        synchronized(minutes) { for (m in minutes) mins.put(JSONArray().put(m[0]).put(m[1])) }
        val evs = JSONArray()
        synchronized(events) { for (e in events) evs.put(e.json()) }
        val o = JSONObject()
            .put("id", id)
            .put("start", start)
            .put("end", if (endTs > 0) endTs else JSONObject.NULL)
            .put("status", status)
            .put("minutes", mins)
            .put("events", evs)
            .put("baseline", if (baseline.isNaN()) JSONObject.NULL else round1(baseline))
            .put("sens", cfg.optString("sens", "media"))
            .put("goal", cfg.optDouble("goal", 8.0))
            .put("tags", cfg.optJSONArray("tags") ?: JSONArray())
            .put("aid", cfg.optJSONObject("aid") ?: JSONObject.NULL)
            .put("mood", JSONObject.NULL)
            .put("native", true)
        if (alarmOn || rangAt > 0) {
            o.put(
                "alarm", JSONObject()
                    .put("on", alarmOn).put("wakeTs", wakeTs).put("win", win).put("set", alarmSet)
                    .put("rangAt", if (rangAt > 0) rangAt else JSONObject.NULL)
                    .put("snoozes", snoozes)
            )
        } else {
            o.put("alarm", JSONObject.NULL)
        }
        return o
    }

    private fun save(status: String) {
        if (id.isEmpty()) return
        try {
            Store.saveNight(this, id, nightJson(status).toString())
        } catch (_: Exception) {
        }
    }

    fun live(): String {
        val w = JSONArray()
        synchronized(wave) { for (x in wave) w.put(round1(x * 10) / 10.0) }
        val c = JSONObject()
        for ((k, v) in counts) c.put(k, v)
        return JSONObject()
            .put("recording", recording)
            .put("ringing", ringing)
            .put("ringWhy", ringWhy)
            .put("ringOnly", ringOnly)
            .put("id", id)
            .put("start", start)
            .put("now", System.currentTimeMillis())
            .put("level", level)
            .put("inEvent", inEvent)
            .put("micError", micError)
            .put("minutes", minutes.size)
            .put("counts", c)
            .put("wave", w)
            .put("alarm", JSONObject().put("on", alarmOn).put("wakeTs", wakeTs).put("win", win).put("set", alarmSet))
            .put("sounds", NoiseMixer.stateJson())
            .toString()
    }

    /* ---------------- Notificaciones ---------------- */

    private fun icon() = Icon.createWithResource(this, R.drawable.ic_stat_moon)

    private fun alarmText(): String = when {
        !alarmOn || wakeTs == 0L -> "Sin alarma"
        win > 0 -> "Alarma entre ${Notif.hm(wakeTs - win * 60_000L)} y ${Notif.hm(wakeTs)}"
        else -> "Alarma a las ${Notif.hm(wakeTs)}"
    }

    private fun buildRecNotif(): Notification {
        val mins = minutes.size.toLong()
        return Notification.Builder(this, Notif.CH_REC)
            .setSmallIcon(R.drawable.ic_stat_moon)
            .setContentTitle("Grabando tu sueño")
            .setContentText("${alarmText()}. ${Notif.dur(mins)} grabados.")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .setContentIntent(Notif.openApp(this, "recording", 1))
            .addAction(Notification.Action.Builder(icon(), "Detener", Notif.openApp(this, "stop", 2)).build())
            .addAction(Notification.Action.Builder(icon(), "Cambiar alarma", Notif.openApp(this, "alarmedit", 3)).build())
            .build()
    }

    private fun updateRecNotif() {
        val now = System.currentTimeMillis()
        if (now - lastNotif < 30_000) return
        lastNotif = now
        if (recording) nm.notify(Notif.N_REC, buildRecNotif())
    }

    private fun buildRingOnlyNotif(): Notification =
        Notification.Builder(this, Notif.CH_REC)
            .setSmallIcon(R.drawable.ic_stat_moon)
            .setContentTitle("Alarma")
            .setContentText("Es hora de despertar")
            .setOngoing(true)
            .setContentIntent(Notif.openApp(this, "alarm", 4))
            .build()

    private fun buildSoundNotif(list: List<Pair<String, Double>>): Notification {
        val names = list.joinToString(", ") { soundName(it.first) }
        val stop = PendingIntent.getService(
            this, 5, Intent(this, SleepService::class.java).setAction(A_SOUNDS_STOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return Notification.Builder(this, Notif.CH_SOUND)
            .setSmallIcon(R.drawable.ic_stat_moon)
            .setContentTitle("Sonando: $names")
            .setContentText("Se apaga sola, bajando el volumen poco a poco.")
            .setOngoing(true)
            .setContentIntent(Notif.openApp(this, "relax", 6))
            .addAction(Notification.Action.Builder(icon(), "Detener", stop).build())
            .build()
    }

    private fun buildAlarmNotif(why: String): Notification {
        val snoozePi = PendingIntent.getService(
            this, 7, Intent(this, SleepService::class.java).setAction(A_SNOOZE),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val full = Notif.openApp(this, "alarm", 8)
        return Notification.Builder(this, Notif.CH_ALARM)
            .setSmallIcon(R.drawable.ic_stat_moon)
            .setContentTitle("Buenos días")
            .setContentText(why)
            .setCategory(Notification.CATEGORY_ALARM)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setFullScreenIntent(full, true)
            .setContentIntent(full)
            .addAction(Notification.Action.Builder(icon(), "Posponer ${cfg.optInt("snooze", 9)} min", snoozePi).build())
            .addAction(Notification.Action.Builder(icon(), "Despertar", Notif.openApp(this, "alarm", 9)).build())
            .build()
    }

    private fun soundName(t: String) = when (t) {
        "lluvia" -> "Lluvia"; "olas" -> "Olas"; "bosque" -> "Bosque"; "ventilador" -> "Ventilador"
        "fogata" -> "Fogata"; "viento" -> "Viento"; "cafe" -> "Ruido café"; "rosa" -> "Ruido rosa"
        "blanco" -> "Ruido blanco"; else -> t
    }
}
