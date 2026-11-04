import { describe, it, expect } from 'vitest'
import { EXERCISES, EXERCISE_MAP } from '../src/data/exercises'
import { positionOf } from '../src/lib/positions'
import fs from 'node:fs'

describe('move position glyphs', () => {
  it('only lists exercise ids that exist', () => {
    const src = fs.readFileSync('src/lib/positions.ts', 'utf8')
    const listed = [...src.slice(src.indexOf('BY_POSITION'), src.indexOf('const POSITION_OF')).matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1])
      .filter((id) => !['seated', 'plank', 'lying', 'all-fours', 'standing'].includes(id))
    expect(listed.length).toBeGreaterThan(30)
    for (const id of listed) expect(EXERCISE_MAP[id], id).toBeDefined()
  })

  it('puts familiar moves in the right position', () => {
    expect(positionOf('wall-sit')).toBe('seated')
    expect(positionOf('crunches')).toBe('lying')
    expect(positionOf('push-ups')).toBe('plank')
    expect(positionOf('bird-dog')).toBe('all-fours')
    expect(positionOf('jumping-jacks')).toBe('standing')
    expect(EXERCISES.every((e) => positionOf(e.id))).toBe(true)
  })
})
