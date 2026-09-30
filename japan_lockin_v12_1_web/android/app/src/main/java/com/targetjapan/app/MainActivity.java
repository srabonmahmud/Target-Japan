package com.targetjapan.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.BridgeActivity;

import org.json.JSONException;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final int NOTIFICATION_PERMISSION_REQUEST = 4107;
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ReminderNotifications.createChannels(this);
        WebView webView = getBridge().getWebView();
        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");
    }

    @Override
    protected void onResume() {
        super.onResume();
        android.content.SharedPreferences preferences =
                getSharedPreferences(NativeReminderScheduler.PREFERENCES, MODE_PRIVATE);
        boolean exactAllowed = NativeReminderScheduler.canScheduleExactAlarms(this);
        if (!preferences.contains(NativeReminderScheduler.KEY_EXACT_ALLOWED)
                || preferences.getBoolean(NativeReminderScheduler.KEY_EXACT_ALLOWED, false) != exactAllowed) {
            NativeReminderScheduler.scheduleStored(this);
        }
        notifyWebPermissionState();
    }

    private void notifyWebPermissionState() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().getWebView().post(() ->
                getBridge().getWebView().evaluateJavascript(
                        "window.__nativeReminderPermissionResult&&window.__nativeReminderPermissionResult()",
                        null
                )
        );
    }

    public final class AndroidBridge {
        @JavascriptInterface
        public void scheduleReminders(String json) {
            try {
                NativeReminderScheduler.replaceSchedule(MainActivity.this, json);
            } catch (JSONException | IllegalArgumentException error) {
                android.util.Log.e("JapanLockIn", "Could not schedule native reminders.", error);
                reportNativeError(error);
            } catch (RuntimeException error) {
                android.util.Log.e("JapanLockIn", "Android could not schedule native reminders.", error);
                reportNativeError(error);
            }
        }

        @JavascriptInterface
        public void requestNotificationPermission() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                        && ActivityCompat.checkSelfPermission(MainActivity.this, Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
                    ActivityCompat.requestPermissions(
                            MainActivity.this,
                            new String[]{Manifest.permission.POST_NOTIFICATIONS},
                            NOTIFICATION_PERMISSION_REQUEST
                    );
                } else {
                    NativeReminderScheduler.scheduleStored(MainActivity.this);
                    notifyWebPermissionState();
                }
            });
        }

        @JavascriptInterface
        public boolean isNotificationEnabled() {
            return NotificationManagerCompat.from(MainActivity.this).areNotificationsEnabled();
        }

        @JavascriptInterface
        public boolean isExactAlarmGranted() {
            return NativeReminderScheduler.canScheduleExactAlarms(MainActivity.this);
        }

        @JavascriptInterface
        public void openExactAlarmSettings() {
            runOnUiThread(() -> {
                Intent intent;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
                            .setData(Uri.parse("package:" + getPackageName()));
                } else {
                    intent = appDetailsIntent();
                }
                launchSettings(intent);
            });
        }

        @JavascriptInterface
        public void saveVoicePreference(boolean enabled) {
            getSharedPreferences(NativeReminderScheduler.PREFERENCES, MODE_PRIVATE)
                    .edit()
                    .putBoolean(NativeReminderScheduler.KEY_VOICE_ENABLED, enabled)
                    .apply();
        }

        @JavascriptInterface
        public void speak(String text) {
            ReminderVoiceService.start(MainActivity.this, text);
        }

        @JavascriptInterface
        public void testVoice() {
            ReminderVoiceService.start(
                    MainActivity.this,
                    "Your next task is Workout. It starts in five minutes."
            );
        }

        @JavascriptInterface
        public void testNotification() {
            ReminderNotifications.show(
                    MainActivity.this,
                    "test-notification",
                    "Japan Lock-In",
                    "Test: your Android notification is working.",
                    null
            );
        }

        @JavascriptInterface
        public String diagnosticStatus() {
            NotificationManager manager = getSystemService(NotificationManager.class);
            NotificationChannel channel = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null
                    ? manager.getNotificationChannel(ReminderNotifications.REMINDER_CHANNEL_ID)
                    : null;
            boolean channelSound = Build.VERSION.SDK_INT < Build.VERSION_CODES.O
                    || (channel != null && channel.getSound() != null
                    && channel.getImportance() != NotificationManager.IMPORTANCE_NONE);
            boolean tts = !android.text.TextUtils.isEmpty(
                    Settings.Secure.getString(getContentResolver(), "tts_default_synth")
            );
            JSONObject result = new JSONObject();
            try {
                result.put("notifications", isNotificationEnabled());
                result.put("exactAlarms", isExactAlarmGranted());
                result.put("tts", tts);
                result.put("channel", channel != null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O);
                result.put("channelSound", channelSound);
            } catch (JSONException error) {
                android.util.Log.e("JapanLockIn", "Could not create reminder diagnostics.", error);
            }
            return result.toString();
        }

        @JavascriptInterface
        public void openNotificationSettings() {
            runOnUiThread(() -> launchSettings(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName())));
        }

        @JavascriptInterface
        public void openReminderChannelSettings() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    launchSettings(new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                            .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName())
                            .putExtra(Settings.EXTRA_CHANNEL_ID, ReminderNotifications.REMINDER_CHANNEL_ID));
                } else {
                    launchSettings(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                            .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()));
                }
            });
        }

        @JavascriptInterface
        public void openBatterySettings() {
            runOnUiThread(() -> launchSettings(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)));
        }

        @JavascriptInterface
        public void openTtsSettings() {
            runOnUiThread(() -> launchSettings(new Intent(Settings.ACTION_TEXT_TO_SPEECH_SETTINGS)));
        }

        private Intent appDetailsIntent() {
            return new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                    .setData(Uri.parse("package:" + getPackageName()));
        }

        private void launchSettings(Intent intent) {
            try {
                if (intent.resolveActivity(getPackageManager()) == null) intent = appDetailsIntent();
                startActivity(intent);
            } catch (RuntimeException error) {
                android.util.Log.e("JapanLockIn", "Could not open Android settings.", error);
            }
        }

        private void reportNativeError(Throwable error) {
            String message = JSONObject.quote(
                    error.getMessage() == null ? "Android could not schedule reminders." : error.getMessage()
            );
            if (getBridge() == null || getBridge().getWebView() == null) return;
            getBridge().getWebView().post(() ->
                    getBridge().getWebView().evaluateJavascript(
                            "window.__nativeReminderError&&window.__nativeReminderError(" + message + ")",
                            null
                    )
            );
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == NOTIFICATION_PERMISSION_REQUEST) {
            if (isNotificationPermissionGranted()) NativeReminderScheduler.scheduleStored(this);
            notifyWebPermissionState();
        }
    }

    private boolean isNotificationPermissionGranted() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                || ActivityCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
    }
}
