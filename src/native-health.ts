import { Capacitor } from '@capacitor/core'
import { HealthConnect } from 'capacitor-health-connect'
import type { WorkoutSession } from './types'

// ---------------------------------------------------------------------------
// Native-only Health Connect writer (loaded only in the Capacitor Android build
// via the VITE_NATIVE flag in main.tsx — never in the web/Vercel bundle).
//
// capacitor-health-connect v0.7 has no ExerciseSession record type, so a finished
// workout is mirrored as ActiveCaloriesBurned over the workout window. Calories
// are a rough duration-based estimate (the app has no body-weight input); adjust
// CALORIES_PER_MINUTE to taste.
// ---------------------------------------------------------------------------

const CALORIES_PER_MINUTE = 8 // ~vigorous bodyweight HIIT, rough estimate

if (Capacitor.getPlatform() === 'android') {
  window.fitflowNativeHealth = async (session: WorkoutSession) => {
    const { availability } = await HealthConnect.checkAvailability()
    if (availability !== 'Available') return

    const perm = await HealthConnect.requestHealthPermissions({
      read: [],
      write: ['ActiveCaloriesBurned'],
    })
    if (!perm.hasAllPermissions) return

    const start = new Date(session.startedAt)
    const end = session.completedAt
      ? new Date(session.completedAt)
      : new Date(start.getTime() + session.durationSeconds * 1000)
    const kilocalories = Math.max(1, Math.round((session.durationSeconds / 60) * CALORIES_PER_MINUTE))

    await HealthConnect.insertRecords({
      records: [
        {
          type: 'ActiveCaloriesBurned',
          startTime: start,
          endTime: end,
          energy: { unit: 'kilocalories', value: kilocalories },
        },
      ],
    })
  }
}
