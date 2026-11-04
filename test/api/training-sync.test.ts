import { describe, it, expect, beforeEach } from 'vitest'
import { handle } from './target.ts'
import { DB_URL, SECRET, request, sessionCookie, testDb, type ApiEnv } from './contract-helpers.ts'

// The training profile (onboarding answers, plan start, per-move choices)
// syncs as a per-user singleton, last write wins, like the body profile.

let env: ApiEnv
const sync = async (user: string, body: unknown) => {
  const res = await handle(request('/api/sync', { method: 'POST', headers: { cookie: sessionCookie(user) }, json: body }), env)
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}
const profile = (over: Record<string, unknown> = {}) => ({
  goal: 'strength', level: 'beginner', planStartedAt: '2026-11-01T08:00:00.000Z', onboardingDone: true,
  variations: { 'push-ups': 'easier' }, updatedAt: '2026-11-02T00:00:00.000Z', ...over,
})

beforeEach(async () => {
  env = { SESSION_SECRET: SECRET, TURSO_DATABASE_URL: DB_URL }
  await handle(request('/api/routines/public'), env)
  await testDb().execute('DELETE FROM training_profile')
})

describe('training profile sync', () => {
  it('round-trips to another device and stays with its user', async () => {
    expect((await sync('userA', { trainingProfile: profile() })).status).toBe(200)
    const pulled = await sync('userA', {})
    expect(pulled.body.trainingProfile).toEqual(profile())
    expect((await sync('userB', {})).body.trainingProfile).toBeNull()
  })

  it('keeps the newer write and ignores an older one', async () => {
    await sync('userA', { trainingProfile: profile({ level: 'advanced', updatedAt: '2026-11-05T00:00:00.000Z' }) })
    await sync('userA', { trainingProfile: profile({ level: 'beginner', updatedAt: '2026-11-03T00:00:00.000Z' }) })
    expect(((await sync('userA', {})).body.trainingProfile as { level: string }).level).toBe('advanced')
  })

  it('clears the plan when a newer profile has no plan start', async () => {
    await sync('userA', { trainingProfile: profile() })
    await sync('userA', { trainingProfile: profile({ planStartedAt: undefined, updatedAt: '2026-11-06T00:00:00.000Z' }) })
    expect((await sync('userA', {})).body.trainingProfile).not.toHaveProperty('planStartedAt')
  })

  it('rejects a malformed profile without storing it', async () => {
    const res = await sync('userA', { trainingProfile: profile({ level: 'godlike', variations: { 'push-ups': 'impossible' } }) })
    expect(res.status).toBe(200)
    expect((res.body.rejected as { collection: string }[]).map((r) => r.collection)).toEqual(['trainingProfile'])
    expect((await sync('userA', {})).body.trainingProfile).toBeNull()
  })
})
