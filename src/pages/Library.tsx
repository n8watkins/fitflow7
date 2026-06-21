import { useState, useMemo, useCallback } from 'react'
import { EXERCISES, EXERCISE_MAP } from '../data/exercises'
import type { Category, Difficulty, Exercise } from '../types'
import ExerciseVisual from '../components/ExerciseVisual'

// ---------------------------------------------------------------------------
// Constants
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

const DIFFICULTY_PILLS: { label: string; value: Difficulty | 'all' }[] = [
  { label: 'All levels', value: 'all' },
  { label: 'Beginner', value: 'beginner' },
  { label: 'Intermediate', value: 'intermediate' },
  { label: 'Advanced', value: 'advanced' },
]

const CATEGORY_LABEL: Record<Category, string> = {
  cardio: 'Cardio',
  core: 'Core',
  upper_body: 'Upper Body',
  lower_body: 'Lower Body',
  mobility: 'Mobility',
  stretching: 'Stretching',
  full_body: 'Full Body',
}

const IMPACT_COLOR: Record<string, string> = {
  low: 'bg-emerald-900/40 text-emerald-400',
  medium: 'bg-amber-900/40 text-amber-400',
  high: 'bg-red-900/40 text-red-400',
}

const DIFFICULTY_COLOR: Record<Difficulty, string> = {
  beginner: 'bg-emerald-900/40 text-emerald-400',
  intermediate: 'bg-amber-900/40 text-amber-400',
  advanced: 'bg-red-900/40 text-red-400',
}

// ---------------------------------------------------------------------------
// Variation chip
// ---------------------------------------------------------------------------

interface VariationChipProps {
  label: string
  id: string
  onJump: (id: string) => void
}

function VariationChip({ label, id, onJump }: VariationChipProps) {
  const ex = EXERCISE_MAP[id]
  if (!ex) return null
  return (
    <button
      type="button"
      onClick={() => onJump(id)}
      title={`Jump to ${ex.name}`}
      className="inline-flex items-center gap-1 rounded-full border border-edge bg-card px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:border-accent hover:text-accent"
    >
      <span>{ex.icon}</span>
      <span>{label}: {ex.name}</span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Exercise card (collapsed + expanded)
// ---------------------------------------------------------------------------

interface ExerciseCardProps {
  exercise: Exercise
  isExpanded: boolean
  onToggle: () => void
  onJump: (id: string) => void
}

function ExerciseCard({ exercise: ex, isExpanded, onToggle, onJump }: ExerciseCardProps) {
  return (
    <div
      className={`rounded-2xl border bg-card transition ${
        isExpanded ? 'border-accent/60 col-span-full' : 'border-edge hover:bg-card-hover cursor-pointer'
      }`}
      onClick={isExpanded ? undefined : onToggle}
      role={isExpanded ? undefined : 'button'}
      tabIndex={isExpanded ? undefined : 0}
      aria-expanded={isExpanded}
      onKeyDown={isExpanded ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
    >
      {isExpanded ? (
        // ---- Expanded view ----
        <div className="p-6">
          <div className="flex items-start gap-5">
            {/* Icon */}
            <div className="flex-shrink-0 flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-surface text-5xl">
              <ExerciseVisual exercise={ex} imgClassName="h-full w-full object-cover" />
            </div>

            {/* Name + badges */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="text-2xl font-bold text-slate-100">{ex.name}</h2>
                <button
                  type="button"
                  onClick={onToggle}
                  aria-label="Collapse"
                  className="rounded-lg border border-edge px-3 py-1 text-sm text-slate-400 transition hover:bg-card-hover hover:text-slate-200"
                >
                  Close ×
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full bg-card border border-edge px-2.5 py-0.5 text-xs font-semibold text-slate-300">
                  {CATEGORY_LABEL[ex.category] ?? ex.category}
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${DIFFICULTY_COLOR[ex.difficulty]}`}>
                  {ex.difficulty}
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${IMPACT_COLOR[ex.impactLevel] ?? ''}`}>
                  {ex.impactLevel} impact
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-400 leading-relaxed">{ex.description}</p>
            </div>
          </div>

          {/* Details grid */}
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {/* Instructions */}
            <div className="sm:col-span-2 lg:col-span-2">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Instructions</h3>
              <ol className="space-y-2">
                {ex.instructions.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm text-slate-300">
                    <span className="flex-shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Side panel */}
            <div className="space-y-4">
              {/* Target muscles */}
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Target Muscles</h3>
                <div className="flex flex-wrap gap-1.5">
                  {ex.primaryMuscles.map((m) => (
                    <span key={m} className="rounded-full bg-accent/10 border border-accent/30 px-2 py-0.5 text-xs text-accent">
                      {m}
                    </span>
                  ))}
                  {ex.secondaryMuscles.map((m) => (
                    <span key={m} className="rounded-full border border-edge px-2 py-0.5 text-xs text-slate-500">
                      {m}
                    </span>
                  ))}
                </div>
              </div>

              {/* Equipment */}
              {ex.equipment.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Equipment</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {ex.equipment.map((e) => (
                      <span key={e} className="rounded-full border border-edge px-2 py-0.5 text-xs text-slate-400">
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {ex.equipment.length === 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Equipment</h3>
                  <span className="text-xs text-slate-500">None needed</span>
                </div>
              )}

              {/* Variations */}
              {(ex.easierVariationId || ex.harderVariationId) && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Variations</h3>
                  <div className="flex flex-col gap-1.5">
                    {ex.easierVariationId && (
                      <VariationChip label="Easier" id={ex.easierVariationId} onJump={onJump} />
                    )}
                    {ex.harderVariationId && (
                      <VariationChip label="Harder" id={ex.harderVariationId} onJump={onJump} />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Common mistake */}
          {ex.commonMistake && (
            <div className="mt-5 flex gap-3 rounded-xl border border-amber-700/40 bg-amber-950/20 px-4 py-3">
              <span className="flex-shrink-0 text-amber-400">⚠</span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">Common Mistake</p>
                <p className="mt-1 text-sm text-amber-200/80">{ex.commonMistake}</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        // ---- Collapsed card ----
        <div className="flex flex-col p-5 h-full">
          {/* Icon */}
          <div className="mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-surface text-4xl">
            <ExerciseVisual exercise={ex} imgClassName="h-full w-full object-cover" />
          </div>

          {/* Name */}
          <h2 className="text-base font-bold text-slate-100 leading-tight mb-1">{ex.name}</h2>

          {/* Badges */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            <span className="rounded-full border border-edge px-2 py-0.5 text-xs text-slate-400">
              {CATEGORY_LABEL[ex.category] ?? ex.category}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${DIFFICULTY_COLOR[ex.difficulty]}`}>
              {ex.difficulty}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${IMPACT_COLOR[ex.impactLevel] ?? ''}`}>
              {ex.impactLevel}
            </span>
          </div>

          {/* Description */}
          <p className="text-xs text-slate-500 leading-relaxed line-clamp-3 flex-1">{ex.description}</p>

          <p className="mt-3 text-xs font-semibold text-accent">Tap to expand →</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Library() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<Category | 'all'>('all')
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return EXERCISES.filter((ex) => {
      const matchCat = category === 'all' || ex.category === category
      const matchDiff = difficulty === 'all' || ex.difficulty === difficulty
      const matchSearch =
        !q ||
        ex.name.toLowerCase().includes(q) ||
        ex.description.toLowerCase().includes(q) ||
        ex.tags.some((t) => t.includes(q)) ||
        ex.primaryMuscles.some((m) => m.includes(q))
      return matchCat && matchDiff && matchSearch
    })
  }, [search, category, difficulty])

  const handleToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }, [])

  // Jump to a variation card: reset filters so target card is visible, expand it, and scroll
  const handleJump = useCallback((id: string) => {
    setSearch('')
    setCategory('all')
    setDifficulty('all')
    setExpandedId(id)
    // Scroll card into view on next tick
    requestAnimationFrame(() => {
      document.getElementById(`ex-card-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [])

  return (
    <div className="space-y-6">
      {/* Page title */}
      <div>
        <h1 className="text-3xl font-bold text-slate-100">Exercise Library</h1>
        <p className="mt-1 text-slate-400">Browse all {EXERCISES.length} exercises</p>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-edge bg-card p-4 space-y-4">
        {/* Search */}
        <input
          type="text"
          placeholder="Search by name, muscle, or tag…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-edge bg-surface px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 outline-none transition focus:border-accent"
        />

        {/* Category pills */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Category</p>
          <div className="flex flex-wrap gap-2">
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
        </div>

        {/* Difficulty pills */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Difficulty</p>
          <div className="flex flex-wrap gap-2">
            {DIFFICULTY_PILLS.map((pill) => (
              <button
                key={pill.value}
                type="button"
                onClick={() => setDifficulty(pill.value)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  difficulty === pill.value
                    ? 'bg-accent text-slate-900'
                    : 'border border-edge text-slate-400 hover:border-accent hover:text-accent'
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results count */}
      <p className="text-sm text-slate-500">
        {filtered.length === EXERCISES.length
          ? `Showing all ${EXERCISES.length} exercises`
          : `${filtered.length} of ${EXERCISES.length} exercises`}
      </p>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="py-24 text-center">
          <span className="text-5xl">🔍</span>
          <p className="mt-4 text-lg font-semibold text-slate-300">No exercises found</p>
          <p className="text-sm text-slate-500">Try adjusting your search or filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((ex) => (
            <div key={ex.id} id={`ex-card-${ex.id}`} className={expandedId === ex.id ? 'sm:col-span-2 lg:col-span-3' : ''}>
              <ExerciseCard
                exercise={ex}
                isExpanded={expandedId === ex.id}
                onToggle={() => handleToggle(ex.id)}
                onJump={handleJump}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
