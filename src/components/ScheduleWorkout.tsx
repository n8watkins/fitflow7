import { useState } from 'react'
import type { Routine } from '../types'
import { buildGoogleCalendarUrl, buildIcs } from '../lib/calendar'

function todayLocal(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// A "Schedule" button that opens a small popover to drop a workout onto the
// user's calendar (.ics download or Google Calendar link). No backend.
export default function ScheduleWorkout({ routine }: { routine: Routine }) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(todayLocal)
  const [time, setTime] = useState('07:00')
  const [repeat, setRepeat] = useState(false)

  const start = new Date(`${date}T${time}`)
  const valid = date !== '' && time !== '' && !Number.isNaN(start.getTime())

  function downloadIcs() {
    if (!valid) return
    const ics = buildIcs(routine, { start, repeatWeekly: repeat })
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${routine.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'workout'}.ics`
    a.click()
    URL.revokeObjectURL(url)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg border border-edge bg-card px-4 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-card-hover"
      >
        Schedule
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-edge bg-card p-4 text-left shadow-xl">
          <div className="mb-2 truncate text-sm font-medium text-slate-200">Schedule “{routine.name}”</div>
          <div className="flex gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-edge bg-surface px-2 py-1 text-sm text-slate-200 focus:border-accent focus:outline-none"
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="rounded-lg border border-edge bg-surface px-2 py-1 text-sm text-slate-200 focus:border-accent focus:outline-none"
            />
          </div>
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-slate-400">
            <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
            Repeat weekly
          </label>
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={downloadIcs}
              disabled={!valid}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-slate-900 transition hover:brightness-110 disabled:opacity-50"
            >
              Download .ics
            </button>
            <a
              href={valid ? buildGoogleCalendarUrl(routine, { start, repeatWeekly: repeat }) : undefined}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className={`rounded-lg border border-edge bg-card px-3 py-1.5 text-center text-sm font-medium text-slate-300 transition hover:bg-card-hover ${valid ? '' : 'pointer-events-none opacity-50'}`}
            >
              Add to Google Calendar
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
