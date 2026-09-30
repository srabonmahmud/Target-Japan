package com.targetjapan.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

final class NativeReminderScheduler {
    static final String PREFERENCES = "japan_lockin_native_reminders";
    static final String KEY_VOICE_ENABLED = "voice_enabled";
    static final String KEY_EXACT_ALLOWED = "exact_alarm_allowed";
    private static final String KEY_PAYLOAD = "payload";
    private static final String KEY_SCHEDULED_IDS = "scheduled_ids";
    private static final String TAG = "JapanLockIn";
    private static final int MAX_REMINDERS = 200;

    private NativeReminderScheduler() {}

    static synchronized void replaceSchedule(Context context, String payload) throws JSONException {
        JSONArray reminders = new JSONArray(payload);
        if (reminders.length() > MAX_REMINDERS) {
            throw new IllegalArgumentException("Too many reminders in schedule.");
        }
        boolean saved = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_PAYLOAD, reminders.toString())
                .commit();
        if (!saved) throw new IllegalStateException("Could not save the device reminder schedule.");
        schedule(context, reminders);
    }

    static synchronized void scheduleStored(Context context) {
        String payload = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
                .getString(KEY_PAYLOAD, "[]");
        try {
            schedule(context, new JSONArray(payload));
        } catch (JSONException | RuntimeException error) {
            Log.e(TAG, "Could not restore native reminders.", error);
        }
    }

    private static void schedule(Context context, JSONArray reminders) throws JSONException {
        AlarmManager alarmManager = context.getSystemService(AlarmManager.class);
        if (alarmManager == null) throw new IllegalStateException("Android alarm service is unavailable.");

        Set<String> previousIds = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
                .getStringSet(KEY_SCHEDULED_IDS, new HashSet<>());
        if (previousIds == null) previousIds = new HashSet<>();
        for (String id : previousIds) {
            PendingIntent previous = pendingIntent(context, id);
            if (previous != null) alarmManager.cancel(previous);
        }

        Set<String> scheduledIds = new HashSet<>();
        long now = System.currentTimeMillis();
        for (int index = 0; index < reminders.length(); index++) {
            JSONObject reminder = reminders.optJSONObject(index);
            if (reminder == null) continue;
            String id = reminder.optString("id", "");
            long at = reminder.optLong("time", 0L);
            if (id.isEmpty() || at <= now) continue;

            Intent intent = new Intent(context, ReminderAlarmReceiver.class)
                    .setAction(context.getPackageName() + ".REMINDER." + id)
                    .putExtra(ReminderAlarmReceiver.EXTRA_ID, id)
                    .putExtra(ReminderAlarmReceiver.EXTRA_NAME, reminder.optString("name", "Your next task"))
                    .putExtra(ReminderAlarmReceiver.EXTRA_START, reminder.optString("start", ""))
                    .putExtra(ReminderAlarmReceiver.EXTRA_DATE, reminder.optString("date", ""))
                    .putExtra(ReminderAlarmReceiver.EXTRA_KIND, reminder.optString("kind", "task"));
            PendingIntent operation = PendingIntent.getBroadcast(
                    context,
                    id.hashCode(),
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms()) {
                        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, operation);
                    } else {
                        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, operation);
                    }
                } else {
                    alarmManager.setExact(AlarmManager.RTC_WAKEUP, at, operation);
                }
                scheduledIds.add(id);
            } catch (SecurityException error) {
                Log.w(TAG, "Exact alarm access is unavailable; scheduling an inexact reminder.", error);
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, operation);
                scheduledIds.add(id);
            }
        }

        boolean saved = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
                .edit()
                .putStringSet(KEY_SCHEDULED_IDS, scheduledIds)
                .putBoolean(KEY_EXACT_ALLOWED, canScheduleExactAlarms(context))
                .commit();
        if (!saved) throw new IllegalStateException("Could not save scheduled reminder identifiers.");
    }

    static boolean canScheduleExactAlarms(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        AlarmManager alarmManager = context.getSystemService(AlarmManager.class);
        return alarmManager != null && alarmManager.canScheduleExactAlarms();
    }

    private static PendingIntent pendingIntent(Context context, String id) {
        Intent intent = new Intent(context, ReminderAlarmReceiver.class)
                .setAction(context.getPackageName() + ".REMINDER." + id);
        return PendingIntent.getBroadcast(context, id.hashCode(), intent,
                PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
    }
}
