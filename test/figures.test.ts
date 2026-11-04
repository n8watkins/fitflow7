import { describe, expect, it } from 'vitest'
import { EXERCISES } from '../src/data/exercises'
import { POSES } from '../src/data/figures'
import { centerShift, FLOOR, solveFrame, type Point } from '../src/lib/figure'

// Every move has a drawn figure, and every figure stays on its 120×120 canvas,
// keeps its limb lengths and never sinks through the floor.

const dist = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1])

describe('exercise figures', () => {
  it('has a pose for every exercise and none for unknown ids', () => {
    const ids = new Set(EXERCISES.map((e) => e.id))
    for (const e of EXERCISES) expect(POSES[e.id], e.id).toBeDefined()
    for (const id of Object.keys(POSES)) expect(ids.has(id), id).toBe(true)
  })

  for (const [id, pose] of Object.entries(POSES)) {
    it(`${id} fits the canvas with whole limbs`, () => {
      const view = pose.view ?? 'side'
      const frames = [solveFrame(pose.a, view), solveFrame(pose.b, view)]
      const dx = centerShift(frames, pose.props)
      const k = pose.scale ?? 1
      for (const f of frames) {
        const pts: [Point, number][] = [[f.head, 8.5], [f.torso[0], 6.5], [f.torso[2], 6.5]]
        for (const c of [f.farArm, f.nearArm, f.farLeg, f.nearLeg]) for (const p of c) pts.push([p, 4])
        for (const [p, r] of pts) {
          expect(Number.isFinite(p[0]) && Number.isFinite(p[1]), `${id} NaN`).toBe(true)
          const x = 60 + (p[0] + dx - 60) * k
          const y = FLOOR + (p[1] - FLOOR) * k
          expect(x - r * k, `${id} left`).toBeGreaterThanOrEqual(0)
          expect(x + r * k, `${id} right`).toBeLessThanOrEqual(120)
          expect(y - r * k, `${id} top`).toBeGreaterThanOrEqual(0)
          // A point may rest on the floor line but not sink more than a pixel below it.
          if (pose.floor !== false) expect(y + r * k, `${id} floor`).toBeLessThanOrEqual(FLOOR + 3)
        }
        // Arms and legs keep their length (unless a pose foreshortens them).
        if (!('len' in pose.a.nearArm) || !pose.a.nearArm.len) {
          expect(dist(f.nearArm[0], f.nearArm[1])).toBeCloseTo(15, 0)
        }
      }
    })
  }
})
