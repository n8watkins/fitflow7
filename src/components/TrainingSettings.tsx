import { useEffect, useRef, useState } from 'react'
import { getSessions, getTrainingProfile, saveTrainingProfile } from '../lib/storage'
import { LEVEL_LABEL, planProgress } from '../lib/plan'
import type { Goal, Level, TrainingProfile } from '../types'

// Settings → Training plan: level, goal, start/stop the four-week plan and
// reset your per-move easier/harder choices.

// Short goal names for the settings switch; onboarding explains each one.
const GOAL_SHORT: Record<Goal, string> = { habit: 'Habit', strength: 'Strength', cardio: 'Cardio' }

function Segmented<T extends string>({ label, options, value, onChange }: {
  label: string
  options: { value: T; label: string }[]
  value: T | undefined
  onChange: (v: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid w-full auto-cols-fr grid-flow-col overflow-hidden rounded-lg border border-edge text-sm font-medium sm:w-auto">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-9 px-3 py-1.5 transition ${value === o.value ? 'bg-accent text-slate-900' : 'bg-card text-slate-300 hover:bg-card-hover'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function TrainingSettings() {
  const [profile, setProfile] = useState<TrainingProfile>(() => getTrainingProfile())
  function update(patch: Partial<TrainingProfile>) {
    saveTrainingProfile(patch)
    setProfile(getTrainingProfile())
  }
  const ref = useRef<HTMLElement>(null)
  // "Change plan" on the home card links to #training.
  useEffect(() => {
    if (window.location.hash === '#training') ref.current?.scrollIntoView({ block: 'start' })
  }, [])
  const progress = profile.planStartedAt ? planProgress(getSessions(), profile.planStartedAt) : null
  const custom = Object.keys(profile.variations ?? {}).length
  const levels = (Object.keys(LEVEL_LABEL) as Level[]).map((v) => ({ value: v, label: LEVEL_LABEL[v] }))
  const goals = (Object.keys(GOAL_SHORT) as Goal[]).map((v) => ({ value: v, label: GOAL_SHORT[v] }))

  return (
    <section id="training" ref={ref} className="scroll-mt-6">
      <div className="rounded-2xl border border-edge bg-card">
        <div className="border-b border-edge px-5 py-4">
          <h2 className="font-semibold text-slate-200">Training plan</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {progress
              ? progress.complete
                ? `Plan complete: ${progress.totalDone} workouts.`
                : `Week ${progress.stage} of 4 · ${progress.totalDone} of 12 workouts done. A week moves up after 3 full workouts.`
              : 'A four-week plan that moves from easier moves to two rounds of harder ones.'}
          </p>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="font-medium text-slate-200">Level</div>
            <Segmented label="Level" options={levels} value={profile.level} onChange={(level) => update({ level })} />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="font-medium text-slate-200">Goal</div>
            <Segmented label="Goal" options={goals} value={profile.goal} onChange={(goal) => update({ goal })} />
          </div>
          <div className="flex flex-wrap gap-2 border-t border-edge pt-4">
            <button
              type="button"
              onClick={() => update({ planStartedAt: new Date().toISOString(), level: profile.level ?? 'intermediate', goal: profile.goal ?? 'habit', onboardingDone: true })}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-slate-900 transition hover:brightness-110"
            >
              {profile.planStartedAt ? 'Restart plan' : 'Start the plan'}
            </button>
            {profile.planStartedAt && (
              <button type="button" onClick={() => update({ planStartedAt: undefined })} className="rounded-lg border border-edge px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-card-hover">
                Stop plan
              </button>
            )}
            {custom > 0 && (
              <button type="button" onClick={() => update({ variations: {} })} className="rounded-lg border border-edge px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-card-hover">
                Reset {custom === 1 ? '1 move choice' : `${custom} move choices`}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
