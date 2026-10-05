package gt.calin.sueno

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** Guarda noches (JSON), audios (WAV) y ajustes en el almacenamiento privado de la app. */
object Store {
    private const val PREFS = "sueno"

    fun nightsDir(ctx: Context): File = File(ctx.applicationContext.filesDir, "nights").apply { mkdirs() }
    fun clipsDir(ctx: Context): File = File(ctx.applicationContext.filesDir, "clips").apply { mkdirs() }

    @Synchronized
    fun saveNight(ctx: Context, id: String, json: String) {
        val dir = nightsDir(ctx)
        val tmp = File(dir, "$id.tmp")
        val f = File(dir, "$id.json")
        tmp.writeText(json)
        if (!tmp.renameTo(f)) {
            f.writeText(json)
            tmp.delete()
        }
    }

    fun readNight(ctx: Context, id: String): String? {
        val f = File(nightsDir(ctx), "$id.json")
        return if (f.exists()) f.readText() else null
    }

    private fun nightFiles(ctx: Context): List<File> =
        (nightsDir(ctx).listFiles { f -> f.name.endsWith(".json") } ?: emptyArray()).sortedByDescending { it.name }

    /** Lista ligera: sin minutos ni eventos. */
    fun listNights(ctx: Context): String {
        val arr = JSONArray()
        for (f in nightFiles(ctx)) {
            try {
                val o = JSONObject(f.readText())
                o.remove("minutes")
                o.remove("events")
                arr.put(o)
            } catch (_: Exception) {
            }
        }
        return arr.toString()
    }

    fun latestDone(ctx: Context): JSONObject? {
        for (f in nightFiles(ctx)) {
            try {
                val o = JSONObject(f.readText())
                if (o.optString("status") == "done" && o.has("summary")) return o
            } catch (_: Exception) {
            }
        }
        return null
    }

    @Synchronized
    fun deleteNight(ctx: Context, id: String) {
        File(nightsDir(ctx), "$id.json").delete()
        clipsDir(ctx).listFiles()?.filter { it.name.startsWith("${id}_") }?.forEach { it.delete() }
    }

    fun deleteAll(ctx: Context) {
        nightsDir(ctx).listFiles()?.forEach { it.delete() }
        clipsDir(ctx).listFiles()?.forEach { it.delete() }
    }

    /** Audios de una noche. Nombre del archivo: <noche>_<tiempo>_<tipo>.wav */
    fun clips(ctx: Context, id: String): String {
        val arr = JSONArray()
        val files = clipsDir(ctx).listFiles()?.filter { it.name.startsWith("${id}_") && it.name.endsWith(".wav") } ?: emptyList()
        for (f in files.sortedBy { it.name }) {
            val parts = f.name.removeSuffix(".wav").split("_")
            if (parts.size < 3) continue
            arr.put(
                JSONObject()
                    .put("id", f.name)
                    .put("t", parts[1].toLongOrNull() ?: 0L)
                    .put("kind", parts[2])
                    .put("size", f.length())
            )
        }
        return arr.toString()
    }

    fun clipFile(ctx: Context, name: String): File? {
        val safe = name.replace("/", "").replace("..", "")
        val f = File(clipsDir(ctx), safe)
        return if (f.exists()) f else null
    }

    fun deleteClip(ctx: Context, name: String) {
        clipFile(ctx, name)?.delete()
    }

    fun cleanOldClips(ctx: Context, days: Int) {
        if (days <= 0) return
        val limit = System.currentTimeMillis() - days * 86_400_000L
        clipsDir(ctx).listFiles()?.filter { it.lastModified() < limit }?.forEach { it.delete() }
    }

    fun settingsJson(ctx: Context): String =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("settings", "{}") ?: "{}"

    fun settings(ctx: Context): JSONObject = try {
        JSONObject(settingsJson(ctx))
    } catch (_: Exception) {
        JSONObject()
    }

    fun saveSettings(ctx: Context, json: String) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("settings", json).apply()
    }
}
