import { useEffect } from 'react'
import type { Category, Difficulty, Exercise } from '../types'
import { EXERCISE_MAP } from '../data/exercises'
import ExerciseVisual from './ExerciseVisual'
import { IconClose } from './icons'

const CATEGORY_LABEL: Record<Category, string> = {
  cardio: 'Cardio',
  core: 'Core',
  upper_body: 'Upper Body',
  lower_body: 'Lower Body',
  mobility: 'Mobility',
  stretching: 'Stretching',
  full_body: 'Full Body',
}

const LEVEL_COLOR: Record<Difficulty, string> = {
  beginner: 'bg-emerald-900/40 text-emerald-300',
  intermediate: 'bg-amber-900/40 text-amber-300',
  advanced: 'bg-red-900/40 text-red-300',
}

const IMPACT_COLOR: Record<string, string> = {
  low: 'bg-sky-900/40 text-sky-300',
  medium: 'bg-amber-900/40 text-amber-300',
  high: 'bg-red-900/40 text-red-300',
}

/**
 * Full exercise detail in a dialog. Desktop: centered modal. Mobile: full-screen
 * sheet. Closes on backdrop click, the X button, or Escape. `onJump` swaps to a
 * variation in place (parent owns which exercise is open).
 */
export default function ExerciseModal({
  exercise: ex,
  onClose,
  onJump,
}: {
  exercise: Exercise
  onClose: () => void
  onJump?: (id: string) => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const variations = [
    ex.easierVariationId ? { label: 'Easier', id: ex.easierVariationId } : null,
    ex.harderVariationId ? { label: 'Harder', id: ex.harderVariationId } : null,
  ].filter((v): v is { label: string; id: string } => v !== null && !!EXERCISE_MAP[v.id])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-stretch justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={ex.name}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div
        className="relative z-[61] flex h-full w-full flex-col overflow-y-auto border-edge bg-card sm:h-auto sm:max-h-[88vh] sm:max-w-2xl sm:rounded-2xl sm:border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="sticky top-0 z-10 flex items-start gap-4 border-b border-edge bg-card/95 p-4 backdrop-blur sm:p-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-surface text-4xl">
            <ExerciseVisual exercise={ex} autoPlay imgClassName="h-full w-full object-cover" emojiClassName="text-4xl" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-slate-100">{ex.name}</h2>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <span className="rounded-full border border-edge px-2 py-0.5 text-xs font-semibold text-slate-300">
                {CATEGORY_LABEL[ex.category] ?? ex.category}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${LEVEL_COLOR[ex.difficulty]}`}>
                {ex.difficulty}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${IMPACT_COLOR[ex.impactLevel] ?? ''}`}>
                {ex.impactLevel} impact
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-edge text-slate-400 transition hover:bg-card-hover hover:text-slate-100 active:scale-95"
          >
            <IconClose className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-6 p-4 sm:p-5">
          <p className="text-sm leading-relaxed text-slate-400">{ex.description}</p>

          {/* Instructions */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Instructions</h3>
            <ol className="space-y-2.5">
              {ex.instructions.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm text-slate-300">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Muscles */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Target muscles</h3>
            <div className="flex flex-wrap gap-1.5">
              {ex.primaryMuscles.map((m) => (
                <span key={m} className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs text-accent">
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

          {/* Variations */}
          {variations.length > 0 && onJump && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Variations</h3>
              <div className="flex flex-wrap gap-2">
                {variations.map((v) => {
                  const target = EXERCISE_MAP[v.id]
                  return (
                    <button
                      key={v.id}
                      onClick={() => onJump(v.id)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-edge bg-surface px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-accent hover:text-accent active:scale-95"
                    >
                      <span>{target.icon}</span>
                      {v.label}: {target.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Common mistake */}
          {ex.commonMistake && (
            <div className="flex gap-3 rounded-xl border border-amber-700/40 bg-amber-950/20 px-4 py-3">
              <span className="shrink-0 text-amber-400">⚠</span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">Common mistake</p>
                <p className="mt-1 text-sm text-amber-200/80">{ex.commonMistake}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
