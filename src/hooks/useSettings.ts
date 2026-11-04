import { useSyncExternalStore } from 'react'
import { getSettings, SETTINGS_EVENT } from '../lib/storage'
import type { UserSettings } from '../types'

// The stored settings, live: re-renders when they change on this screen,
// another tab or a sync pull. Screens that edit settings read from here and
// write with saveSettings, so a pull that lands while the screen is open can
// never be overwritten by the values the screen loaded with.

let cached: { raw: string; value: UserSettings } | null = null

function snapshot(): UserSettings {
  const value = getSettings()
  const raw = JSON.stringify(value)
  if (!cached || cached.raw !== raw) cached = { raw, value }
  return cached.value
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith('fitflow.settings')) onChange()
  }
  window.addEventListener(SETTINGS_EVENT, onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(SETTINGS_EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}

export function useSettings(): UserSettings {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
