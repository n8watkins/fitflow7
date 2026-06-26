import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useSyncStore } from '../store/syncStore'
import { getRoutines, newId, saveRoutine } from '../lib/storage'
import { EXERCISE_MAP } from '../data/exercises'
import {
  listPublicRoutines,
  publishRoutine,
  reportRoutine,
  type PublicRoutine,
} from '../lib/community'
import type { Routine } from '../types'

function subtitle(r: {
  exerciseIds: string[]
  workSeconds: number
  restSeconds: number
  rounds: number
}): string {
  const n = r.exerciseIds.length
  return `${n} exercise${n === 1 ? '' : 's'} · ${r.workSeconds}s work / ${r.restSeconds}s rest · ${r.rounds} round${r.rounds === 1 ? '' : 's'}`
}

// ---------------------------------------------------------------------------
// "Your routines" — publish a local routine to the library.
// ---------------------------------------------------------------------------

function PublishableRow({ routine, ownerName }: { routine: Routine; ownerName?: string }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function handlePublish() {
    setBusy(true)
    setMsg(null)
    const result = await publishRoutine(routine, ownerName)
    setBusy(false)
    setMsg(
      result.ok
        ? { ok: true, text: 'Published' }
        : { ok: false, text: result.error ?? 'Publish failed' },
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-edge bg-card px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-slate-100">{routine.name}</div>
        <div className="mt-0.5 text-sm text-slate-400">{subtitle(routine)}</div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        {msg && (
          <span className={`text-sm ${msg.ok ? 'text-emerald-400 light:text-emerald-600' : 'text-red-400 light:text-red-600'}`}>
            {msg.text}
          </span>
        )}
        <button
          type="button"
          onClick={handlePublish}
          disabled={busy}
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:brightness-110 active:scale-95 disabled:opacity-50"
        >
          {busy ? 'Publishing…' : 'Publish'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// "Community routines" — clone or report a published routine.
// ---------------------------------------------------------------------------

function PublicRow({ routine }: { routine: PublicRoutine }) {
  const [added, setAdded] = useState(false)
  const [reported, setReported] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleClone() {
    // Keep only exercises this app version knows, so the cloned routine is
    // actually playable (a community routine could reference unknown ids).
    const known = routine.exerciseIds.filter((id) => EXERCISE_MAP[id])
    if (known.length === 0) {
      setError('Uses exercises not in your version')
      return
    }
    const stamp = new Date().toISOString()
    const cloned: Routine = {
      id: newId(),
      name: `${routine.name} (copy)`,
      description: routine.description,
      exerciseIds: known,
      workSeconds: routine.workSeconds,
      restSeconds: routine.restSeconds,
      rounds: routine.rounds,
      isSystem: false,
      createdAt: stamp,
      updatedAt: stamp,
    }
    saveRoutine(cloned)
    setAdded(true)
  }

  async function handleReport() {
    setReported(true)
    await reportRoutine(routine.slug)
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-edge bg-card px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-100">{routine.name}</span>
          {routine.ownerName && (
            <span className="rounded-full border border-edge px-2 py-0.5 text-xs text-slate-500">
              by {routine.ownerName}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-sm text-slate-400">{subtitle(routine)}</div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {error && <span className="text-xs text-red-400 light:text-red-600">{error}</span>}
        <button
          type="button"
          onClick={handleClone}
          disabled={added}
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:brightness-110 active:scale-95 disabled:opacity-60"
        >
          {added ? 'Added' : 'Clone to my routines'}
        </button>
        <button
          type="button"
          onClick={handleReport}
          disabled={reported}
          className="rounded-lg border border-edge bg-card px-3 py-2.5 text-sm font-medium text-slate-400 transition hover:bg-card-hover disabled:opacity-60"
        >
          {reported ? 'Reported' : 'Report'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Community() {
  const location = useLocation()
  const dataVersion = useSyncStore((s) => s.dataVersion)
  const user = useSyncStore((s) => s.user)

  const [loading, setLoading] = useState(true)
  const [publicRoutines, setPublicRoutines] = useState<PublicRoutine[]>([])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const myRoutines = useMemo(() => getRoutines().filter((r) => !r.isSystem), [location.key, dataVersion])

  useEffect(() => {
    let active = true
    listPublicRoutines().then((rows) => {
      if (active) {
        setPublicRoutines(rows)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Community</h1>
        <p className="mt-1 text-sm text-slate-500">
          Share routines and discover others'. Requires sign-in + cloud sync.
        </p>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Your routines                                                     */}
      {/* ---------------------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">
          Your routines
        </h2>
        {!user ? (
          <div className="rounded-2xl border border-edge bg-card p-6 text-sm text-slate-400">
            Sign in (Settings) to publish.
          </div>
        ) : myRoutines.length === 0 ? (
          <div className="rounded-2xl border border-edge bg-card p-6 text-sm text-slate-400">
            You don't have any custom routines yet. Create one to share it here.
          </div>
        ) : (
          <div className="space-y-2">
            {myRoutines.map((r) => (
              <PublishableRow key={r.id} routine={r} ownerName={user?.name ?? undefined} />
            ))}
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Community routines                                                 */}
      {/* ---------------------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">
          Community routines
        </h2>
        {loading ? (
          <div className="rounded-2xl border border-edge bg-card p-6 text-sm text-slate-400">
            Loading…
          </div>
        ) : publicRoutines.length === 0 ? (
          <div className="rounded-2xl border border-edge bg-card p-10 text-center">
            <div className="mb-3 text-5xl">🌱</div>
            <h3 className="mb-1 text-lg font-semibold text-slate-100">Nothing here yet</h3>
            <p className="text-slate-400">
              Nothing here yet, or cloud sync isn't enabled.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {publicRoutines.map((r) => (
              <PublicRow key={r.slug} routine={r} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
