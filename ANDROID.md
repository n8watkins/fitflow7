# Android (Capacitor + Health Connect) — sideload build

Turn the app into a sideloadable Android app that writes finished workouts to
**Health Connect**. No Play Store, no $25 fee.

## What's already done in the repo

- **Capacitor 8 and the Health plugin** (`@capacitor/core`, `@capacitor/cli`,
  `@capacitor/android`, `@capgo/capacitor-health`).
- `capacitor.config.json`: app id `dev.n8builds.fitflow7`, bundles `dist/`.
- `src/lib/healthConnect.ts`: build-safe seam; `timerStore` already calls it on
  workout complete (no-op on web).
- `src/native-health.ts`: the real native writer, registered on `window` and
  loaded **only** in the native build (gated by `VITE_NATIVE` in `main.tsx`).
  It never enters the web bundle.
- `public/privacypolicy.html`: the page Health Connect shows from its
  permission screen. The build copies it to `assets/public/`, where the plugin
  looks for it.

A finished workout is written as **active calories burned** over the workout
window. Calories are a rough duration estimate (`CALORIES_PER_MINUTE` in
`native-health.ts`), since the app has no body-weight input.

Everything below runs on **your** machine: it needs the Android toolchain and a
phone, which CI doesn't have.

## Prerequisites (one time)

- **Node 22 or newer** (Capacitor 8's CLI needs it).
- **Android Studio** (recent: Android SDK 36 and Gradle) and **JDK 21**
  (Android Studio's bundled JDK is fine).
- A phone on **Android 8 or newer** with **Health Connect** (built into Android
  14+; older versions install it from the Play Store) and **USB debugging** on.

## 1. Build the native web bundle

```bash
VITE_NATIVE=true npm run build
```

This is the only build that includes the Health plugin. Plain `npm run build`,
which the web deploy uses, leaves it out.

## 2. Add the Android platform and sync

```bash
npx cap add android      # first time only; creates android/ (not committed)
npx cap sync android
```

Then raise the minimum Android version to 8.0, which Health Connect needs: in
`android/variables.gradle`, set `minSdkVersion = 26`.

The plugin declares the Health Connect permissions and the permission-rationale
screen itself, so `AndroidManifest.xml` needs no edits.

## 3. Build the APK and sideload it

```bash
npx cap open android     # opens Android Studio
```

In Android Studio: **Build → Build APK(s)**, then install it on the phone
(`adb install app/build/outputs/apk/debug/app-debug.apk`, or drag and drop).

## 4. Check it on the phone

1. Finish a short workout. The app asks for Health Connect access the first
   time; allow **Active calories burned**.
2. Open Health Connect → **Data and access** → **Activity** → **Active
   calories burned**. The workout's calories appear for its time window, with
   FitFlow 7 as the source.
3. In Health Connect → **App permissions** → FitFlow 7, the privacy link opens
   the FitFlow 7 privacy page.

## Re-deploying changes

- After web changes: `VITE_NATIVE=true npm run build && npx cap sync android`,
  then rebuild the APK.
- After upgrading Capacitor: `npx cap sync android`; if Android Studio reports
  Gradle or SDK mismatches, run `npx cap migrate`.
- The bundle calls the API on its own origin unless the build sets
  `VITE_API_BASE_URL` (for example `VITE_API_BASE_URL=https://fitflow7.vercel.app`);
  `VITE_APP_URL` likewise sets the app link written into calendar events
  (default `https://fitflow7.vercel.app`). Both are read at build time.
- Prefer always-latest without rebuilding the bundle? Set `server.url` to
  `https://fitflow7.vercel.app` in `capacitor.config.json` — but then the Health
  Connect plugin won't be present (the live site is the plain web build), so keep
  the bundled approach if you want Health Connect.

## Notes

- Cloud sync and the MCP server are independent of this — Health Connect is a
  local device mirror of finished workouts.
- Write-only for now. Reading other apps' data back would add `read` scopes.
