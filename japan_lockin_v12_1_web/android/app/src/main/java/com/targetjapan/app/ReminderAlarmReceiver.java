package com.targetjapan.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import java.util.HashSet;
import java.util.Set;

public final class ReminderAlarmReceiver extends BroadcastReceiver {
    static final String EXTRA_ID = "reminder_id";
    static final String EXTRA_NAME = "reminder_name";
    static final String EXTRA_START = "reminder_start";
    static final String EXTRA_DATE = "reminder_date";
    static final String EXTRA_KIND = "reminder_kind";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String id = intent.getStringExtra(EXTRA_ID);
        if (id == null || id.isEmpty()) return;

        String name = intent.getStringExtra(EXTRA_NAME);
        String start = intent.getStringExtra(EXTRA_START);
        String date = intent.getStringExtra(EXTRA_DATE);
        String kind = intent.getStringExtra(EXTRA_KIND);
        String title = "Japan Lock-In — Reminder";
        String body = (name == null || name.isEmpty() ? "Upcoming reminder" : name)
                + (start == null || start.isEmpty() ? "" : " · starts at " + start)
                + (date == null || date.isEmpty() ? "" : " · " + date);
        boolean voiceEnabled = context.getSharedPreferences(
                NativeReminderScheduler.PREFERENCES,
                Context.MODE_PRIVATE
        ).getBoolean(NativeReminderScheduler.KEY_VOICE_ENABLED, true);
        String spokenText = voiceEnabled
                ? (kind != null && kind.equals("finance") ? "Finance reminder. " : "Reminder. ")
                + (name == null || name.isEmpty() ? "You have an upcoming reminder." : name)
                + (start == null || start.isEmpty() ? "" : ". It is scheduled for " + start + ".")
                : null;

        ReminderNotifications.show(context, id, title, body, spokenText);
        removeScheduledId(context, id);
    }

    private void removeScheduledId(Context context, String id) {
        Set<String> scheduled = new HashSet<>(context.getSharedPreferences(
                NativeReminderScheduler.PREFERENCES,
                Context.MODE_PRIVATE
        ).getStringSet("scheduled_ids", new HashSet<>()));
        if (scheduled.remove(id)) {
            context.getSharedPreferences(NativeReminderScheduler.PREFERENCES, Context.MODE_PRIVATE)
                    .edit()
                    .putStringSet("scheduled_ids", scheduled)
                    .apply();
        }
    }
}
