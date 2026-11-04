import { useState } from 'react'
import { saveTrainingProfile } from '../lib/storage'
import { timingFor } from '../lib/plan'
import type { Goal, Level } from '../types'

// Two questions on first run: what you want, and how push-ups feel. The answers
// set your level and start the four-week plan (lib/plan.ts). Skippable; either
// way it is not shown again. Settings → Training plan changes it later.

const GOALS: { value: Goal; title: string; detail: string }[] = [
  { value: 'habit', title: 'Build a habit', detail: 'Short, steady, every day' },
  { value: 'strength', title: 'Get stronger', detail: 'Rotates in the arm and leg workouts' },
  { value: 'cardio', title: 'Move more, burn more', detail: 'Shorter rests between moves' },
]

const LEVELS: { value: Level; title: string }[] = [
  { value: 'beginner', title: 'Not yet possible' },
  { value: 'intermediate', title: 'Doable' },
  { value: 'advanced', title: 'Easy' },
]

const LEVEL_DETAIL: Record<Level, string> = {
  beginner: 'easier moves',
  intermediate: 'standard moves',
  advanced: 'harder moves',
}

function Choice({ selected, title, detail, onClick }: { selected: boolean; title: string; detail: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`rounded-xl border px-4 py-3 text-left transition ${
        selected ? 'border-accent bg-accent/10' : 'border-edge hover:bg-card-hover'
      }`}
    >
      <span className="block font-semibold text-slate-100">{title}</span>
      <span className="block text-sm text-slate-400">{detail}</span>
    </button>
  )
}

export default function Onboarding({ onDone }: { onDone?: () => void }) {
  const [step, setStep] = useState<1 | 2>(1)
  const [goal, setGoal] = useState<Goal>('habit')
  const [level, setLevel] = useState<Level>('intermediate')

  function finish() {
    saveTrainingProfile({ goal, level, planStartedAt: new Date().toISOString(), onboardingDone: true })
    onDone?.()
  }
  function skip() {
    saveTrainingProfile({ onboardingDone: true })
    onDone?.()
  }

  return (
    <section aria-labelledby="onboarding-title" className="p-6 pt-6">
      <div className="flex items-center justify-between gap-3 pr-10">
        <span className="text-xs font-bold uppercase tracking-widest text-accent">Step {step} of 2</span>
        {step === 1 ? (
          <button type="button" onClick={skip} className="text-sm font-medium text-slate-400 hover:text-slate-200">
            Skip
          </button>
        ) : (
          <button type="button" onClick={() => setStep(1)} className="text-sm font-medium text-slate-400 hover:text-slate-200">
            Back
          </button>
        )}
      </div>

      {step === 1 ? (
        <>
          <h2 id="onboarding-title" className="mt-3 text-xl font-bold text-slate-100">What do you want from seven minutes a day?</h2>
          <div role="radiogroup" aria-labelledby="onboarding-title" className="mt-4 grid gap-2 sm:grid-cols-3">
            {GOALS.map((g) => (
              <Choice key={g.value} selected={goal === g.value} title={g.title} detail={g.detail} onClick={() => setGoal(g.value)} />
            ))}
          </div>
          <button type="button" onClick={() => setStep(2)} className="mt-5 w-full rounded-full bg-accent px-6 py-3 font-bold text-slate-900 transition hover:brightness-110 sm:w-auto">
            Next
          </button>
        </>
      ) : (
        <>
          <h2 id="onboarding-title" className="mt-3 text-xl font-bold text-slate-100">How do 10 push-ups feel today?</h2>
          <div role="radiogroup" aria-labelledby="onboarding-title" className="mt-4 grid gap-2 sm:grid-cols-3">
            {LEVELS.map((l) => {
              const t = timingFor(l.value)
              return (
                <Choice
                  key={l.value}
                  selected={level === l.value}
                  title={l.title}
                  detail={`Start with ${LEVEL_DETAIL[l.value]}, ${t.workSeconds} s work, ${t.restSeconds} s rest`}
                  onClick={() => setLevel(l.value)}
                />
              )
            })}
          </div>
          <button type="button" onClick={finish} className="mt-5 w-full rounded-full bg-accent px-6 py-3 font-bold text-slate-900 transition hover:brightness-110 sm:w-auto">
            Start my plan
          </button>
        </>
      )}
    </section>
  )
}
