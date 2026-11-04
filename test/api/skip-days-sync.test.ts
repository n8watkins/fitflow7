import { describe, it, expect, beforeEach } from 'vitest'
import { handle } from './target.ts'
import { DB_URL, SECRET, request, sessionCookie, testDb, type ApiEnv } from './contract-helpers.ts'

// Skip days sync as a per-user list keyed by date, last write wins, with
// tombstones so an undone skip disappears on every device.

let env: ApiEnv
const sync = async (user: string, body: unknown) => {
  const res = await handle(request('/api/sync', { method: 'POST', headers: { cookie: sessionCookie(user) }, json: body }), env)
  return { status: res.status, body: (await res.json()) as { skipDays: Record<string, unknown>[]; rejected: { collection: string }[] } }
}
const skip = (date: string, over: Record<string, unknown> = {}) => ({ id: date, date, createdAt: `${date}T20:00:00.000Z`, updatedAt: `${date}T20:00:00.000Z`, ...over })

beforeEach(async () => {
  env = { SESSION_SECRET: SECRET, TURSO_DATABASE_URL: DB_URL }
  await handle(request('/api/routines/public'), env)
  await testDb().execute('DELETE FROM skip_days')
})

describe('skip days sync', () => {
  it('round-trips per user', async () => {
    await sync('userA', { skipDays: [skip('2026-11-02'), skip('2026-11-05')] })
    expect((await sync('userA', {})).body.skipDays.map((s) => s.date).sort()).toEqual(['2026-11-02', '2026-11-05'])
    expect((await sync('userB', {})).body.skipDays).toEqual([])
  })

  it('lets two people skip the same date without touching each other', async () => {
    await sync('userA', { skipDays: [skip('2026-11-02')] })
    await sync('userB', { skipDays: [skip('2026-11-02', { updatedAt: '2026-11-03T00:00:00.000Z', deletedAt: '2026-11-03T00:00:00.000Z' })] })
    expect((await sync('userA', {})).body.skipDays[0]).not.toHaveProperty('deletedAt')
  })

  it('propagates an undo as a tombstone, newest write wins', async () => {
    await sync('userA', { skipDays: [skip('2026-11-02')] })
    await sync('userA', { skipDays: [skip('2026-11-02', { updatedAt: '2026-11-04T00:00:00.000Z', deletedAt: '2026-11-04T00:00:00.000Z' })] })
    await sync('userA', { skipDays: [skip('2026-11-02', { updatedAt: '2026-11-03T00:00:00.000Z' })] }) // older, ignored
    expect((await sync('userA', {})).body.skipDays[0]).toMatchObject({ deletedAt: '2026-11-04T00:00:00.000Z' })
  })

  it('rejects a malformed skip', async () => {
    const res = await sync('userA', { skipDays: [skip('yesterday'), { ...skip('2026-11-02'), id: '2026-11-09' }] })
    expect(res.body.rejected.map((r) => r.collection)).toEqual(['skipDays', 'skipDays'])
    expect((await sync('userA', {})).body.skipDays).toEqual([])
  })
})
