import { describe, it, expect } from 'vitest'
import { activeDays, canSkip, challengeDayOn, challengeStatus, dayToOffer, longestRun, runEndingAt, skipsLeftIn, type SkipDay } from '../src/lib/skipDays'

const skip = (date: string, over: Partial<SkipDay> = {}): SkipDay => ({ id: date, date, createdAt: `${date}T12:00:00.000Z`, updatedAt: `${date}T12:00:00.000Z`, ...over })
const days = (...d: string[]) => new Set(d)

describe('skip-day budget', () => {
  it('allows three per calendar month, counted by the skipped date', () => {
    const skips = [skip('2026-10-30'), skip('2026-11-02'), skip('2026-11-03'), skip('2026-11-04', { deletedAt: '2026-11-04T13:00:00.000Z' })]
    expect(skipsLeftIn(skips, '2026-10')).toBe(2)
    expect(skipsLeftIn(skips, '2026-11')).toBe(1)
    expect(skipsLeftIn(skips, '2026-12')).toBe(3)
  })

  it('refuses a fourth skip in the same month', () => {
    const skips = [skip('2026-11-02'), skip('2026-11-03'), skip('2026-11-04')]
    expect(canSkip('2026-11-06', { today: '2026-11-07', workoutDays: days(), skips })).toEqual({ ok: false, reason: 'no-skips-left' })
  })

  it("takes yesterday from last month's budget across a month boundary", () => {
    const skips = [skip('2026-11-01'), skip('2026-11-02'), skip('2026-11-03')]
    // November is used up, but October 31 belongs to October.
    expect(canSkip('2026-10-31', { today: '2026-11-04', workoutDays: days(), skips })).toEqual({ ok: true })
    expect(canSkip('2026-11-30', { today: '2026-12-01', workoutDays: days(), skips: [skip('2026-11-01'), skip('2026-11-02'), skip('2026-11-03')] })).toEqual({ ok: false, reason: 'no-skips-left' })
  })

  it('only skips a past day without a workout, at most a week back, once', () => {
    const ctx = { today: '2026-11-10', workoutDays: days('2026-11-08'), skips: [skip('2026-11-07')] }
    expect(canSkip('2026-11-10', ctx)).toEqual({ ok: false, reason: 'not-past' })
    expect(canSkip('2026-11-12', ctx)).toEqual({ ok: false, reason: 'not-past' })
    expect(canSkip('2026-11-08', ctx)).toEqual({ ok: false, reason: 'workout-day' })
    expect(canSkip('2026-11-07', ctx)).toEqual({ ok: false, reason: 'already-skipped' })
    expect(canSkip('2026-11-02', ctx)).toEqual({ ok: false, reason: 'too-old' })
    expect(canSkip('2026-11-09', ctx)).toEqual({ ok: true })
  })
})

describe('streaks with skip days', () => {
  it('counts a skip day as active so the streak survives', () => {
    const active = activeDays(days('2026-11-01', '2026-11-02', '2026-11-04'), [skip('2026-11-03')])
    expect(runEndingAt(active, '2026-11-04')).toBe(4)
    expect(longestRun(active)).toBe(4)
  })

  it('ignores deleted skips', () => {
    const active = activeDays(days('2026-11-01', '2026-11-03'), [skip('2026-11-02', { deletedAt: 'x' })])
    expect(longestRun(active)).toBe(1)
  })

  it('offers yesterday only when it was missed and a streak is at stake', () => {
    const base = { today: '2026-11-10', skips: [] as SkipDay[] }
    expect(dayToOffer({ ...base, workoutDays: days('2026-11-08') })).toBe('2026-11-09')
    expect(dayToOffer({ ...base, workoutDays: days('2026-11-08', '2026-11-09') })).toBeNull() // not missed
    expect(dayToOffer({ ...base, workoutDays: days('2026-11-05') })).toBeNull() // no streak to save
    expect(dayToOffer({ ...base, workoutDays: days('2026-11-08'), skips: [skip('2026-11-01'), skip('2026-11-02'), skip('2026-11-03')] })).toBeNull() // none left
  })
})

describe('challenge pacing', () => {
  const start = '2026-11-01T15:00:00' // local time
  it('numbers challenge days from the local start date', () => {
    expect(challengeDayOn(start, '2026-11-01')).toBe(1)
    expect(challengeDayOn(start, '2026-11-30')).toBe(30)
  })

  it('stays whole across a daylight-saving change', () => {
    const before = process.env.TZ
    process.env.TZ = 'America/New_York' // DST ends 2026-11-01
    try {
      expect(challengeDayOn('2026-10-31T23:30:00', '2026-11-02')).toBe(3)
      expect(challengeDayOn('2026-03-07T12:00:00', '2026-03-09')).toBe(3) // DST starts 2026-03-08
    } finally {
      process.env.TZ = before
    }
  })

  it('is on track when every past day is done or skipped', () => {
    const progress = { challengeId: 'x', startedAt: start, completedDays: { 1: 'a', 2: 'a', 4: 'a' } }
    const s = challengeStatus(30, progress, [skip('2026-11-03')], '2026-11-05')
    expect([...s.skipped]).toEqual([3])
    expect(s).toMatchObject({ todayDay: 5, onTrack: true, behindBy: 0, complete: false })
    const behind = challengeStatus(30, progress, [], '2026-11-05')
    expect(behind).toMatchObject({ onTrack: false, behindBy: 1 })
  })

  it('never lets a skip day stand in for the last day', () => {
    const all = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [i + 1, 'a']))
    const progress = { challengeId: 'x', startedAt: start, completedDays: all }
    const s = challengeStatus(7, progress, [skip('2026-11-07')], '2026-11-08')
    expect(s.skipped.has(7)).toBe(false)
    expect(s.complete).toBe(false)
    const done = challengeStatus(7, { ...progress, completedDays: { ...all, 7: 'a' } }, [], '2026-11-08')
    expect(done.complete).toBe(true)
  })

  it('completes with skipped days in the middle', () => {
    const completedDays = Object.fromEntries([1, 2, 4, 5, 6, 7].map((d) => [d, 'a']))
    const s = challengeStatus(7, { challengeId: 'x', startedAt: start, completedDays }, [skip('2026-11-03')], '2026-11-08')
    expect(s.complete).toBe(true)
  })
})

describe('skip-day storage', () => {
  it('adds, syncs, undoes and merges by newest write', async () => {
    const st = await import('../src/lib/storage')
    st.addSkipDay('2026-11-03')
    expect(st.getSkipDays().map((d) => d.date)).toEqual(['2026-11-03'])
    const pending = st.getPendingSync().skipDays
    expect(pending).toHaveLength(1)
    st.markSynced({ skipDays: pending })
    expect(st.getPendingSync().skipDays).toHaveLength(0)
    st.removeSkipDay('2026-11-03')
    expect(st.getSkipDays()).toEqual([])
    expect(st.getPendingSync().skipDays[0].deletedAt).toBeDefined()
    st.applyRemoteSkipDays([{ id: '2026-11-03', date: '2026-11-03', createdAt: 'a', updatedAt: '2000-01-01T00:00:00.000Z' }])
    expect(st.getSkipDays()).toEqual([]) // older remote write loses
    st.applyRemoteSkipDays([{ id: '2026-11-04', date: '2026-11-04', createdAt: 'a', updatedAt: '2099-01-01T00:00:00.000Z' }])
    expect(st.getSkipDays().map((d) => d.date)).toEqual(['2026-11-04'])
  })
})
