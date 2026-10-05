package gt.calin.sueno

import android.Manifest
import android.app.Activity
import android.app.AlarmManager
import android.app.NotificationManager
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.MediaStore
import android.provider.Settings
import android.speech.tts.TextToSpeech
import android.util.Base64
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

const val HOST = "sueno.local"

class MainActivity : Activity() {
    lateinit var web: WebView
    private var tts: TextToSpeech? = null
    @Volatile var pendingRoute: String? = null
    val ui = Handler(Looper.getMainLooper())
    private var loaded = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Notif.ensure(this)
        val ink = Color.parseColor("#171A33")
        window.statusBarColor = ink
        window.navigationBarColor = ink
        web = WebView(this)
        web.setBackgroundColor(ink)
        setContentView(web)
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
            textZoom = 100
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val u = request.url
                if (u.host != HOST) return null
                return serve(u.path ?: "/")
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url
                if (u.host == HOST) return false
                try { startActivity(Intent(Intent.ACTION_VIEW, u)) } catch (_: Exception) {}
                return true
            }

            override fun onPageFinished(view: WebView, url: String) {
                loaded = true
            }
        }
        web.webChromeClient = WebChromeClient()
        web.addJavascriptInterface(Bridge(this), "Android")
        handleIntent(intent)
        web.loadUrl("https://$HOST/index.html")
        tts = TextToSpeech(this) { st ->
            if (st == TextToSpeech.SUCCESS) {
                val t = tts
                if (t != null) {
                    val r = t.setLanguage(Locale("es", "MX"))
                    if (r < 0) t.setLanguage(Locale("es"))
                    t.setSpeechRate(0.85f)
                }
            }
        }
        Reminder.schedule(this)
    }

    private fun serve(path: String): WebResourceResponse? {
        return try {
            val p = if (path == "/" || path.isEmpty()) "index.html" else path.removePrefix("/")
            val mime = when (p.substringAfterLast('.')) {
                "html" -> "text/html"
                "js" -> "application/javascript"
                "css" -> "text/css"
                "ttf" -> "font/ttf"
                "png" -> "image/png"
                "svg" -> "image/svg+xml"
                "json" -> "application/json"
                else -> "application/octet-stream"
            }
            WebResourceResponse(mime, "utf-8", assets.open("www/$p"))
        } catch (_: Exception) {
            null
        }
    }

    private fun handleIntent(i: Intent?) {
        val r = i?.getStringExtra("route") ?: return
        i.removeExtra("route")
        val alarm = r == "alarm"
        setShowWhenLocked(alarm)
        setTurnScreenOn(alarm)
        if (alarm) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        pendingRoute = r
        if (loaded) js("window.onRoute&&window.onRoute(${JSONObject.quote(r)})")
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        if (loaded) js("window.onResumeApp&&window.onResumeApp()")
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        web.evaluateJavascript("window.onBack?window.onBack():false") { r ->
            if (r != "true") moveTaskToBack(true)
        }
    }

    override fun onDestroy() {
        tts?.shutdown()
        super.onDestroy()
    }

    fun js(code: String) {
        ui.post { web.evaluateJavascript(code, null) }
    }

    fun clearAlarmFlags() {
        ui.post {
            setShowWhenLocked(false)
            setTurnScreenOn(false)
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    fun keepScreenOn(on: Boolean) {
        ui.post {
            if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    fun speak(text: String) {
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "sueno")
    }

    fun stopSpeak() {
        tts?.stop()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        js("window.onPerms&&window.onPerms()")
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 9 && resultCode == RESULT_OK) {
            val uri = data?.data ?: return
            try {
                val text = contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() } ?: return
                js("window.onImport&&window.onImport(${JSONObject.quote(text)})")
            } catch (_: Exception) {
                js("window.onImport&&window.onImport(null)")
            }
        }
    }

    fun pickImport() {
        ui.post {
            val i = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
            @Suppress("DEPRECATION")
            startActivityForResult(i, 9)
        }
    }
}

class Bridge(private val a: MainActivity) {
    private val ctx get() = a.applicationContext

    private fun granted(p: String) = a.checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED

    @JavascriptInterface fun platform(): String = "android"

    @JavascriptInterface fun takeRoute(): String {
        val r = a.pendingRoute ?: ""
        a.pendingRoute = null
        return r
    }

    /* Ajustes */
    @JavascriptInterface fun getSettings(): String = Store.settingsJson(ctx)

    @JavascriptInterface fun setSettings(json: String) {
        Store.saveSettings(ctx, json)
        Reminder.schedule(ctx)
        SleepWidget.refresh(ctx)
    }

    /* Noches */
    @JavascriptInterface fun listNights(): String = Store.listNights(ctx)
    @JavascriptInterface fun getNight(id: String): String = Store.readNight(ctx, id) ?: ""

    @JavascriptInterface fun saveNight(json: String) {
        try {
            val o = JSONObject(json)
            Store.saveNight(ctx, o.getString("id"), json)
            SleepWidget.refresh(ctx)
        } catch (_: Exception) {
        }
    }

    @JavascriptInterface fun deleteNight(id: String) {
        Store.deleteNight(ctx, id)
        SleepWidget.refresh(ctx)
    }

    @JavascriptInterface fun deleteAll() {
        Store.deleteAll(ctx)
        SleepWidget.refresh(ctx)
    }

    @JavascriptInterface fun clips(id: String): String = Store.clips(ctx, id)

    @JavascriptInterface fun clipData(name: String): String {
        val f = Store.clipFile(ctx, name) ?: return ""
        return "data:audio/wav;base64," + Base64.encodeToString(f.readBytes(), Base64.NO_WRAP)
    }

    @JavascriptInterface fun deleteClip(name: String) = Store.deleteClip(ctx, name)

    /* Grabación */
    @JavascriptInterface fun startNight(cfg: String): String {
        if (!granted(Manifest.permission.RECORD_AUDIO)) return "perm"
        return try {
            val i = Intent(ctx, SleepService::class.java).setAction(SleepService.A_START).putExtra("cfg", cfg)
            ctx.startForegroundService(i)
            "ok"
        } catch (e: Exception) {
            "error:" + e.message
        }
    }

    @JavascriptInterface fun stopNight(): String {
        val id = SleepService.instance?.stopNight() ?: ""
        a.clearAlarmFlags()
        return id
    }

    @JavascriptInterface fun live(): String = SleepService.liveJson()

    @JavascriptInterface fun snooze() {
        SleepService.instance?.snooze()
    }

    @JavascriptInterface fun setAlarm(json: String) {
        try {
            val o = JSONObject(json)
            SleepService.instance?.setAlarm(o.optBoolean("on"), o.optLong("wakeTs"), o.optInt("win"), o.optString("set"))
        } catch (_: Exception) {
        }
    }

    @JavascriptInterface fun keepScreenOn(on: Boolean) = a.keepScreenOn(on)

    /* Sonidos */
    @JavascriptInterface fun playSounds(json: String, minutes: Int) {
        try {
            val i = Intent(ctx, SleepService::class.java).setAction(SleepService.A_SOUNDS)
                .putExtra("sounds", json).putExtra("minutes", minutes)
            ctx.startForegroundService(i)
        } catch (_: Exception) {
        }
    }

    @JavascriptInterface fun setSoundVolume(type: String, vol: Double) = NoiseMixer.setVolume(type, vol)

    @JavascriptInterface fun stopSounds() {
        if (SleepService.instance != null) {
            try {
                ctx.startService(Intent(ctx, SleepService::class.java).setAction(SleepService.A_SOUNDS_STOP))
            } catch (_: Exception) {
                NoiseMixer.stop()
            }
        } else {
            NoiseMixer.stop()
        }
    }

    @JavascriptInterface fun soundsState(): String = NoiseMixer.stateJson().toString()

    @JavascriptInterface fun previewAlarm(name: String) = AlarmPlayer.start(name, 0, 4)
    @JavascriptInterface fun stopPreview() = AlarmPlayer.stop()

    /* Prueba de micrófono */
    @JavascriptInterface fun testMic(on: Boolean, sens: String): String {
        if (!on) {
            MicTest.stop(); return "ok"
        }
        if (!granted(Manifest.permission.RECORD_AUDIO)) return "perm"
        MicTest.start(when (sens) { "baja" -> 12.0; "alta" -> 6.0; else -> 9.0 })
        return "ok"
    }

    @JavascriptInterface fun testState(): String = MicTest.state()

    /* Permisos */
    @JavascriptInterface fun perms(): String {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        val am = ctx.getSystemService(AlarmManager::class.java)
        val pm = ctx.getSystemService(PowerManager::class.java)
        val o = JSONObject()
        o.put("mic", granted(Manifest.permission.RECORD_AUDIO))
        o.put("notif", if (Build.VERSION.SDK_INT >= 33) granted(Manifest.permission.POST_NOTIFICATIONS) else nm?.areNotificationsEnabled() ?: true)
        o.put("exact", if (Build.VERSION.SDK_INT >= 31) am?.canScheduleExactAlarms() ?: true else true)
        o.put("battery", pm?.isIgnoringBatteryOptimizations(ctx.packageName) ?: false)
        o.put("fullscreen", if (Build.VERSION.SDK_INT >= 34) nm?.canUseFullScreenIntent() ?: true else true)
        return o.toString()
    }

    @JavascriptInterface fun requestPerm(name: String) {
        a.ui.post {
            try {
                when (name) {
                    "mic" -> {
                        val list = ArrayList<String>()
                        list.add(Manifest.permission.RECORD_AUDIO)
                        if (Build.VERSION.SDK_INT >= 33) list.add(Manifest.permission.POST_NOTIFICATIONS)
                        a.requestPermissions(list.toTypedArray(), 7)
                    }
                    "notif" -> {
                        if (Build.VERSION.SDK_INT >= 33 && !a.shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS) &&
                            a.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                        ) {
                            a.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 8)
                        } else {
                            a.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, a.packageName))
                        }
                    }
                    "battery" -> a.startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${a.packageName}")))
                    "exact" -> if (Build.VERSION.SDK_INT >= 31) a.startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${a.packageName}")))
                    "fullscreen" -> if (Build.VERSION.SDK_INT >= 34) a.startActivity(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${a.packageName}")))
                    "app" -> a.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${a.packageName}")))
                }
            } catch (_: Exception) {
                try {
                    a.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${a.packageName}")))
                } catch (_: Exception) {
                }
            }
        }
    }

    /* Extras */
    @JavascriptInterface fun vibrate(ms: Int) {
        try {
            val v: Vibrator? = if (Build.VERSION.SDK_INT >= 31) {
                ctx.getSystemService(VibratorManager::class.java)?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                ctx.getSystemService(android.content.Context.VIBRATOR_SERVICE) as? Vibrator
            }
            v?.vibrate(VibrationEffect.createOneShot(ms.toLong().coerceIn(10, 2000), VibrationEffect.DEFAULT_AMPLITUDE))
        } catch (_: Exception) {
        }
    }

    @JavascriptInterface fun speak(text: String) = a.speak(text)
    @JavascriptInterface fun stopSpeak() = a.stopSpeak()

    @JavascriptInterface fun toast(msg: String) {
        a.ui.post { Toast.makeText(a, msg, Toast.LENGTH_SHORT).show() }
    }

    @JavascriptInterface fun exportBackup(json: String): String {
        return try {
            val name = "sueno-respaldo-${System.currentTimeMillis()}.json"
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                put(MediaStore.MediaColumns.MIME_TYPE, "application/json")
                put(MediaStore.MediaColumns.RELATIVE_PATH, "Download")
            }
            val uri = ctx.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return ""
            ctx.contentResolver.openOutputStream(uri)?.use { it.write(json.toByteArray()) }
            name
        } catch (_: Exception) {
            ""
        }
    }

    @JavascriptInterface fun importBackup() = a.pickImport()

    @JavascriptInterface fun shareImage(dataUrl: String) {
        try {
            val b64 = dataUrl.substringAfter("base64,")
            val bytes = Base64.decode(b64, Base64.DEFAULT)
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, "sueno-${System.currentTimeMillis()}.png")
                put(MediaStore.MediaColumns.MIME_TYPE, "image/png")
                put(MediaStore.MediaColumns.RELATIVE_PATH, "Pictures/Sueno")
            }
            val uri = ctx.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: return
            ctx.contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
            val send = Intent(Intent.ACTION_SEND).setType("image/png").putExtra(Intent.EXTRA_STREAM, uri)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            a.ui.post { a.startActivity(Intent.createChooser(send, "Compartir mi noche")) }
        } catch (_: Exception) {
            toast("No se pudo compartir")
        }
    }

    @JavascriptInterface fun refreshWidget() = SleepWidget.refresh(ctx)

    @JavascriptInterface fun alarmSounds(): String = JSONArray(AlarmPlayer.sounds).toString()
}
