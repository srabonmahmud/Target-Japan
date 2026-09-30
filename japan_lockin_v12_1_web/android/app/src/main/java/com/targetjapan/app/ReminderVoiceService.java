package com.targetjapan.app;

import android.app.Service;
import android.content.Intent;
import android.media.AudioAttributes;
import android.os.Build;
import android.os.IBinder;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;

import java.util.ArrayDeque;
import java.util.Locale;
import java.util.Queue;

public final class ReminderVoiceService extends Service {
    private static final String TAG = "JapanLockIn";
    private static final String EXTRA_TEXT = "spoken_text";
    private static final int FOREGROUND_NOTIFICATION_ID = 7301;

    private final Queue<String> speechQueue = new ArrayDeque<>();
    private TextToSpeech textToSpeech;
    private boolean ttsReady;
    private boolean speaking;

    static void start(android.content.Context context, String text) {
        if (text == null || text.trim().isEmpty()) return;
        Intent intent = new Intent(context, ReminderVoiceService.class).putExtra(EXTRA_TEXT, text);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (RuntimeException error) {
            Log.e(TAG, "Could not start the spoken reminder service.", error);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        textToSpeech = new TextToSpeech(getApplicationContext(), status -> {
            ttsReady = status == TextToSpeech.SUCCESS;
            if (ttsReady) {
                textToSpeech.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build());
                textToSpeech.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String utteranceId) {}
                    @Override public void onDone(String utteranceId) { runOnMainThread(ReminderVoiceService.this::speakNext); }
                    @Override public void onError(String utteranceId) {
                        Log.e(TAG, "Text-to-speech failed for a reminder.");
                        runOnMainThread(ReminderVoiceService.this::speakNext);
                    }
                });
                speakNext();
            } else {
                Log.e(TAG, "Android Text-to-Speech could not initialize.");
                stopServiceWhenIdle();
            }
        });
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String text = intent == null ? null : intent.getStringExtra(EXTRA_TEXT);
        if (text != null && !text.trim().isEmpty()) speechQueue.add(text.trim());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                    FOREGROUND_NOTIFICATION_ID,
                    ReminderNotifications.foregroundVoiceNotification(
                            this, text == null ? "Speaking reminder" : text
                    ),
                    android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            );
        } else {
            startForeground(FOREGROUND_NOTIFICATION_ID,
                    ReminderNotifications.foregroundVoiceNotification(
                            this, text == null ? "Speaking reminder" : text
                    ));
        }
        speakNext();
        return START_NOT_STICKY;
    }

    private void speakNext() {
        if (!ttsReady || speaking) return;
        String text = speechQueue.poll();
        if (text == null) {
            stopServiceWhenIdle();
            return;
        }
        Locale language = text.matches(".*[\\u3040-\\u30ff\\u3400-\\u9fff].*")
                ? Locale.JAPANESE
                : Locale.US;
        int languageResult = textToSpeech.setLanguage(language);
        if (languageResult == TextToSpeech.LANG_MISSING_DATA
                || languageResult == TextToSpeech.LANG_NOT_SUPPORTED) {
            Log.w(TAG, "Requested TTS language is unavailable; using the installed default voice.");
        }
        speaking = true;
        int result = textToSpeech.speak(
                text,
                TextToSpeech.QUEUE_FLUSH,
                null,
                "reminder-" + System.nanoTime()
        );
        if (result == TextToSpeech.ERROR) {
            speaking = false;
            Log.e(TAG, "Text-to-speech rejected the reminder.");
            new android.os.Handler(getMainLooper()).post(this::speakNext);
        }
    }

    private void stopServiceWhenIdle() {
        if (textToSpeech != null && !speechQueue.isEmpty()) {
            speaking = false;
            speakNext();
            return;
        }
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private void runOnMainThread(Runnable action) {
        new android.os.Handler(getMainLooper()).post(() -> {
            speaking = false;
            action.run();
        });
    }

    @Override
    public void onDestroy() {
        if (textToSpeech != null) {
            textToSpeech.stop();
            textToSpeech.shutdown();
            textToSpeech = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
