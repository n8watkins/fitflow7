import type { WorkoutSession } from '../types'

// ---------------------------------------------------------------------------
// Health Connect bridge (Phase 2 / Android).
//
// The web bundle must not depend on the native Capacitor Health Connect plugin
// (it doesn't exist on web and would break the build), so this is intentionally
// decoupled: the native Android build registers a writer on `window` and this
// module just calls it. On web — and on Android until the native build wires it
// up — there is no writer, so this is a no-op. See ANDROID.md for the native
// side that assigns `window.fitflowNativeHealth`.
// ---------------------------------------------------------------------------

type NativeHealthWriter = (session: WorkoutSession) => void | Promise<void>

declare global {
  interface Window {
    fitflowNativeHealth?: NativeHealthWriter
  }
}

/** Best-effort: write a finished workout to Android Health Connect via the native
 *  bridge. No-op on web/PWA. Never throws and never blocks the UI. */
export function writeWorkoutToHealth(session: WorkoutSession): void {
  if (typeof window === 'undefined') return
  const writer = window.fitflowNativeHealth
  if (!writer) return
  try {
    void Promise.resolve(writer(session)).catch(() => {})
  } catch {
    // best-effort only
  }
}
