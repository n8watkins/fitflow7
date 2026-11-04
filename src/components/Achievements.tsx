import type { BadgeStatus } from '../lib/badges'

// The badge grid on the Stats page and the new-badge card on the finish screen.

export function BadgeGrid({ badges }: { badges: BadgeStatus[] }) {
  const earned = badges.filter((b) => b.earned).length
  return (
    <section aria-labelledby="achievements-title">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="achievements-title" className="text-sm font-semibold uppercase tracking-widest text-slate-500">Achievements</h2>
        <span className="text-sm text-slate-400">{earned} of {badges.length} earned</span>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {badges.map((b) => (
          <li
            key={b.id}
            className={`rounded-2xl border bg-card p-4 text-center ${b.earned ? 'border-amber-400/40' : 'border-edge'}`}
          >
            <div
              aria-hidden="true"
              className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full text-2xl ${b.earned ? 'bg-amber-400/20' : 'bg-edge opacity-60 grayscale'}`}
            >
              {b.icon}
            </div>
            <p className={`mt-2 text-sm font-bold ${b.earned ? 'text-slate-100' : 'text-slate-300'}`}>{b.name}</p>
            <p className="text-xs text-slate-400">
              {b.earned ? 'Earned' : b.target > 1 ? `${b.goal} · ${b.current}/${b.target}` : b.goal}
            </p>
            {!b.earned && b.target > 1 && (
              <div className="mx-auto mt-2 h-1 w-16 overflow-hidden rounded-full bg-edge" role="img" aria-label={`${b.current} of ${b.target}`}>
                <div className="h-full rounded-full bg-amber-400" style={{ width: `${(b.current / b.target) * 100}%` }} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function NewBadgeCard({ badge }: { badge: BadgeStatus }) {
  return (
    <div className="mx-auto flex max-w-xs items-center gap-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3 text-left">
      <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-400/20 text-2xl">
        {badge.icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-400 light:text-amber-700">New badge</p>
        <p className="font-bold text-slate-100">{badge.name}</p>
        <p className="text-xs text-slate-400">{badge.goal}</p>
      </div>
    </div>
  )
}
