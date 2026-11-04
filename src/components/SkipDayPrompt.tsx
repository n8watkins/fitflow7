import { useState } from 'react'
import { addSkipDay, getSessions, getSkipDays, removeSkipDay } from '../lib/storage'
import { dayToOffer, monthOf, skipsLeftIn, SKIPS_PER_MONTH } from '../lib/skipDays'
import { isFullWorkout } from '../lib/badges'
import { dayKey, parseDayKey, todayKey } from '../lib/format'

// "You missed yesterday": offers a skip day when yesterday had no workout and a
// streak ran up to the day before (lib/skipDays.ts). Shown on the home screen
// and on a challenge. After using one it offers Undo until you leave.

function monthName(date: string): string {
  return parseDayKey(date).toLocaleDateString(undefined, { month: 'long' })
}

export default function SkipDayPrompt({ onChange }: { onChange?: () => void }) {
  const [used, setUsed] = useState<string | null>(null)
  const today = todayKey()
  const skips = getSkipDays()
  const workoutDays = new Set(getSessions().filter(isFullWorkout).map((s) => dayKey(new Date(s.startedAt))))
  const offer = used ? null : dayToOffer({ today, workoutDays, skips })

  if (used) {
    return (
      <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm">
        <span className="text-slate-200">
          Skip day used for yesterday. {skipsLeftIn(getSkipDays(), monthOf(used))} of {SKIPS_PER_MONTH} left in {monthName(used)}.
        </span>
        <button
          type="button"
          onClick={() => {
            removeSkipDay(used)
            setUsed(null)
            onChange?.()
          }}
          className="font-semibold text-amber-300 hover:underline light:text-amber-700"
        >
          Undo
        </button>
      </div>
    )
  }
  if (!offer) return null

  const left = skipsLeftIn(skips, monthOf(offer))
  return (
    <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm">
      <p className="text-slate-200">
        <b className="text-slate-100">You missed yesterday.</b> Use a skip day to keep your streak and stay on track?
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-slate-400">
          {left} of {SKIPS_PER_MONTH} left in {monthName(offer)}
        </span>
        <button
          type="button"
          onClick={() => {
            addSkipDay(offer)
            setUsed(offer)
            onChange?.()
          }}
          className="rounded-lg bg-amber-400 px-4 py-2 font-semibold text-slate-900 transition hover:brightness-105 active:scale-95"
        >
          Use a skip day
        </button>
      </div>
    </div>
  )
}
