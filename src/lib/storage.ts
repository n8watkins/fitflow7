import { DEFAULT_SETTINGS, type Routine, type UserSettings, type WorkoutSession } from '../types'
import { SYSTEM_ROUTINES } from '../data/routines'

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------
const KEY = {
  routines: 'fitflow.routines',
  sessions: 'fitflow.sessions',
  settings: 'fitflow.settings',
  lastRoutineId: 'fitflow.lastRoutineId',
} as const

// ---------------------------------------------------------------------------
// Generic read / write helpers (resilient JSON)
// ---------------------------------------------------------------------------
function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Silently ignore (e.g. private mode quota exceeded)
  }
}

// ---------------------------------------------------------------------------
// Routines
// ---------------------------------------------------------------------------

/** Returns only user-saved routines (callers merge system routines themselves). */
export function getRoutines(): Routine[] {
  return readJSON<Routine[]>(KEY.routines, [])
}

/** Looks up a routine by id — checks user routines first, then system routines. */
export function getRoutine(id: string): Routine | undefined {
  const userRoutines = getRoutines()
  const found = userRoutines.find((r) => r.id === id)
  if (found) return found
  return SYSTEM_ROUTINES.find((r) => r.id === id)
}

export function saveRoutine(r: Routine): void {
  const routines = getRoutines()
  const idx = routines.findIndex((x) => x.id === r.id)
  if (idx >= 0) {
    routines[idx] = r
  } else {
    routines.push(r)
  }
  writeJSON(KEY.routines, routines)
}

export function deleteRoutine(id: string): void {
  const routines = getRoutines().filter((r) => r.id !== id)
  writeJSON(KEY.routines, routines)
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/** Returns all workout sessions, sorted newest-first. */
export function getSessions(): WorkoutSession[] {
  const sessions = readJSON<WorkoutSession[]>(KEY.sessions, [])
  return sessions.sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  )
}

export function saveSession(s: WorkoutSession): void {
  const sessions = readJSON<WorkoutSession[]>(KEY.sessions, [])
  const idx = sessions.findIndex((x) => x.id === s.id)
  if (idx >= 0) {
    sessions[idx] = s
  } else {
    sessions.push(s)
  }
  writeJSON(KEY.sessions, sessions)
}

/** Permanently removes all stored workout sessions. */
export function clearSessions(): void {
  try {
    localStorage.removeItem(KEY.sessions)
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Returns settings merged over DEFAULT_SETTINGS so new keys always have values. */
export function getSettings(): UserSettings {
  const stored = readJSON<Partial<UserSettings>>(KEY.settings, {})
  return { ...DEFAULT_SETTINGS, ...stored }
}

export function saveSettings(s: UserSettings): void {
  writeJSON(KEY.settings, s)
}

// ---------------------------------------------------------------------------
// Last routine id
// ---------------------------------------------------------------------------

export function getLastRoutineId(): string | undefined {
  try {
    const val = localStorage.getItem(KEY.lastRoutineId)
    return val ?? undefined
  } catch {
    return undefined
  }
}

export function setLastRoutineId(id: string): void {
  try {
    localStorage.setItem(KEY.lastRoutineId, id)
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

export function newId(): string {
  return crypto.randomUUID()
}
