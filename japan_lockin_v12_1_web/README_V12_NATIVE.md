# Japan Lock-In Android wrapper

The Android project is a Capacitor wrapper around the web app. Build the static
web assets and sync them into the Android project from this folder:

```text
npm ci
npm run build
npx cap sync android
```

Open `android/` in Android Studio to build the APK. The web assets are generated
in `www/`; do not edit that generated folder directly.

## Android local reminder capabilities

The Android app schedules task and Finance reminders locally with `AlarmManager`
and displays native Android notifications. The `AndroidBridge` also supports
notification permission requests, reminder diagnostics/settings links, voice
preferences, and spoken reminders through Android Text-to-Speech. Spoken alerts
run in a short-lived foreground media-playback service. Pending reminders are
restored after device restart, app replacement, and clock/time-zone changes.

On Android 13 and newer, grant notification permission. For precise reminders
on Android 12 and newer, grant the app's separate **Alarms & reminders** access.
If exact-alarm access is unavailable, the app falls back to inexact alarms.
Some device manufacturers may delay background delivery through battery
management; configure the app's background/auto-start settings if needed.

These are **local on-device reminders**, not remote push notifications. The
device must first receive the latest schedule from the app, and the app needs
to be opened again after schedules change on another device. Voice reminders
use the installed Android TTS voice; Japanese voice quality and language
availability depend on the device's installed speech engine. No app can
guarantee exact delivery across every Android device or power-management mode.

Browser notifications and browser voice continue to depend on browser
permissions and the app remaining available as required by the browser.

For web deployment and cloud sync instructions, see [DEPLOY.txt](./DEPLOY.txt).
