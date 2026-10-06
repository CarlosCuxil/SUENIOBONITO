package gt.calin.sueno

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.SweepGradient
import android.graphics.Typeface
import android.widget.RemoteViews
import org.json.JSONArray

class SleepWidget : AppWidgetProvider() {

    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        for (id in ids) mgr.updateAppWidget(id, views(ctx))
    }

    companion object {
        fun refresh(ctx: Context) {
            try {
                val mgr = AppWidgetManager.getInstance(ctx)
                val ids = mgr.getAppWidgetIds(ComponentName(ctx, SleepWidget::class.java))
                if (ids.isNotEmpty()) {
                    val v = views(ctx)
                    for (id in ids) mgr.updateAppWidget(id, v)
                }
            } catch (_: Exception) {
            }
        }

        private fun views(ctx: Context): RemoteViews {
            val v = RemoteViews(ctx.packageName, R.layout.widget)
            val dens = ctx.resources.displayMetrics.density
            val last = Store.latestDone(ctx)
            val s = last?.optJSONObject("summary")
            if (s != null && !s.optBoolean("noSleep", false)) {
                val score = s.optInt("score", 0)
                v.setTextViewText(R.id.w_dur, Notif.dur(s.optLong("sleepMin", 0)))
                val on = s.optLong("onsetTs", 0)
                val wk = s.optLong("wakeTs", 0)
                v.setTextViewText(R.id.w_times, if (on > 0 && wk > 0) "${Notif.hm(on)} a ${Notif.hm(wk)}" else "")
                v.setImageViewBitmap(R.id.w_ring, ring((64 * dens).toInt(), score, dens))
                v.setImageViewBitmap(R.id.w_graph, graph((200 * dens).toInt(), (30 * dens).toInt(), s.optJSONArray("depth"), dens))
            } else {
                v.setTextViewText(R.id.w_dur, "Sin noches")
                v.setTextViewText(R.id.w_times, "Graba tu primera noche")
                v.setImageViewBitmap(R.id.w_ring, ring((64 * dens).toInt(), 0, dens))
                v.setImageViewBitmap(R.id.w_graph, graph((200 * dens).toInt(), (30 * dens).toInt(), null, dens))
            }
            val st = Store.settings(ctx)
            v.setTextViewText(R.id.w_alarm, if (st.optBoolean("alarmOn", true)) "⏰ " + st.optString("wake", "06:30") else "⏰ Alarma")
            v.setOnClickPendingIntent(R.id.w_sleep, Notif.openApp(ctx, "prepare", 40))
            v.setOnClickPendingIntent(R.id.w_alarm, Notif.openApp(ctx, "prepare", 41))
            v.setOnClickPendingIntent(R.id.w_root, Notif.openApp(ctx, if (last != null) "last" else "home", 42))
            return v
        }

        private fun ring(size: Int, score: Int, dens: Float): Bitmap {
            val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
            val c = Canvas(bmp)
            val stroke = 6 * dens
            val r = RectF(stroke / 2, stroke / 2, size - stroke / 2, size - stroke / 2)
            val p = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = stroke
                strokeCap = Paint.Cap.ROUND
                color = Color.parseColor("#2A2F5C")
            }
            c.drawArc(r, 0f, 360f, false, p)
            p.shader = SweepGradient(size / 2f, size / 2f, intArrayOf(Color.parseColor("#A89BE0"), Color.parseColor("#78B3A6"), Color.parseColor("#A89BE0")), null)
            c.save()
            c.rotate(-90f, size / 2f, size / 2f)
            c.drawArc(r, 0f, 360f * score / 100f, false, p)
            c.restore()
            val t = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.parseColor("#ECE6D6")
                textSize = size * 0.32f
                textAlign = Paint.Align.CENTER
                typeface = Typeface.create(Typeface.SERIF, Typeface.NORMAL)
            }
            c.drawText(if (score > 0) "$score" else "–", size / 2f, size / 2f - (t.descent() + t.ascent()) / 2, t)
            return bmp
        }

        private fun graph(w: Int, h: Int, depth: JSONArray?, dens: Float): Bitmap {
            val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            if (depth == null || depth.length() < 2) return bmp
            val c = Canvas(bmp)
            val n = depth.length()
            var mx = 0.01
            for (i in 0 until n) mx = maxOf(mx, depth.optDouble(i, 0.0))
            val path = Path()
            for (i in 0 until n) {
                val x = i.toFloat() / (n - 1) * w
                val y = (2 * dens + (depth.optDouble(i, 0.0) / mx * 0.95 * (h - 4 * dens))).toFloat()
                if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
            }
            val fill = Path(path)
            fill.lineTo(w.toFloat(), 0f)
            fill.lineTo(0f, 0f)
            fill.close()
            val pf = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                shader = LinearGradient(0f, 0f, 0f, h.toFloat(), Color.argb(10, 168, 155, 224), Color.argb(170, 120, 179, 166), Shader.TileMode.CLAMP)
            }
            c.drawPath(fill, pf)
            val ps = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = 1.6f * dens
                color = Color.parseColor("#78B3A6")
                strokeJoin = Paint.Join.ROUND
            }
            c.drawPath(path, ps)
            return bmp
        }
    }
}
