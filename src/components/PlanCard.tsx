import { Link } from 'react-router-dom'
import { nextLevel, PLAN_STAGES, TIER_LABEL, WORKOUTS_PER_STAGE, type PlanWorkout } from '../lib/plan'
import { estimateMinutes } from '../lib/workout'
import { getRoutine, saveTrainingProfile } from '../lib/storage'
import { CLASSIC_7 } from '../data/routines'
import { IconPlay } from './icons'
import type { Level } from '../types'

// The home card while the four-week starter plan runs: this week, today's
// workout, progress toward the next week, and the four weeks at a glance.

const STAGE_TEXT = ['Easier moves, 1 round', 'Standard moves, 1 round', 'Standard moves, 2 rounds', 'Harder moves, 2 rounds']

export default function PlanCard({ plan, level, onChange }: { plan: PlanWorkout; level: Level; onChange?: () => void }) {
  const routine = getRoutine(plan.routineId) ?? CLASSIC_7
  const minutes = estimateMinutes({ ...routine, workSeconds: plan.workSeconds, restSeconds: plan.restSeconds }, plan.rounds)
  const next = PLAN_STAGES[plan.stage]

  if (plan.complete) {
    return (
      <section className="rounded-3xl border border-violet-500/30 bg-violet-950/30 p-6 light:border-violet-300 light:bg-violet-50">
        <div className="text-xs font-bold uppercase tracking-widest text-violet-300 light:text-violet-700">Plan complete</div>
        <div className="mt-1 text-2xl font-extrabold text-slate-100">Four weeks, {plan.totalDone} workouts</div>
        <p className="mt-1 text-sm text-slate-400">Start again one level up, or keep going with free workouts below.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              saveTrainingProfile({ level: nextLevel(level), planStartedAt: new Date().toISOString() })
              onChange?.()
            }}
            className="rounded-full bg-accent px-6 py-3 font-bold text-slate-900 transition hover:brightness-110"
          >
            {level === 'advanced' ? 'Run it again' : 'Start the next level'}
          </button>
          <button
            type="button"
            onClick={() => {
              saveTrainingProfile({ planStartedAt: undefined })
              onChange?.()
            }}
            className="rounded-full border border-edge px-5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-card-hover"
          >
            Finish the plan
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="relative overflow-hidden rounded-3xl border border-accent/30 bg-gradient-to-br from-card to-surface p-6">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent/20 blur-3xl" />
      <div className="relative">
        <div className="text-xs font-bold uppercase tracking-widest text-accent">Your plan · Week {plan.stage} of 4</div>
        <div className="mt-1 text-2xl font-extrabold text-slate-100">
          {routine.name}, {TIER_LABEL[plan.tier].toLowerCase()} moves
        </div>
        <div className="mt-0.5 text-sm text-slate-400">
          {routine.exerciseIds.length} exercises · {plan.rounds === 1 ? '1 round' : `${plan.rounds} rounds`} · about {minutes} min
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex gap-1.5" role="img" aria-label={`${plan.doneInStage} of ${WORKOUTS_PER_STAGE} workouts done this week`}>
            {Array.from({ length: WORKOUTS_PER_STAGE }, (_, i) => (
              <span key={i} className={`h-2.5 w-10 rounded-full ${i < plan.doneInStage ? 'bg-accent' : 'bg-edge'}`} />
            ))}
          </div>
          <span className="text-sm text-slate-400">
            {plan.doneInStage} of {WORKOUTS_PER_STAGE} this week.
            {next ? ` ${WORKOUTS_PER_STAGE - plan.doneInStage === 1 ? 'One more' : `${WORKOUTS_PER_STAGE - plan.doneInStage} more`} and week ${plan.stage + 1} moves to ${STAGE_TEXT[plan.stage].toLowerCase()}.` : ' Finish this week to complete the plan.'}
          </span>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            to={`/workout/${routine.id}?plan=1`}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-base font-bold text-slate-900 shadow-lg shadow-accent/20 transition hover:brightness-110 active:scale-[0.98]"
          >
            <IconPlay className="h-4 w-4" /> Start
          </Link>
          <Link to="/settings#training" className="rounded-full border border-edge px-5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-card-hover">
            Change plan
          </Link>
        </div>
      </div>
      <ol className="relative mt-5 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {STAGE_TEXT.map((text, i) => (
          <li
            key={text}
            aria-current={i + 1 === plan.stage ? 'step' : undefined}
            className={`rounded-xl border p-3 ${i + 1 === plan.stage ? 'border-accent/60 bg-accent/5' : 'border-edge'} ${i + 1 < plan.stage ? 'opacity-60' : ''}`}
          >
            <span className="block font-semibold text-slate-100">Week {i + 1}{i + 1 === plan.stage ? ' · now' : i + 1 < plan.stage ? ' · done' : ''}</span>
            <span className="text-slate-400">{text}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
