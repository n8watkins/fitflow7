import { describe, it, expect, beforeEach } from 'vitest'
import { handle } from './target.ts'
import { DB_URL, SECRET, request, sessionCookie, testDb, type ApiEnv } from './contract-helpers.ts'

// The exercise image preference syncs with the other settings. Older clients
// send settings without it, and that must not reset what a newer one saved.

let env: ApiEnv
const sync = async (user: string, body: unknown) => {
  const res = await handle(request('/api/sync', { method: 'POST', headers: { cookie: sessionCookie(user) }, json: body }), env)
  return {
    status: res.status,
    body: (await res.json()) as { settings: { value: Record<string, unknown> } | null; rejected: { collection: string }[] },
  }
}
const settings = (over: Record<string, unknown>, updatedAt: string) => ({
  value: { defaultWorkSeconds: 30, defaultRestSeconds: 10, defaultRounds: 1, countdownSeconds: 5, audioCuesEnabled: true, ...over },
  updatedAt,
})

beforeEach(async () => {
  env = { SESSION_SECRET: SECRET, TURSO_DATABASE_URL: DB_URL }
  await handle(request('/api/routines/public'), env)
  await testDb().execute('DELETE FROM settings')
})

describe('exercise image preference sync', () => {
  it('round-trips to another device', async () => {
    expect((await sync('userA', { settings: settings({ exerciseImages: 'illustrations' }, '2026-11-02T00:00:00.000Z') })).status).toBe(200)
    expect((await sync('userA', {})).body.settings?.value.exerciseImages).toBe('illustrations')
  })

  it('is absent until saved, and an older client does not clear it', async () => {
    await sync('userA', { settings: settings({}, '2026-11-01T00:00:00.000Z') })
    expect((await sync('userA', {})).body.settings?.value).not.toHaveProperty('exerciseImages')
    await sync('userA', { settings: settings({ exerciseImages: 'illustrations' }, '2026-11-02T00:00:00.000Z') })
    await sync('userA', { settings: settings({ defaultRounds: 3 }, '2026-11-03T00:00:00.000Z') })
    const value = (await sync('userA', {})).body.settings?.value
    expect(value).toMatchObject({ defaultRounds: 3, exerciseImages: 'illustrations' })
  })

  it('rejects an unknown value and keeps the stored one', async () => {
    await sync('userA', { settings: settings({ exerciseImages: 'illustrations' }, '2026-11-02T00:00:00.000Z') })
    const bad = await sync('userA', { settings: settings({ exerciseImages: 'emoji' }, '2026-11-03T00:00:00.000Z') })
    expect(bad.body.rejected.map((r) => r.collection)).toContain('settings')
    expect((await sync('userA', {})).body.settings?.value.exerciseImages).toBe('illustrations')
  })
})
