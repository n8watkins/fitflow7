# Android (Capacitor + Health Connect) — sideload build

Turn the app into a sideloadable Android app that writes finished workouts to
**Health Connect**. No Play Store, no $25 fee.

## What's already done in the repo

- **Capacitor + plugin deps installed** (`@capacitor/core`, `@capacitor/cli`,
  `@capacitor/android`, `capacitor-health-connect`), all pinned to Capacitor 5
  (the plugin requires it).
- `capacitor.config.json` — app id `dev.n8builds.fitflow7`, bundles `dist/`.
- `src/lib/healthConnect.ts` — build-safe seam; `timerStore` already calls it on
  workout complete (no-op on web).
- `src/native-health.ts` — the real native writer, registered on `window` and
  loaded **only** in the native build (gated by `VITE_NATIVE` in `main.tsx`).
  Verified to compile and bundle; it never enters the web/Vercel bundle.

> **Record type note:** `capacitor-health-connect` v0.7 has no `ExerciseSession`
> record, so a workout is written as **ActiveCaloriesBurned** over the workout
> window. Calories are a rough duration estimate (`CALORIES_PER_MINUTE` in
> `native-health.ts`) since the app has no body-weight input — tune as you like.

So the web side is finished. Everything below runs on **your** machine (it needs
the Android toolchain + a device, which can't run from this repo's CI).

## Prerequisites (one time)

- **Android Studio** (Android SDK + Gradle) and **JDK 17**.
- A phone with **Health Connect** (built into Android 14+; older devices install
  it from the Play Store) and **USB debugging** enabled.

## 1. Build the native web bundle

```bash
VITE_NATIVE=true npm run build
```

This is the only build that includes the Health Connect plugin. (Plain
`npm run build`, used by Vercel, deliberately excludes it.)

## 2. Add the Android platform + sync

```bash
npx cap add android
npx cap sync android
```

## 3. Declare the Health Connect permission

In `android/app/src/main/AndroidManifest.xml`, inside `<manifest>`:

```xml
<uses-permission android:name="android.permission.health.WRITE_ACTIVE_CALORIES_BURNED" />
```

Health Connect also wants a permissions-rationale activity. Inside `<application>`:

```xml
<activity-alias
  android:name="ViewPermissionUsageActivity"
  android:exported="true"
  android:targetActivity=".MainActivity"
  android:permission="android.permission.START_VIEW_PERMISSION_USAGE">
  <intent-filter>
    <action android:name="android.intent.action.VIEW_PERMISSION_USAGE" />
    <category android:name="android.intent.category.HEALTH_PERMISSIONS" />
  </intent-filter>
</activity-alias>
```

(Confirm the current required manifest entries against the `capacitor-health-connect`
README — Health Connect's requirements shift across Android versions.)

## 4. Build the APK + sideload

```bash
npx cap open android        # opens Android Studio
```

In Android Studio: **Build → Build APK(s)**, then install on the device
(`adb install app/build/outputs/apk/debug/app-debug.apk`, or drag-drop). On the
first completed workout the app requests Health Connect permission; after you
grant it, sessions show up in Health Connect → Active calories.

## Re-deploying changes

- After web changes: `VITE_NATIVE=true npm run build && npx cap sync android`,
  then rebuild the APK.
- Prefer always-latest without rebuilding the bundle? Set `server.url` to
  `https://fitflow7.vercel.app` in `capacitor.config.json` — but then the Health
  Connect plugin won't be present (the live site is the plain web build), so keep
  the bundled approach if you want Health Connect.

## Notes

- Cloud sync and the MCP server are independent of this — Health Connect is a
  local device mirror of finished workouts.
- Write-only for now. Reading other apps' data back would add `read` scopes.
