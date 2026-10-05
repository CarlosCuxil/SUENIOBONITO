package gt.calin.sueno

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object Notif {
    const val CH_REC = "grabando"
    const val CH_ALARM = "alarma"
    const val CH_SOUND = "sonidos"
    const val CH_REM = "recordatorio"

    const val N_REC = 1
    const val N_ALARM = 2
    const val N_REM = 3
    const val N_SUNRISE = 4

    fun ensure(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
        val rec = NotificationChannel(CH_REC, "Grabando tu sueño", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Se muestra mientras la app graba la noche"
            setShowBadge(false)
        }
        val alarm = NotificationChannel(CH_ALARM, "Alarma", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Despertador inteligente"
            setSound(null, null)
            enableVibration(false)
        }
        val sound = NotificationChannel(CH_SOUND, "Sonidos para dormir", NotificationManager.IMPORTANCE_LOW).apply {
            setShowBadge(false)
        }
        val rem = NotificationChannel(CH_REM, "Recordatorio para acostarte", NotificationManager.IMPORTANCE_DEFAULT)
        nm.createNotificationChannels(listOf(rec, alarm, sound, rem))
    }

    fun openApp(ctx: Context, route: String, code: Int): PendingIntent {
        val i = Intent(ctx, MainActivity::class.java)
            .putExtra("route", route)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        return PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    fun hm(ts: Long): String = SimpleDateFormat("HH:mm", Locale.US).format(Date(ts))

    fun dur(min: Long): String {
        val h = min / 60
        val m = min % 60
        return if (h > 0) "$h h ${m.toString().padStart(2, '0')} min" else "$m min"
    }
}
