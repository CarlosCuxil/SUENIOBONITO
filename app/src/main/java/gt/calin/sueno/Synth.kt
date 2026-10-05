package gt.calin.sueno

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import org.json.JSONArray
import org.json.JSONObject
import java.util.Random
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

private fun buildTrack(sr: Int, usage: Int): AudioTrack {
    val minBuf = AudioTrack.getMinBufferSize(sr, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
    val attrs = AudioAttributes.Builder()
        .setUsage(usage)
        .setContentType(if (usage == AudioAttributes.USAGE_ALARM) AudioAttributes.CONTENT_TYPE_SONIFICATION else AudioAttributes.CONTENT_TYPE_MUSIC)
        .build()
    val fmt = AudioFormat.Builder()
        .setSampleRate(sr)
        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
        .build()
    return AudioTrack.Builder()
        .setAudioAttributes(attrs)
        .setAudioFormat(fmt)
        .setBufferSizeInBytes(max(minBuf, sr))
        .setTransferMode(AudioTrack.MODE_STREAM)
        .build()
}

/** Genera un sonido ambiente muestra por muestra. */
class Gen(val type: String, private val sr: Int) {
    private val rnd = Random()
    private var b0 = 0.0; private var b1 = 0.0; private var b2 = 0.0; private var b3 = 0.0
    private var b4 = 0.0; private var b5 = 0.0; private var b6 = 0.0
    private var brown = 0.0
    private var hpPrev = 0.0; private var hpOut = 0.0
    private var lp = 0.0
    private var t = 0L
    private var drop = 0.0
    private var crack = 0.0
    private var chirpT = -1.0
    private var chirpF = 0.0
    private var nextChirp = sr * 3L

    private fun white() = rnd.nextDouble() * 2 - 1

    private fun pink(w: Double): Double {
        b0 = 0.99886 * b0 + w * 0.0555179
        b1 = 0.99332 * b1 + w * 0.0750759
        b2 = 0.96900 * b2 + w * 0.1538520
        b3 = 0.86650 * b3 + w * 0.3104856
        b4 = 0.55000 * b4 + w * 0.5329522
        b5 = -0.7616 * b5 - w * 0.0168980
        val o = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362
        b6 = w * 0.115926
        return o * 0.11
    }

    private fun brownN(w: Double): Double {
        brown = (brown + 0.02 * w) / 1.02
        return brown * 3.5
    }

    fun next(): Double {
        t++
        val w = white()
        val sec = t.toDouble() / sr
        return when (type) {
            "blanco" -> w * 0.2
            "rosa" -> pink(w)
            "cafe" -> brownN(w)
            "lluvia" -> {
                val p = pink(w)
                val hp = 0.97 * (hpOut + p - hpPrev)
                hpPrev = p; hpOut = hp
                if (rnd.nextDouble() < 0.0009) drop = 0.5 + rnd.nextDouble() * 0.4
                drop *= 0.993
                hp * 0.9 + white() * drop * 0.35
            }
            "olas" -> {
                val s = 0.5 + 0.5 * sin(2 * PI * sec / 9.0)
                val sw = s * s
                brownN(w) * (0.25 + 0.75 * sw) + pink(w) * 0.25 * sw
            }
            "viento" -> {
                val c = 0.02 + 0.06 * (0.5 + 0.5 * sin(2 * PI * sec / 13.0)) * (0.6 + 0.4 * sin(2 * PI * sec / 5.3))
                lp += c * (pink(w) * 3 - lp)
                lp * 0.45
            }
            "ventilador" -> {
                lp += 0.15 * (w - lp)
                brownN(w) * 0.55 + lp * 0.35 + sin(2 * PI * 118 * sec) * 0.02
            }
            "bosque" -> {
                lp += 0.08 * (pink(w) * 2 - lp)
                var o = lp * 0.5
                if (t >= nextChirp) {
                    chirpT = 0.0
                    chirpF = 2600 + rnd.nextDouble() * 1600
                    nextChirp = t + (sr * (2 + rnd.nextDouble() * 6)).toLong()
                }
                if (chirpT >= 0) {
                    chirpT += 1.0 / sr
                    val d = chirpT
                    if (d > 0.5) chirpT = -1.0 else {
                        val seg = (d * 8).toInt()
                        val ld = d * 8 - seg
                        val env = sin(PI * ld) * max(0.0, 1 - d * 1.6)
                        o += sin(2 * PI * (chirpF + 900 * ld) * d) * env * 0.1
                    }
                }
                o
            }
            "fogata" -> {
                val br = brownN(w)
                lp += 0.05 * (br - lp)
                if (rnd.nextDouble() < 0.0012) crack = 0.8 * rnd.nextDouble()
                crack *= 0.92
                br * 0.45 + lp * 0.3 + white() * crack * 0.5
            }
            else -> 0.0
        }
    }
}

/** Mezcla hasta 3 sonidos para dormir, con temporizador y salida suave. */
object NoiseMixer {
    private const val SR = 22050

    private class Layer(val gen: Gen, @Volatile var vol: Double)

    private val layers = java.util.concurrent.CopyOnWriteArrayList<Layer>()
    @Volatile private var running = false
    @Volatile private var thread: Thread? = null
    @Volatile var endAt = 0L
        private set
    var onEnded: (() -> Unit)? = null

    fun play(list: List<Pair<String, Double>>, minutes: Int) {
        layers.clear()
        list.take(3).forEach { layers.add(Layer(Gen(it.first, SR), it.second)) }
        endAt = if (minutes > 0) System.currentTimeMillis() + minutes * 60_000L else 0L
        if (!running) {
            running = true
            thread = Thread { loop() }.apply {
                priority = Thread.MAX_PRIORITY
                start()
            }
        }
    }

    fun setVolume(type: String, v: Double) {
        layers.find { it.gen.type == type }?.vol = v
    }

    fun isPlaying() = running

    fun stop() {
        running = false
        val th = thread
        if (th != null && th != Thread.currentThread()) {
            try { th.join(600) } catch (_: Exception) {}
        }
        thread = null
        layers.clear()
        endAt = 0L
    }

    private fun loop() {
        val track = try { buildTrack(SR, AudioAttributes.USAGE_MEDIA) } catch (_: Exception) { running = false; return }
        track.play()
        val buf = ShortArray(1024)
        var fade = 0.0
        try {
            while (running) {
                val now = System.currentTimeMillis()
                var master = 1.0
                if (endAt > 0) {
                    val left = endAt - now
                    if (left <= 0) break
                    if (left < 120_000) master = left / 120_000.0
                }
                val ls = layers.toTypedArray()
                for (i in buf.indices) {
                    var s = 0.0
                    for (l in ls) s += l.gen.next() * l.vol
                    fade = min(1.0, fade + 1.0 / (SR * 2))
                    val v = (s * master * fade).coerceIn(-1.0, 1.0)
                    buf[i] = (v * 32767).toInt().toShort()
                }
                track.write(buf, 0, buf.size)
            }
        } catch (_: Exception) {
        } finally {
            try { track.stop() } catch (_: Exception) {}
            track.release()
        }
        val ended = running
        running = false
        layers.clear()
        endAt = 0L
        if (ended) onEnded?.invoke()
    }

    fun stateJson(): JSONObject {
        val arr = JSONArray()
        for (l in layers) arr.put(JSONObject().put("type", l.gen.type).put("vol", l.vol))
        return JSONObject()
            .put("playing", running)
            .put("layers", arr)
            .put("left", if (endAt > 0) max(0L, endAt - System.currentTimeMillis()) else 0L)
    }
}

/** Tonos de alarma sintetizados, con volumen que sube poco a poco. */
object AlarmPlayer {
    private const val SR = 22050
    @Volatile private var running = false
    @Volatile private var thread: Thread? = null

    val sounds = listOf("amanecer", "campanas", "pajaros", "clasica")

    fun start(sound: String, rampSec: Int, maxSeconds: Int = 0) {
        stop()
        running = true
        thread = Thread { loop(sound, rampSec, maxSeconds) }.apply {
            priority = Thread.MAX_PRIORITY
            start()
        }
    }

    fun stop() {
        running = false
        val th = thread
        if (th != null && th != Thread.currentThread()) {
            try { th.join(600) } catch (_: Exception) {}
        }
        thread = null
    }

    private fun note(f: Double, dt: Double, decay: Double): Double {
        if (dt < 0) return 0.0
        val att = min(1.0, dt / 0.03)
        return sin(2 * PI * f * dt) * att * exp(-dt * decay)
    }

    private fun bell(f: Double, dt: Double): Double {
        if (dt < 0) return 0.0
        val att = min(1.0, dt / 0.005)
        return att * (sin(2 * PI * f * dt) * exp(-dt * 1.8) +
            0.5 * sin(2 * PI * f * 2.76 * dt) * exp(-dt * 4.0) +
            0.25 * sin(2 * PI * f * 5.4 * dt) * exp(-dt * 7.0))
    }

    fun sample(sound: String, t: Double): Double {
        when (sound) {
            "campanas" -> {
                val c = t % 3.0
                return (bell(783.99, c) + bell(659.25, c - 0.75) + bell(587.33, c - 1.5)) * 0.22
            }
            "pajaros" -> {
                val c = t % 2.4
                var o = 0.0
                for (s in doubleArrayOf(0.0, 0.22, 0.44, 1.2)) {
                    val d = c - s
                    if (d in 0.0..0.14) {
                        val f = 2500 + (d / 0.14) * 1400
                        o += sin(2 * PI * f * d) * sin(PI * d / 0.14)
                    }
                }
                return o * 0.35
            }
            "clasica" -> {
                val c = t % 1.6
                var o = 0.0
                for (s in doubleArrayOf(0.0, 0.2, 0.4, 0.6)) {
                    val d = c - s
                    if (d in 0.0..0.12) o += (sin(2 * PI * 880 * d) + 0.3 * sin(2 * PI * 2640 * d))
                }
                return o * 0.35
            }
            else -> {
                val c = t % 3.6
                val notes = doubleArrayOf(523.25, 659.25, 783.99, 987.77, 1046.5)
                var o = 0.0
                for (i in notes.indices) o += note(notes[i], c - i * 0.32, 3.0)
                return o * 0.28
            }
        }
    }

    private fun loop(sound: String, rampSec: Int, maxSeconds: Int) {
        val track = try { buildTrack(SR, AudioAttributes.USAGE_ALARM) } catch (_: Exception) { running = false; return }
        track.play()
        val buf = ShortArray(1024)
        var n = 0L
        try {
            while (running) {
                for (i in buf.indices) {
                    val t = n.toDouble() / SR
                    val gain = if (rampSec > 0) min(1.0, 0.04 + t / rampSec) else 1.0
                    val v = (sample(sound, t) * 2.0 * gain).coerceIn(-1.0, 1.0)
                    buf[i] = (v * 32767).toInt().toShort()
                    n++
                }
                track.write(buf, 0, buf.size)
                if (maxSeconds > 0 && n > maxSeconds.toLong() * SR) break
            }
        } catch (_: Exception) {
        } finally {
            try { track.stop() } catch (_: Exception) {}
            track.release()
            running = false
        }
    }
}
