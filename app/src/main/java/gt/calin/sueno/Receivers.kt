package gt.calin.sueno

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import java.util.Calendar

/** Respaldo: si el servicio murió, la alarma igual suena. */
class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val s = SleepService.instance
        if (s != null && (s.recording || s.ringing)) {
            s.onBackupAlarm()
        } else {
            try {
                ctx.startForegroundService(Intent(ctx, SleepService::class.java).setAction(SleepService.A_RING))
            } catch (_: Exception) {
            }
        }
    }
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        when (intent.action) {
            Reminder.ACTION_LATER -> {
                ctx.getSystemService(NotificationManager::class.java)?.cancel(Notif.N_REM)
                Reminder.scheduleAt(ctx, System.currentTimeMillis() + 15 * 60_000L)
            }
            else -> {
                Reminder.show(ctx)
                Reminder.schedule(ctx)
            }
        }
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        Notif.ensure(ctx)
        Reminder.schedule(ctx)
        SleepWidget.refresh(ctx)
    }
}

object Reminder {
    const val ACTION_FIRE = "gt.calin.sueno.REMINDER"
    const val ACTION_LATER = "gt.calin.sueno.REMINDER_LATER"

    private fun pi(ctx: Context): PendingIntent =
        PendingIntent.getBroadcast(
            ctx, 200, Intent(ctx, ReminderReceiver::class.java).setAction(ACTION_FIRE),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

    fun schedule(ctx: Context) {
        val s = Store.settings(ctx)
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return
        am.cancel(pi(ctx))
        if (!s.optBoolean("reminderOn", false)) return
        val parts = s.optString("reminderTime", "21:45").split(":")
        val h = parts.getOrNull(0)?.toIntOrNull() ?: 21
        val m = parts.getOrNull(1)?.toIntOrNull() ?: 45
        val daysArr = s.optJSONArray("reminderDays")
        val days = HashSet<Int>()
        if (daysArr != null) for (i in 0 until daysArr.length()) days.add(daysArr.optInt(i))
        if (days.isEmpty()) (0..6).forEach { days.add(it) }
        val now = System.currentTimeMillis()
        val c = Calendar.getInstance()
        c.set(Calendar.HOUR_OF_DAY, h)
        c.set(Calendar.MINUTE, m)
        c.set(Calendar.SECOND, 0)
        c.set(Calendar.MILLISECOND, 0)
        for (k in 0..7) {
            val dow = c.get(Calendar.DAY_OF_WEEK) - 1 // 0 = domingo
            if (c.timeInMillis > now + 30_000 && days.contains(dow)) {
                scheduleAt(ctx, c.timeInMillis)
                return
            }
            c.add(Calendar.DAY_OF_MONTH, 1)
        }
    }

    fun scheduleAt(ctx: Context, ts: Long) {
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return
        try {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ts, pi(ctx))
        } catch (_: SecurityException) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ts, pi(ctx))
        }
    }

    fun show(ctx: Context) {
        Notif.ensure(ctx)
        val s = Store.settings(ctx)
        val goal = s.optDouble("goal", 8.0)
        val wake = s.optString("wake", "06:30")
        val parts = wake.split(":")
        val wm = (parts.getOrNull(0)?.toIntOrNull() ?: 6) * 60 + (parts.getOrNull(1)?.toIntOrNull() ?: 30)
        val bed = ((wm - (goal * 60).toInt() - 15) % 1440 + 1440) % 1440
        val bedTxt = "${(bed / 60).toString().padStart(2, '0')}:${(bed % 60).toString().padStart(2, '0')}"
        val goalTxt = if (goal % 1.0 == 0.0) goal.toInt().toString() else goal.toString()
        val text = if (s.optBoolean("alarmOn", true)) {
            "Para dormir $goalTxt h y despertar a las $wake, acuéstate a las $bedTxt."
        } else {
            "Tu meta es dormir $goalTxt horas. Empieza a bajar el ritmo."
        }
        val later = PendingIntent.getBroadcast(
            ctx, 201, Intent(ctx, ReminderReceiver::class.java).setAction(ACTION_LATER),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val icon = Icon.createWithResource(ctx, R.drawable.ic_stat_moon)
        val n = Notification.Builder(ctx, Notif.CH_REM)
            .setSmallIcon(R.drawable.ic_stat_moon)
            .setContentTitle("Hora de prepararte para dormir")
            .setContentText(text)
            .setStyle(Notification.BigTextStyle().bigText(text))
            .setAutoCancel(true)
            .setContentIntent(Notif.openApp(ctx, "prepare", 20))
            .addAction(Notification.Action.Builder(icon, "Preparar la noche", Notif.openApp(ctx, "prepare", 21)).build())
            .addAction(Notification.Action.Builder(icon, "15 min más", later).build())
            .build()
        try {
            ctx.getSystemService(NotificationManager::class.java)?.notify(Notif.N_REM, n)
        } catch (_: SecurityException) {
        }
    }
}
