# Android (Capacitor + Health Connect) — sideload build

Turn the PWA into a sideloadable Android app that writes completed workouts to
**Health Connect** (Google/Samsung Health ecosystem). No Play Store, no $25 fee.

What's already in the repo:

- `capacitor.config.json` — app id `dev.n8builds.fitflow7`, bundles `dist/`.
- `src/lib/healthConnect.ts` — a build-safe seam. The workout-complete path
  (`timerStore.ts`) already calls `writeWorkoutToHealth()`; on web it's a no-op.
  The native build below registers `window.fitflowNativeHealth` to fulfill it.

Everything below runs on **your** machine — building/running an APK needs the
Android toolchain and a device, which can't be done from this repo's CI.

## Prerequisites (one time)

- **Android Studio** (gives you the Android SDK + Gradle) and a **JDK 17**.
- A phone with **Health Connect** (built into Android 14+; older devices install
  it from the Play Store) and **USB debugging** enabled.

## 1. Install Capacitor + the Health Connect plugin

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npm install capacitor-health-connect
```

## 2. Add the native Health Connect writer

Create `src/native-health.ts`:

```ts
import { Capacitor } from '@capacitor/core'
import { HealthConnect } from 'capacitor-health-connect'
import type { WorkoutSession } from './types'

// EXERCISE_TYPE constants come from androidx.health.connect ExerciseSessionRecord.
// 56 = HIGH_INTENSITY_INTERVAL_TRAINING (good fit for a 7-minute workout).
const EXERCISE_TYPE_HIIT = 56

if (Capacitor.getPlatform() === 'android') {
  window.fitflowNativeHealth = async (session: WorkoutSession) => {
    const perm = await HealthConnect.requestHealthPermissions({
      read: [],
      write: ['ExerciseSession'],
    })
    if (!perm.hasAllPermissions) return
    const start = new Date(session.startedAt)
    const end = session.completedAt
      ? new Date(session.completedAt)
      : new Date(start.getTime() + session.durationSeconds * 1000)
    await HealthConnect.insertRecords({
      records: [
        {
          type: 'ExerciseSession',
          startTime: start,
          endTime: end,
          exerciseType: EXERCISE_TYPE_HIIT,
          title: session.routineName,
        },
      ],
    })
  }
}
```

Import it once, **only for native builds**, near the top of `src/main.tsx`:

```ts
if (import.meta.env.VITE_NATIVE === 'true') {
  await import('./native-health')
}
```

Build the native bundle with that flag so the plugin is only pulled into the
native build, never the web/Vercel build:

```bash
VITE_NATIVE=true npm run build
```

(`main.tsx` is currently sync; if you prefer not to make it async, instead import
`./native-health` unconditionally and only run `npm run build` with the plugin
installed — it tree-shakes to a no-op on platforms other than android.)

## 3. Add the Android platform + sync

```bash
npx cap add android
npx cap sync android
```

## 4. Declare Health Connect permissions

In `android/app/src/main/AndroidManifest.xml`, inside `<manifest>`:

```xml
<uses-permission android:name="android.permission.health.WRITE_EXERCISE" />
```

Health Connect also requires a permissions-rationale activity. Add inside
`<application>`:

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

(See the plugin README for the exact, current permission set — Health Connect's
manifest requirements change between Android versions.)

## 5. Build + sideload

```bash
npx cap open android      # opens Android Studio
```

In Android Studio: **Build → Build APK(s)**, then install on the device
(`adb install app/build/outputs/apk/debug/app-debug.apk`, or drag-drop). On first
completed workout the app asks for Health Connect permission; after granting,
sessions appear in Health Connect → Exercise.

## Notes

- The app loads its bundled `dist/`. Re-run `npm run build && npx cap sync` after
  web changes to refresh the native bundle. (Alternatively set `server.url` in
  `capacitor.config.json` to `https://fitflow7.vercel.app` to always load the
  live site — then you only rebuild the APK when native code changes.)
- Cloud sync and the MCP server are independent of this — Health Connect is a
  local device mirror of completed workouts.
- This writes only. Reading other apps' workouts back would add `read` scopes and
  a sync strategy — out of scope for now.
