// The geometry behind the drawn exercise figures (components/ExerciseFigure.tsx).
//
// A figure is a rounded body seen from the side (facing right) or the front, on
// a 120×120 grid with the floor at y = 105. Each move has two keyframes, a start
// and an end; the component morphs between them. Poses are written in
// data/figures.ts as a hip position, a torso angle and one entry per limb:
// either two absolute angles (upper and lower segment) or a target the limb end
// should reach, solved with two-bone inverse kinematics so hands and feet land
// exactly on the floor, a wall or a chair.

export type Point = [number, number]
export type Bend = 'fwd' | 'back' | 'up' | 'down'

/** Angles in degrees. 0 points straight down, positive turns toward the front
 *  (+x) in side view or outward in front view, so 90 is horizontal forward. */
export type Limb =
  | { a: [number, number]; len?: [number, number] }
  | { to: Point | Anchor; bend: Bend; off?: Point; len?: [number, number] }

/** Body points a hand or foot can reach for, solved earlier in the same frame. */
export type Anchor = 'head' | 'neck' | 'chest' | 'hip' | 'farKnee' | 'nearKnee' | 'nearElbow' | 'nearHand'

export interface Frame {
  /** Hip joint position. Standing straight, the hip is at y = 57. */
  hip: Point
  /** Torso angle from vertical; positive leans toward the front (+x). */
  torso: number
  /** Torso length, shortened when the torso points toward the viewer. */
  torsoLen?: number
  /** Spine curve: positive rounds the back (cat, crunch), negative arches it. */
  arch?: number
  /** Extra head tilt in degrees, relative to the torso line. */
  head?: number
  farArm: Limb
  nearArm: Limb
  farLeg: Limb
  nearLeg: Limb
  /** Absolute foot angle (side view). Defaults to square with the shin. */
  farToe?: number
  nearToe?: number
}

export type Chain = 'farArm' | 'nearArm' | 'farLeg' | 'nearLeg' | 'torso'

export type Prop =
  | { kind: 'wall'; x: number }
  /** A box standing on the floor (a step or chair seat): left x, width, height. */
  | { kind: 'box'; x: number; w: number; h: number }
  /** A floor mat seen from above, for moves drawn top-down. */
  | { kind: 'mat'; x: number; y: number; w: number; h: number }

export interface Pose {
  view?: 'side' | 'front'
  /** Body parts the move works; drawn in the accent color. */
  work: Chain[]
  a: Frame
  b: Frame
  /** The frame shown when the figure is not animating. Defaults to 'b'. */
  still?: 'a' | 'b'
  /** Flip horizontally (the other side of a one-sided move). */
  mirror?: boolean
  props?: Prop[]
  /** Shrinks the figure toward the floor so tall poses fit (default 1). */
  scale?: number
  /** Draw the floor line (default true); off for top-down poses on a mat. */
  floor?: boolean
}

export const FLOOR = 105

const L = { torso: 30, neck: 11, upperArm: 15, forearm: 14, thigh: 22, shin: 22, foot: 6 }
const rad = (deg: number) => (deg * Math.PI) / 180
const round = (n: number) => Math.round(n * 10) / 10

/** Unit vector for an absolute limb angle (0 = down, +90 = forward). */
function dir(deg: number, flip = 1): Point {
  return [Math.sin(rad(deg)) * flip, Math.cos(rad(deg))]
}

const add = (p: Point, v: Point, k = 1): Point => [p[0] + v[0] * k, p[1] + v[1] * k]

/** Two-bone IK: the middle joint for a limb from `root` reaching `target`. */
function solve(root: Point, target: Point, l1: number, l2: number, bend: Bend): Point {
  const dx = target[0] - root[0]
  const dy = target[1] - root[1]
  const d = Math.min(Math.max(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.01), l1 + l2 - 0.01)
  const base = Math.atan2(dy, dx)
  const off = Math.acos((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))
  const c1: Point = [root[0] + l1 * Math.cos(base + off), root[1] + l1 * Math.sin(base + off)]
  const c2: Point = [root[0] + l1 * Math.cos(base - off), root[1] + l1 * Math.sin(base - off)]
  const pick = {
    fwd: c1[0] >= c2[0],
    back: c1[0] <= c2[0],
    up: c1[1] <= c2[1],
    down: c1[1] >= c2[1],
  }[bend]
  return pick ? c1 : c2
}

/** Joint positions of one limb: [root, middle, end]. */
function limb(root: Point, spec: Limb, l1: number, l2: number, flip: number, anchors: Partial<Record<Anchor, Point>>): Point[] {
  const [u, l] = spec.len ?? [l1, l2]
  if ('to' in spec) {
    const base = typeof spec.to === 'string' ? anchors[spec.to] : spec.to
    if (!base) throw new Error(`figure anchor ${String(spec.to)} is not solved yet`)
    const target: Point = spec.off ? [base[0] + spec.off[0], base[1] + spec.off[1]] : base
    const mid = solve(root, target, u, l, spec.bend)
    const v: Point = [target[0] - mid[0], target[1] - mid[1]]
    const n = Math.hypot(v[0], v[1]) || 1
    return [root, mid, add(mid, [v[0] / n, v[1] / n], l)]
  }
  const mid = add(root, dir(spec.a[0], flip), u)
  return [root, mid, add(mid, dir(spec.a[1], flip), l)]
}

/** Absolute angle (0 = down, + toward +x) of the segment from p to q. */
function angleOf(p: Point, q: Point): number {
  return (Math.atan2(q[0] - p[0], q[1] - p[1]) * 180) / Math.PI
}

export interface Solved {
  head: Point
  torso: [Point, Point, Point] // hip, curve control, neck
  farArm: Point[]
  nearArm: Point[]
  farLeg: Point[]
  nearLeg: Point[]
}

/** Resolves a frame into points. Legs first, then the near arm, then the far
 *  arm, so a hand can reach for a knee or the other elbow. */
export function solveFrame(f: Frame, view: 'side' | 'front' = 'side'): Solved {
  const t = rad(f.torso)
  const up: Point = [Math.sin(t), -Math.cos(t)]
  const neck = add(f.hip, up, f.torsoLen ?? L.torso)
  const back: Point = [-Math.cos(t), -Math.sin(t)]
  const mid = add(add(f.hip, up, (f.torsoLen ?? L.torso) / 2), back, f.arch ?? 0)
  const ht = rad(f.torso + (f.head ?? 0))
  const head = add(neck, [Math.sin(ht), -Math.cos(ht)], L.neck)
  const anchors: Partial<Record<Anchor, Point>> = { head, neck, hip: f.hip, chest: add(neck, up, -8) }
  const front = view === 'front'
  const across: Point = [Math.cos(t), Math.sin(t)]
  const shoulder = (s: number) => (front ? add(neck, across, 5 * s) : neck)
  const hipJoint = (s: number) => (front ? add(f.hip, across, 4 * s) : f.hip)

  // Feet: square with the shin in side view; small and turned out in front view.
  const leg = (spec: Limb, toe: number | undefined, s: number) => {
    const pts = limb(hipJoint(s), spec, L.thigh, L.shin, front ? s : 1, anchors)
    const footAngle = toe ?? (front ? 70 : angleOf(pts[1], pts[2]) + 90)
    return [...pts, add(pts[2], dir(footAngle, front ? s : 1), front ? 4 : L.foot)]
  }
  const farLeg = leg(f.farLeg, f.farToe, -1)
  const nearLeg = leg(f.nearLeg, f.nearToe, 1)
  anchors.farKnee = farLeg[1]
  anchors.nearKnee = nearLeg[1]
  const nearArm = limb(shoulder(1), f.nearArm, L.upperArm, L.forearm, front ? 1 : 1, anchors)
  anchors.nearElbow = nearArm[1]
  anchors.nearHand = nearArm[2]
  const farArm = limb(shoulder(-1), f.farArm, L.upperArm, L.forearm, front ? -1 : 1, anchors)
  return { head, torso: [f.hip, mid, neck], farArm, nearArm, farLeg, nearLeg }
}

const pt = (p: Point) => `${round(p[0])} ${round(p[1])}`
export const chainPath = (pts: Point[]) => 'M' + pts.map(pt).join(' L')
export const torsoPath = ([hip, ctrl, neck]: [Point, Point, Point]) => `M${pt(hip)} Q${pt(ctrl)} ${pt(neck)}`

/** Horizontal shift that centers both frames (and props) on the grid. */
export function centerShift(frames: Solved[], props: Prop[] = []): number {
  const xs: number[] = []
  for (const s of frames) {
    xs.push(s.head[0] - 8, s.head[0] + 8)
    for (const c of [s.farArm, s.nearArm, s.farLeg, s.nearLeg]) for (const p of c) xs.push(p[0] - 4, p[0] + 4)
    for (const p of [s.torso[0], s.torso[2]]) xs.push(p[0] - 6.5, p[0] + 6.5)
  }
  for (const p of props) {
    if (p.kind === 'wall') xs.push(p.x - 2, p.x + 2)
    else if (p.kind === 'box') xs.push(p.x, p.x + p.w)
  }
  return round(60 - (Math.min(...xs) + Math.max(...xs)) / 2)
}
