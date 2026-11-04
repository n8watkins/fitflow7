import { describe, it, expect, beforeEach, vi } from 'vitest'
import { handle, remote } from './target.ts'
import { DB_URL, SECRET, request, sessionCookie, testDb, type ApiEnv, type Req } from './contract-helpers.ts'

// /api/sync must refuse oversized or malformed pushes instead of storing them:
// an 11 MB push of 5,000 sessions used to be stored, and every later sync for
// that account then failed with 500 until the rows were deleted by hand.

let env: ApiEnv
const call = (path: string, opts: Req = {}) => handle(request(path, opts), env)
const NOW = '2026-11-03T12:00:00.000Z'
const sync = (body: unknown, user = 'u1') =>
  call('/api/sync', { method: 'POST', headers: { cookie: sessionCookie(user) }, json: body })

function session(i: number, over: Record<string, unknown> = {}) {
  return {
    id: `s${i}`, routineId: 'classic-7', routineName: 'Classic 7', startedAt: NOW, completedAt: NOW,
    durationSeconds: 420, completed: true, exercisesCompleted: 12, totalExercises: 12, updatedAt: NOW, ...over,
  }
}
const routine = (over: Record<string, unknown> = {}) => ({
  id: 'r1', name: 'Mine', exerciseIds: ['push-ups'], workSeconds: 30, restSeconds: 10, rounds: 1,
  isSystem: false, createdAt: NOW, updatedAt: NOW, ...over,
})
const count = async (table: string) =>
  Number((await testDb().execute(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0]?.n ?? -1)

beforeEach(async () => {
  env = { SESSION_SECRET: SECRET, TURSO_DATABASE_URL: DB_URL }
  await call('/api/routines/public')
  await testDb().batch(['routines', 'sessions', 'settings', 'weight_log', 'body_profile', 'challenge_progress']
    .map((t) => `DELETE FROM ${t}`), 'write')
})

describe.skipIf(remote)('sync push limits', () => {
  it('refuses a push of more than 500 records with 413 and stores nothing', async () => {
    const res = await sync({ sessions: Array.from({ length: 501 }, (_, i) => session(i)) })
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ error: 'too many records in one sync (max 500)' })
    expect(await count('sessions')).toBe(0)
  })

  it('refuses a body over 1 MB with 413', async () => {
    const res = await sync({ sessions: [session(1, { routineName: 'x'.repeat(1_100_000) })] })
    expect(res.status).toBe(413)
    expect(await count('sessions')).toBe(0)
  })

  it('accepts 500 normal records', async () => {
    const res = await sync({ sessions: Array.from({ length: 500 }, (_, i) => session(i)) })
    expect(res.status).toBe(200)
    expect(await count('sessions')).toBe(500)
  })
})

describe.skipIf(remote)('sync push shape', () => {
  it('answers 400, not 500, when a collection is not a list or the body is not an object', async () => {
    for (const body of [{ routines: 'abc' }, { sessions: {} }, { weightLog: 5 }, [], { since: 42 }, { since: 'yesterday' }]) {
      const res = await sync(body)
      expect(res.status, JSON.stringify(body)).toBe(400)
    }
  })

  it('skips invalid records, stores the valid ones and lists what it rejected', async () => {
    const res = await sync({
      routines: [routine(), routine({ id: 'r2', workSeconds: 'lots' }), routine({ id: 'r3', name: '' })],
      sessions: [session(1), session(2, { routineName: 'y'.repeat(500) }), session(3, { durationSeconds: -5 })],
      weightLog: [{ id: 'w1', date: '2026-11-03', weightKg: 80, createdAt: NOW, updatedAt: NOW },
        { id: 'w2', date: 'today', weightKg: 80, createdAt: NOW, updatedAt: NOW }],
      settings: { value: { defaultWorkSeconds: 30, defaultRestSeconds: 10, defaultRounds: 1, countdownSeconds: null, audioCuesEnabled: true }, updatedAt: NOW },
      bodyProfile: { heightCm: 9000, updatedAt: NOW },
      challengeProgress: [{ challengeId: '30-day', completedDays: { 1: NOW }, startedAt: NOW, updatedAt: NOW },
        { challengeId: 'Bad Id!', completedDays: {}, startedAt: NOW, updatedAt: NOW }],
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { rejected: { collection: string; id: string; reason: string }[] }
    expect(body.rejected.map((r) => `${r.collection}:${r.id}`).sort()).toEqual([
      'bodyProfile:', 'challengeProgress:Bad Id!', 'routines:r2', 'routines:r3', 'sessions:s2', 'sessions:s3', 'settings:', 'weightLog:w2',
    ])
    expect(body.rejected.find((r) => r.id === 'r2')?.reason).toBe('workSeconds must be a number from 1 to 3600')
    expect(await count('routines')).toBe(1)
    expect(await count('sessions')).toBe(1)
    expect(await count('weight_log')).toBe(1)
    expect(await count('settings')).toBe(0)
    expect(await count('body_profile')).toBe(0)
    expect(await count('challenge_progress')).toBe(1)
  })

  it('logs a database failure instead of swallowing it', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      // Break one table the pull reads, after sign-in has been checked.
      await testDb().execute('ALTER TABLE weight_log RENAME TO weight_log_broken')
      let res: Response
      try {
        res = await sync({})
      } finally {
        await testDb().execute('ALTER TABLE weight_log_broken RENAME TO weight_log')
      }
      expect(res.status).toBe(500)
      const line = JSON.parse(String(error.mock.calls[0]?.[0])) as Record<string, unknown>
      expect(line).toMatchObject({ event: 'sync_failed', route: '/api/sync', status: 500 })
    } finally {
      error.mockRestore()
    }
  })
})
