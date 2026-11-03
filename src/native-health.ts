import { Capacitor } from '@capacitor/core'
import { Health } from '@capgo/capacitor-health'
import type { WorkoutSession } from './types'

// ---------------------------------------------------------------------------
// Native-only Health Connect writer (loaded only in the Capacitor Android build
// via the VITE_NATIVE flag in main.tsx — never in the web/Vercel bundle).
//
// A finished workout is written as active calories burned over the workout
// window. Calories are a rough duration-based estimate (the app has no
// body-weight input); adjust CALORIES_PER_MINUTE to taste.
// ---------------------------------------------------------------------------

const CALORIES_PER_MINUTE = 8 // ~vigorous bodyweight HIIT, rough estimate

if (Capacitor.getPlatform() === 'android') {
  window.fitflowNativeHealth = async (session: WorkoutSession) => {
    const { available } = await Health.isAvailable()
    if (!available) return

    const { writeAuthorized } = await Health.requestAuthorization({ read: [], write: ['calories'] })
    if (!writeAuthorized.includes('calories')) return

    const start = new Date(session.startedAt)
    const end = session.completedAt
      ? new Date(session.completedAt)
      : new Date(start.getTime() + session.durationSeconds * 1000)
    const kilocalories = Math.max(1, Math.round((session.durationSeconds / 60) * CALORIES_PER_MINUTE))

    await Health.saveSample({
      dataType: 'calories',
      value: kilocalories,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    })
  }
}
