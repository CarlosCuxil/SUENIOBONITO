package gt.calin.sueno

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

const val SAMPLE_RATE = 16000
const val FRAME = 1600 // 100 ms

fun round1(v: Double): Double = (v * 10).roundToInt() / 10.0

/** Un sonido detectado durante la noche. */
class Ev(val t: Long, val d: Double, val p: Double, @Volatile var type: String) {
    fun json(): JSONObject = JSONObject().put("t", t).put("d", d).put("p", p).put("type", type)
}

/** Nivel en dB y reparto de energía por bandas de cada cuadro de 100 ms. */
class Analyzer(sampleRate: Int) {
    private val n = 1024
    private val re = DoubleArray(n)
    private val im = DoubleArray(n)
    private val win = DoubleArray(n) { 0.5 - 0.5 * cos(2 * PI * it / (n - 1)) }
    private val hz = sampleRate.toDouble() / n
    private fun bin(f: Double): Int = min(n / 2 - 1, (f / hz).roundToInt())
    private val b60 = bin(60.0)
    private val b300 = bin(300.0)
    private val b500 = bin(500.0)
    private val b3k = bin(3000.0)
    private val b8k = bin(7900.0)

    var db = -100.0
    var lr = 0.0
    var vr = 0.0

    fun analyze(buf: ShortArray, len: Int) {
        var sum = 0.0
        for (i in 0 until len) {
            val s = buf[i] / 32768.0
            sum += s * s
        }
        db = 20 * log10(sqrt(sum / max(1, len)) + 1e-9)
        val off = max(0, len - n)
        for (i in 0 until n) {
            val s = if (off + i < len) buf[off + i] / 32768.0 else 0.0
            re[i] = s * win[i]
            im[i] = 0.0
        }
        fft(re, im)
        var low = 0.0
        var voice = 0.0
        var tot = 0.0
        for (i in b60..b8k) {
            val p = re[i] * re[i] + im[i] * im[i]
            tot += p
            if (i <= b500) low += p
            if (i in b300..b3k) voice += p
        }
        lr = if (tot > 0) low / tot else 0.0
        vr = if (tot > 0) voice / tot else 0.0
    }

    private fun fft(x: DoubleArray, y: DoubleArray) {
        val size = x.size
        var j = 0
        for (i in 1 until size) {
            var bit = size shr 1
            while (j and bit != 0) {
                j = j xor bit
                bit = bit shr 1
            }
            j = j xor bit
            if (i < j) {
                var t = x[i]; x[i] = x[j]; x[j] = t
                t = y[i]; y[i] = y[j]; y[j] = t
            }
        }
        var len = 2
        while (len <= size) {
            val ang = -2 * PI / len
            val wr = cos(ang)
            val wi = sin(ang)
            var i = 0
            while (i < size) {
                var cr = 1.0
                var ci = 0.0
                for (k in 0 until len / 2) {
                    val a = i + k
                    val b = a + len / 2
                    val tr = x[b] * cr - y[b] * ci
                    val ti = x[b] * ci + y[b] * cr
                    x[b] = x[a] - tr
                    y[b] = y[a] - ti
                    x[a] += tr
                    y[a] += ti
                    val ncr = cr * wr - ci * wi
                    ci = cr * wi + ci * wr
                    cr = ncr
                }
                i += len
            }
            len = len shl 1
        }
    }
}

/** Sigue el ruido de fondo y clasifica cada sonido que sobresale. */
class Detector(var sensDb: Double) {
    var base = Double.NaN
        private set
    private val warm = ArrayList<Double>()
    private var above = 0
    private var below = 0
    var inEv = false
        private set
    private var evStart = 0L
    private var evPeak = 0.0
    private var evLr = 0.0
    private var evVr = 0.0
    private var evN = 0
    private var lastCand: Ev? = null
    var level = -100.0
        private set
    val ready: Boolean get() = !base.isNaN()

    fun step(db: Double, lr: Double, vr: Double, now: Long, onEvent: (Ev) -> Unit) {
        level = db
        if (base.isNaN()) {
            warm.add(db)
            if (warm.size >= 30) base = warm.sorted()[warm.size / 2]
            return
        }
        val thr = base + sensDb
        if (!inEv) {
            if (db < base) base += 0.1 * (db - base)
            else if (db < thr) base += 0.003 * (db - base)
        }
        if (db > thr) {
            above++; below = 0
        } else {
            below++; above = 0
        }
        if (!inEv && above >= 3) {
            inEv = true
            evStart = now - 300
            evPeak = db; evLr = 0.0; evVr = 0.0; evN = 0
        }
        if (inEv) {
            evPeak = max(evPeak, db); evLr += lr; evVr += vr; evN++
            if (below >= 5) finish(now - 500, onEvent)
            else if (now - evStart > 30_000) finish(now, onEvent)
        }
    }

    fun flush(now: Long, onEvent: (Ev) -> Unit) {
        if (inEv) finish(now, onEvent)
    }

    private fun finish(end: Long, onEvent: (Ev) -> Unit) {
        inEv = false
        if (evN == 0) return
        val dur = (end - evStart) / 1000.0
        val lr = evLr / evN
        val vr = evVr / evN
        val rise = evPeak - base
        val type = when {
            dur in 0.3..4.0 && lr >= 0.55 -> {
                // Los ronquidos se repiten con cada respiración (cada 1.5–10 s)
                val last = lastCand
                val gap = if (last != null) evStart - last.t else 0L
                if (last != null && gap in 1500L..10_000L) {
                    if (last.type == "posible") last.type = "ronquido"
                    "ronquido"
                } else "posible"
            }
            dur in 0.8..10.0 && vr >= 0.55 && lr < 0.5 -> "habla"
            dur < 0.8 && rise >= 18 -> "tos"
            dur < 3 -> "movimiento"
            else -> "ruido"
        }
        val e = Ev(evStart, round1(dur), round1(rise), type)
        if (type == "posible" || type == "ronquido") lastCand = e
        onEvent(e)
    }
}

/** Guarda los últimos segundos de audio para que los clips incluyan el inicio del sonido. */
class Preroll(private val size: Int) {
    private val data = ShortArray(size)
    private var pos = 0
    private var filled = false

    fun add(buf: ShortArray, len: Int) {
        for (i in 0 until len) {
            data[pos] = buf[i]
            pos++
            if (pos == size) {
                pos = 0; filled = true
            }
        }
    }

    fun snapshot(): ShortArray {
        if (!filled) return data.copyOf(pos)
        val out = ShortArray(size)
        System.arraycopy(data, pos, out, 0, size - pos)
        System.arraycopy(data, 0, out, size - pos, pos)
        return out
    }
}

class ClipWriter(private val file: File, preroll: ShortArray, afterSamples: Int) {
    private val data = ShortArray(preroll.size + afterSamples)
    private var pos = preroll.size

    init {
        System.arraycopy(preroll, 0, data, 0, preroll.size)
    }

    /** Devuelve true cuando el clip está completo. */
    fun add(buf: ShortArray, len: Int): Boolean {
        val n = min(len, data.size - pos)
        if (n > 0) System.arraycopy(buf, 0, data, pos, n)
        pos += max(0, n)
        return pos >= data.size
    }

    fun write() {
        try {
            writeWav(file, data, pos, SAMPLE_RATE)
        } catch (_: Exception) {
        }
    }
}

fun writeWav(file: File, data: ShortArray, count: Int, sr: Int) {
    val bytes = count * 2
    val hdr = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
    hdr.put("RIFF".toByteArray()); hdr.putInt(36 + bytes); hdr.put("WAVE".toByteArray())
    hdr.put("fmt ".toByteArray()); hdr.putInt(16); hdr.putShort(1); hdr.putShort(1)
    hdr.putInt(sr); hdr.putInt(sr * 2); hdr.putShort(2); hdr.putShort(16)
    hdr.put("data".toByteArray()); hdr.putInt(bytes)
    val body = ByteBuffer.allocate(bytes).order(ByteOrder.LITTLE_ENDIAN)
    for (i in 0 until count) body.putShort(data[i])
    FileOutputStream(file).use {
        it.write(hdr.array())
        it.write(body.array())
    }
}

fun openRecorder(): AudioRecord? {
    val minBuf = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
    val size = max(minBuf, FRAME * 2) * 4
    for (src in intArrayOf(MediaRecorder.AudioSource.VOICE_RECOGNITION, MediaRecorder.AudioSource.MIC)) {
        try {
            @Suppress("MissingPermission")
            val r = AudioRecord(src, SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, size)
            if (r.state == AudioRecord.STATE_INITIALIZED) return r
            r.release()
        } catch (_: Exception) {
        }
    }
    return null
}

/** Prueba de micrófono desde Ajustes. */
object MicTest {
    @Volatile private var running = false
    private var thread: Thread? = null
    @Volatile var level = 0.0
    @Volatile var ready = false
    @Volatile var lastType = ""
    @Volatile var lastDur = 0.0
    @Volatile var lastAt = 0L
    @Volatile var error = false

    fun start(sens: Double) {
        if (running) return
        running = true; ready = false; lastType = ""; error = false; level = 0.0
        thread = Thread {
            val rec = openRecorder()
            if (rec == null) {
                error = true; running = false
                return@Thread
            }
            val an = Analyzer(SAMPLE_RATE)
            val det = Detector(sens)
            val buf = ShortArray(FRAME)
            try {
                rec.startRecording()
                while (running) {
                    val r = rec.read(buf, 0, FRAME)
                    if (r <= 0) continue
                    an.analyze(buf, r)
                    det.step(an.db, an.lr, an.vr, System.currentTimeMillis()) { e ->
                        lastType = e.type; lastDur = e.d; lastAt = System.currentTimeMillis()
                    }
                    ready = det.ready
                    level = if (det.ready) ((an.db - det.base) / 30).coerceIn(0.0, 1.0) else 0.0
                }
            } catch (_: Exception) {
                error = true
            } finally {
                try { rec.stop() } catch (_: Exception) {}
                rec.release()
            }
        }.apply { start() }
    }

    fun stop() {
        running = false
        thread = null
    }

    fun state(): String = JSONObject()
        .put("running", running).put("ready", ready).put("level", level)
        .put("type", lastType).put("dur", lastDur).put("at", lastAt).put("error", error)
        .toString()
}
