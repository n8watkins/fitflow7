import type { Routine } from '../types'

// ---------------------------------------------------------------------------
// Community routine library — thin client helpers over /api/routines/*.
//
// Every call is best-effort: a missing backend, a network error, or a non-200
// response resolves to a safe default (empty list / failure flag) rather than
// throwing, so the UI degrades to "community unavailable" instead of crashing.
// ---------------------------------------------------------------------------

export interface PublicRoutine {
  slug: string
  name: string
  description?: string
  exerciseIds: string[]
  workSeconds: number
  restSeconds: number
  rounds: number
  ownerName?: string
  createdAt: string
}

/** Most-recent published routines, or [] if unavailable. */
export async function listPublicRoutines(): Promise<PublicRoutine[]> {
  try {
    const res = await fetch('/api/routines/public', { credentials: 'include' })
    if (!res.ok) return []
    const data = (await res.json()) as { routines?: PublicRoutine[] }
    return Array.isArray(data.routines) ? data.routines : []
  } catch {
    return []
  }
}

/** Publishes a routine snapshot. Returns { ok, error? } — never throws. */
export async function publishRoutine(
  routine: Routine,
  ownerName?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/routines/publish', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routine: {
          name: routine.name,
          description: routine.description,
          exerciseIds: routine.exerciseIds,
          workSeconds: routine.workSeconds,
          restSeconds: routine.restSeconds,
          rounds: routine.rounds,
        },
        ownerName,
      }),
    })
    if (res.ok) return { ok: true }
    let error = 'Publish failed'
    try {
      const data = (await res.json()) as { error?: string }
      if (data.error) error = data.error
    } catch {
      // non-JSON body — keep the generic message
    }
    return { ok: false, error }
  } catch {
    return { ok: false, error: 'Publish failed' }
  }
}

/** Flags a published routine for review. Returns true on success. */
export async function reportRoutine(slug: string): Promise<boolean> {
  try {
    const res = await fetch('/api/routines/report', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    })
    return res.ok
  } catch {
    return false
  }
}
