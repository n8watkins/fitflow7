import { useState, useMemo } from 'react'
import { EXERCISES, EXERCISE_MAP } from '../data/exercises'
import type { Category, Difficulty, Exercise } from '../types'
import ExerciseVisual from '../components/ExerciseVisual'
import ExerciseModal from '../components/ExerciseModal'

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
  { label: 'Stretching', value: 'stretching' },
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

const DIFFICULTY_COLOR: Record<Difficulty, string> = {
  beginner: 'bg-emerald-900/40 text-emerald-300 light:bg-emerald-100 light:text-emerald-700',
  intermediate: 'bg-amber-900/40 text-amber-300 light:bg-amber-100 light:text-amber-700',
  advanced: 'bg-red-900/40 text-red-300 light:bg-red-100 light:text-red-700',
}

const IMPACT_COLOR: Record<string, string> = {
  low: 'bg-sky-900/40 text-sky-300 light:bg-sky-100 light:text-sky-700',
  medium: 'bg-amber-900/40 text-amber-300 light:bg-amber-100 light:text-amber-700',
  high: 'bg-red-900/40 text-red-300 light:bg-red-100 light:text-red-700',
}

// ---------------------------------------------------------------------------
// Exercise card (collapsed; tap opens the detail modal)
// ---------------------------------------------------------------------------

function ExerciseCard({ exercise: ex, onOpen }: { exercise: Exercise; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-full flex-col rounded-2xl border border-edge bg-card p-5 text-left transition hover:border-accent/50 hover:bg-card-hover active:scale-[0.99]"
    >
      {/* Visual (animates on hover) */}
      <div className="mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-surface text-4xl">
        <ExerciseVisual exercise={ex} imgClassName="h-full w-full object-cover" emojiClassName="text-4xl" />
      </div>

      <h2 className="mb-1 text-base font-bold leading-tight text-slate-100">{ex.name}</h2>

      <div className="mb-3 flex flex-wrap gap-1.5">
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

      <p className="line-clamp-3 flex-1 text-xs leading-relaxed text-slate-500">{ex.description}</p>

      <span className="mt-3 text-xs font-semibold text-accent">View details →</span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Library() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<Category | 'all'>('all')
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all')
  const [openId, setOpenId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return EXERCISES.filter((ex) => {
      const matchCat = category === 'all' || ex.category === category
      const matchDiff = difficulty === 'all' || ex.difficulty === difficulty
      const matchSearch =
        !q ||
        ex.name.toLowerCase().includes(q) ||
        ex.description.toLowerCase().includes(q) ||
        ex.tags.some((t) => t.toLowerCase().includes(q)) ||
        ex.primaryMuscles.some((m) => m.toLowerCase().includes(q))
      return matchCat && matchDiff && matchSearch
    })
  }, [search, category, difficulty])

  const openExercise = openId ? EXERCISE_MAP[openId] : undefined

  return (
    <div className="space-y-6">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100 sm:text-3xl">Exercise Library</h1>
        <p className="mt-1 text-slate-400">Browse all {EXERCISES.length} exercises</p>
      </div>

      {/* Filters */}
      <div className="space-y-4 rounded-2xl border border-edge bg-card p-4">
        <input
          type="text"
          placeholder="Search by name, muscle, or tag…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-edge bg-surface px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 outline-none transition focus:border-accent"
        />

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Category</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_PILLS.map((pill) => (
              <button
                key={pill.value}
                type="button"
                onClick={() => setCategory(pill.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-95 ${
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

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Difficulty</p>
          <div className="flex flex-wrap gap-2">
            {DIFFICULTY_PILLS.map((pill) => (
              <button
                key={pill.value}
                type="button"
                onClick={() => setDifficulty(pill.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-95 ${
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {filtered.map((ex) => (
            <ExerciseCard key={ex.id} exercise={ex} onOpen={() => setOpenId(ex.id)} />
          ))}
        </div>
      )}

      {openExercise && (
        <ExerciseModal exercise={openExercise} onClose={() => setOpenId(null)} onJump={(id) => setOpenId(id)} />
      )}
    </div>
  )
}
