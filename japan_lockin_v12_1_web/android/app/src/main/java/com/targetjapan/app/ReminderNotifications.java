package com.targetjapan.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

final class ReminderNotifications {
    static final String REMINDER_CHANNEL_ID = "task-reminders";
    static final String VOICE_CHANNEL_ID = "reminder-voice";

    private ReminderNotifications() {}

    static void createChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel reminders = new NotificationChannel(
                REMINDER_CHANNEL_ID, "Task and Finance reminders", NotificationManager.IMPORTANCE_HIGH);
        reminders.setDescription("Scheduled reminders for tasks and Finance entries.");
        reminders.enableVibration(true);
        manager.createNotificationChannel(reminders);

        NotificationChannel voice = new NotificationChannel(
                VOICE_CHANNEL_ID, "Spoken reminder service", NotificationManager.IMPORTANCE_LOW);
        voice.setDescription("Keeps spoken reminder audio active while it is being announced.");
        voice.setSound(null, null);
        manager.createNotificationChannel(voice);
    }

    static void show(Context context, String id, String title, String body, String spokenText) {
        createChannels(context);
        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent contentIntent = null;
        if (launchIntent != null) {
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            contentIntent = PendingIntent.getActivity(
                    context,
                    id.hashCode(),
                    launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, REMINDER_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setOnlyAlertOnce(false)
                .setSound(android.provider.Settings.System.DEFAULT_NOTIFICATION_URI)
                .setVibrate(new long[]{0, 250, 150, 250});
        if (contentIntent != null) builder.setContentIntent(contentIntent);

        try {
            NotificationManagerCompat.from(context).notify(notificationId(id), builder.build());
        } catch (SecurityException error) {
            android.util.Log.w("JapanLockIn", "Notification permission is not granted.", error);
        }
        if (spokenText != null && !spokenText.trim().isEmpty()) {
            ReminderVoiceService.start(context, spokenText);
        }
    }

    static Notification foregroundVoiceNotification(Context context, String text) {
        createChannels(context);
        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent contentIntent = launchIntent == null ? null : PendingIntent.getActivity(
                context,
                0,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, VOICE_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle("Japan Lock-In reminder")
                .setContentText(text)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .setOnlyAlertOnce(true);
        if (contentIntent != null) builder.setContentIntent(contentIntent);
        return builder.build();
    }

    static int notificationId(String id) {
        return id.hashCode() & 0x7fffffff;
    }
}
