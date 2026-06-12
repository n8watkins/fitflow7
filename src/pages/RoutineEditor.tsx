import { useState, useMemo, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { EXERCISES, EXERCISE_MAP } from '../data/exercises'
import { CLASSIC_7 } from '../data/routines'
import { getRoutine, saveRoutine, deleteRoutine, newId } from '../lib/storage'
import type { Routine, Category } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function estimateDuration(routine: Pick<Routine, 'exerciseIds' | 'workSeconds' | 'restSeconds' | 'rounds'>): number {
  const count = routine.exerciseIds.length
  if (count === 0) return 0
  // rounds × (count × work + (count - 1) × rest)
  const perRound = count * routine.workSeconds + (count - 1) * routine.restSeconds
  return routine.rounds * perRound
}

function buildNewRoutine(): Routine {
  const now = new Date().toISOString()
  return {
    id: newId(),
    name: 'My Routine',
    exerciseIds: [...CLASSIC_7.exerciseIds],
    workSeconds: CLASSIC_7.workSeconds,
    restSeconds: CLASSIC_7.restSeconds,
    rounds: CLASSIC_7.rounds,
    isSystem: false,
    createdAt: now,
    updatedAt: now,
  }
}

function buildClassicCopy(): Routine {
  const now = new Date().toISOString()
  return {
    id: newId(),
    name: 'Classic 7 (custom)',
    exerciseIds: [...CLASSIC_7.exerciseIds],
    workSeconds: CLASSIC_7.workSeconds,
    restSeconds: CLASSIC_7.restSeconds,
    rounds: CLASSIC_7.rounds,
    isSystem: false,
    createdAt: now,
    updatedAt: now,
  }
}

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------

interface StepperProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (v: number) => void
}

function Stepper({ label, value, min, max, step = 5, unit, onChange }: StepperProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - step))}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-edge bg-card text-lg font-bold text-slate-300 transition hover:bg-card-hover disabled:cursor-not-allowed disabled:opacity-30"
        >
          −
        </button>
        <span className="w-16 text-center text-xl font-bold tabular-nums text-slate-100">
          {value}{unit ?? ''}
        </span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + step))}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-edge bg-card text-lg font-bold text-slate-300 transition hover:bg-card-hover disabled:cursor-not-allowed disabled:opacity-30"
        >
          +
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Exercise row
// ---------------------------------------------------------------------------

interface ExerciseRowProps {
  exId: string
  index: number
  total: number
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}

function ExerciseRow({ exId, index, total, onMoveUp, onMoveDown, onRemove }: ExerciseRowProps) {
  const ex = EXERCISE_MAP[exId]
  if (!ex) return null

  const categoryLabel: Record<string, string> = {
    cardio: 'Cardio',
    core: 'Core',
    upper_body: 'Upper Body',
    lower_body: 'Lower Body',
    mobility: 'Mobility',
    stretching: 'Stretching',
    full_body: 'Full Body',
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-edge bg-card px-4 py-3 transition hover:bg-card-hover">
      <span className="flex-shrink-0 text-2xl">{ex.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-slate-100">{ex.name}</p>
        <p className="truncate text-sm text-slate-400">
          {categoryLabel[ex.category] ?? ex.category} · {ex.difficulty}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Move up"
          disabled={index === 0}
          onClick={onMoveUp}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-sm text-slate-400 transition hover:bg-card hover:text-slate-200 disabled:opacity-30"
        >
          ↑
        </button>
        <button
          type="button"
          aria-label="Move down"
          disabled={index === total - 1}
          onClick={onMoveDown}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-sm text-slate-400 transition hover:bg-card hover:text-slate-200 disabled:opacity-30"
        >
          ↓
        </button>
        <button
          type="button"
          aria-label="Remove exercise"
          onClick={onRemove}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-sm text-slate-400 transition hover:bg-red-900/40 hover:text-red-400"
        >
          ×
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Add exercise picker
// ---------------------------------------------------------------------------

const CATEGORY_PILLS: { label: string; value: Category | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Cardio', value: 'cardio' },
  { label: 'Core', value: 'core' },
  { label: 'Upper Body', value: 'upper_body' },
  { label: 'Lower Body', value: 'lower_body' },
  { label: 'Mobility', value: 'mobility' },
  { label: 'Full Body', value: 'full_body' },
]

interface ExercisePickerProps {
  onAdd: (id: string) => void
}

function ExercisePicker({ onAdd }: ExercisePickerProps) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<Category | 'all'>('all')

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return EXERCISES.filter((ex) => {
      const matchCat = category === 'all' || ex.category === category
      const matchSearch =
        !q ||
        ex.name.toLowerCase().includes(q) ||
        ex.description.toLowerCase().includes(q) ||
        ex.tags.some((t) => t.includes(q))
      return matchCat && matchSearch
    })
  }, [search, category])

  return (
    <div className="rounded-2xl border border-edge bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-400">
        Add Exercise
      </h3>

      {/* Search */}
      <input
        type="text"
        placeholder="Search exercises…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-3 w-full rounded-xl border border-edge bg-surface px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-accent"
      />

      {/* Category pills */}
      <div className="mb-3 flex flex-wrap gap-2">
        {CATEGORY_PILLS.map((pill) => (
          <button
            key={pill.value}
            type="button"
            onClick={() => setCategory(pill.value)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              category === pill.value
                ? 'bg-accent text-slate-900'
                : 'border border-edge text-slate-400 hover:border-accent hover:text-accent'
            }`}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Results */}
      <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
        {filtered.length === 0 && (
          <p className="py-4 text-center text-sm text-slate-500">No exercises match</p>
        )}
        {filtered.map((ex) => (
          <button
            key={ex.id}
            type="button"
            onClick={() => onAdd(ex.id)}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-card-hover"
          >
            <span className="flex-shrink-0 text-xl">{ex.icon}</span>
            <span className="flex-1 min-w-0">
              <span className="block truncate text-sm font-medium text-slate-200">{ex.name}</span>
              <span className="block truncate text-xs text-slate-500">{ex.difficulty}</span>
            </span>
            <span className="flex-shrink-0 text-lg font-bold text-accent">+</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function RoutineEditor() {
  const { routineId } = useParams<{ routineId: string }>()
  const navigate = useNavigate()

  // Resolve initial state
  const { initialRoutine, isSystemCopy, isNotFound } = useMemo(() => {
    if (routineId === 'new') {
      return { initialRoutine: buildNewRoutine(), isSystemCopy: false, isNotFound: false }
    }
    const found = routineId ? getRoutine(routineId) : undefined
    if (!found) {
      return { initialRoutine: null, isSystemCopy: false, isNotFound: true }
    }
    if (found.isSystem) {
      return { initialRoutine: buildClassicCopy(), isSystemCopy: true, isNotFound: false }
    }
    return { initialRoutine: { ...found }, isSystemCopy: false, isNotFound: false }
  }, [routineId])

  const [routine, setRoutine] = useState<Routine | null>(initialRoutine)

  const isNew = routineId === 'new' || isSystemCopy
  const canDelete = !isNew && routine !== null && !routine.isSystem

  const totalSeconds = routine ? estimateDuration(routine) : 0

  // --- Field helpers ---
  const setName = useCallback((name: string) => setRoutine((r) => r ? { ...r, name } : r), [])
  const setWork = useCallback((v: number) => setRoutine((r) => r ? { ...r, workSeconds: v } : r), [])
  const setRest = useCallback((v: number) => setRoutine((r) => r ? { ...r, restSeconds: v } : r), [])
  const setRounds = useCallback((v: number) => setRoutine((r) => r ? { ...r, rounds: v } : r), [])

  const moveUp = useCallback((idx: number) => {
    setRoutine((r) => {
      if (!r || idx <= 0) return r
      const ids = [...r.exerciseIds]
      ;[ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]]
      return { ...r, exerciseIds: ids }
    })
  }, [])

  const moveDown = useCallback((idx: number) => {
    setRoutine((r) => {
      if (!r || idx >= r.exerciseIds.length - 1) return r
      const ids = [...r.exerciseIds]
      ;[ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]]
      return { ...r, exerciseIds: ids }
    })
  }, [])

  const removeExercise = useCallback((idx: number) => {
    setRoutine((r) => {
      if (!r) return r
      const ids = r.exerciseIds.filter((_, i) => i !== idx)
      return { ...r, exerciseIds: ids }
    })
  }, [])

  const addExercise = useCallback((id: string) => {
    setRoutine((r) => r ? { ...r, exerciseIds: [...r.exerciseIds, id] } : r)
  }, [])

  const resetToClassic = useCallback(() => {
    setRoutine((r) => r ? {
      ...r,
      exerciseIds: [...CLASSIC_7.exerciseIds],
      workSeconds: CLASSIC_7.workSeconds,
      restSeconds: CLASSIC_7.restSeconds,
      rounds: CLASSIC_7.rounds,
    } : r)
  }, [])

  const handleSave = useCallback(() => {
    if (!routine) return
    saveRoutine({ ...routine, updatedAt: new Date().toISOString() })
    navigate('/')
  }, [routine, navigate])

  const handleStart = useCallback(() => {
    if (!routine) return
    const saved = { ...routine, updatedAt: new Date().toISOString() }
    saveRoutine(saved)
    navigate(`/workout/${saved.id}`)
  }, [routine, navigate])

  const handleDelete = useCallback(() => {
    if (!routine || !canDelete) return
    if (!confirm(`Delete "${routine.name}"? This cannot be undone.`)) return
    deleteRoutine(routine.id)
    navigate('/')
  }, [routine, canDelete, navigate])

  // ---------------------------------------------------------------------------
  // Guard: not found
  // ---------------------------------------------------------------------------
  if (isNotFound) {
    return (
      <div className="flex flex-col items-center gap-6 py-24 text-center">
        <span className="text-6xl">🤷</span>
        <h1 className="text-2xl font-bold text-slate-100">Routine not found</h1>
        <p className="text-slate-400">That routine doesn't exist or was deleted.</p>
        <Link to="/" className="rounded-xl bg-accent px-5 py-2.5 font-semibold text-slate-900 transition hover:opacity-90">
          Back to Dashboard
        </Link>
      </div>
    )
  }

  if (!routine) return null

  const nameEmpty = routine.name.trim() === ''
  const noExercises = routine.exerciseIds.length === 0
  const saveDisabled = nameEmpty || noExercises

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="text-sm text-slate-400 transition hover:text-slate-200"
              aria-label="Back to Dashboard"
            >
              ← Dashboard
            </Link>
          </div>
          <h1 className="mt-1 text-3xl font-bold text-slate-100">
            {isNew ? 'New Routine' : 'Edit Routine'}
          </h1>
          {isSystemCopy && (
            <p className="mt-1 rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-1.5 text-sm text-amber-400">
              Classic 7 is a system routine — you're editing a copy.
            </p>
          )}
        </div>

        {/* Estimated duration badge */}
        <div className="flex-shrink-0 rounded-2xl border border-edge bg-card px-5 py-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Est. duration</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums text-accent">{formatDuration(totalSeconds)}</p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        {/* Left column: name + exercise list */}
        <div className="space-y-6">
          {/* Name */}
          <div>
            <label htmlFor="routine-name" className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">
              Routine Name
            </label>
            <input
              id="routine-name"
              type="text"
              value={routine.name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="Name your routine"
              className="w-full rounded-xl border border-edge bg-card px-4 py-2.5 text-lg font-semibold text-slate-100 placeholder-slate-600 outline-none transition focus:border-accent"
            />
            {nameEmpty && (
              <p className="mt-1 text-xs text-red-400">Name is required to save.</p>
            )}
          </div>

          {/* Timing steppers */}
          <div className="rounded-2xl border border-edge bg-card p-4">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-400">Timing</h2>
            <div className="flex flex-wrap gap-8">
              <Stepper
                label="Work"
                value={routine.workSeconds}
                min={10}
                max={120}
                step={5}
                unit="s"
                onChange={setWork}
              />
              <Stepper
                label="Rest"
                value={routine.restSeconds}
                min={0}
                max={60}
                step={5}
                unit="s"
                onChange={setRest}
              />
              <Stepper
                label="Rounds"
                value={routine.rounds}
                min={1}
                max={5}
                step={1}
                onChange={setRounds}
              />
            </div>
          </div>

          {/* Exercise list */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Exercises <span className="ml-1 tabular-nums text-slate-500">({routine.exerciseIds.length})</span>
              </h2>
              <button
                type="button"
                onClick={resetToClassic}
                className="text-xs text-slate-500 underline-offset-2 hover:text-accent hover:underline"
              >
                Reset to Classic 7
              </button>
            </div>

            {noExercises && (
              <div className="rounded-xl border border-dashed border-edge py-8 text-center text-sm text-slate-500">
                No exercises — add some below.
              </div>
            )}

            <div className="space-y-2">
              {routine.exerciseIds.map((id, idx) => (
                <ExerciseRow
                  key={`${id}-${idx}`}
                  exId={id}
                  index={idx}
                  total={routine.exerciseIds.length}
                  onMoveUp={() => moveUp(idx)}
                  onMoveDown={() => moveDown(idx)}
                  onRemove={() => removeExercise(idx)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right column: picker + actions */}
        <div className="space-y-4">
          <ExercisePicker onAdd={addExercise} />

          {/* Action buttons */}
          <div className="rounded-2xl border border-edge bg-card p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Actions</h3>

            <button
              type="button"
              onClick={handleStart}
              disabled={saveDisabled}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 font-bold text-slate-900 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ▶ Start Workout
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saveDisabled}
              title={saveDisabled ? (nameEmpty ? 'Add a name first' : 'Add at least one exercise') : undefined}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-accent py-3 font-semibold text-accent transition hover:bg-accent hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Save Routine
            </button>

            {saveDisabled && (
              <p className="text-center text-xs text-slate-500">
                {nameEmpty ? 'Enter a name to save.' : 'Add at least one exercise to save.'}
              </p>
            )}

            {canDelete && (
              <button
                type="button"
                onClick={handleDelete}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-800/60 py-3 font-semibold text-red-400 transition hover:bg-red-900/30"
              >
                Delete Routine
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
