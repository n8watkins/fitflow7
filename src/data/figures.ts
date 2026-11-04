import type { Bend, Frame, Limb, Point, Pose } from '../lib/figure'
import type { Anchor } from '../lib/figure'

// Poses for the drawn exercise figures, one per exercise in data/exercises.ts
// (a test checks that). Side view faces right with the floor at y = 105; a hand
// or foot resting on the floor sits at y = 101, a hip or shoulder lying on it at
// y = 98.5. Angles: 0 points down, 90 forward, 180 up (see lib/figure.ts).

const A = (upper: number, lower: number, len?: [number, number]): Limb => ({ a: [upper, lower], len })
const T = (to: Point | Anchor, bend: Bend = 'fwd', off?: Point): Limb => ({ to, bend, off })

const FOOT = 101
const LYING = 98.5

/** A straight body from the ankle up to the neck at `elev` degrees above the
 *  floor (planks and push-ups). Returns the hip, torso angle and neck. */
function line(ankle: Point, elev: number) {
  const r = (elev * Math.PI) / 180
  const u: Point = [Math.cos(r), -Math.sin(r)]
  return {
    hip: [ankle[0] + u[0] * 44, ankle[1] + u[1] * 44] as Point,
    neck: [ankle[0] + u[0] * 74, ankle[1] + u[1] * 74] as Point,
    torso: 90 - elev,
  }
}

/** A straight body from the knee (on the floor) up to the neck. */
function kneeLine(knee: Point, elev: number) {
  const r = (elev * Math.PI) / 180
  const u: Point = [Math.cos(r), -Math.sin(r)]
  return {
    hip: [knee[0] + u[0] * 22, knee[1] + u[1] * 22] as Point,
    neck: [knee[0] + u[0] * 52, knee[1] + u[1] * 52] as Point,
    torso: 90 - elev,
    thigh: (Math.atan2(-Math.cos(r), Math.sin(r)) * 180) / Math.PI,
  }
}

/** The hip for a torso of the given angle that ends at `neck`. */
function hipFrom(neck: Point, torso: number, len = 30): Point {
  const r = (torso * Math.PI) / 180
  return [neck[0] - Math.sin(r) * len, neck[1] + Math.cos(r) * len]
}

// ---- Shared frames --------------------------------------------------------

const STAND: Frame = {
  hip: [60, 57],
  torso: 0,
  farArm: A(-6, -2),
  nearArm: A(6, 4),
  farLeg: T([58, FOOT]),
  nearLeg: T([62, FOOT]),
}

const STAND_FRONT: Frame = {
  hip: [60, 57],
  torso: 0,
  farArm: A(8, 4),
  nearArm: A(8, 4),
  farLeg: T([56, FOOT], 'back'),
  nearLeg: T([64, FOOT]),
}

/** High plank, hands under the shoulders. */
function highPlank(elev = 18, handX?: number): Frame {
  const l = line([10, 95], elev)
  const hx = handX ?? l.neck[0]
  return {
    hip: l.hip,
    torso: l.torso,
    farArm: T([hx - 2, FOOT], 'up'),
    nearArm: T([hx, FOOT], 'up'),
    farLeg: T([10, 95], 'down'),
    nearLeg: T([12, 95], 'down'),
    farToe: 10,
    nearToe: 10,
  }
}
const PLANK_HANDS = line([10, 95], 18).neck[0]

/** Forearm plank: elbows under the shoulders, forearms flat. */
function forearmPlank(drop = 0): Frame {
  const l = line([10, 95], 7)
  const hip: Point = [l.hip[0], l.hip[1] + drop]
  const torso = Math.atan2(l.neck[0] - hip[0], hip[1] - l.neck[1]) * (180 / Math.PI)
  return {
    hip,
    torso,
    farArm: A(-2, 90),
    nearArm: A(0, 90),
    farLeg: T([10, 95], 'down'),
    nearLeg: T([12, 95], 'down'),
    farToe: 10,
    nearToe: 10,
  }
}

/** On hands and knees: knees under the hips, hands under the shoulders. */
function allFours(over: Partial<Frame> = {}): Frame {
  return {
    hip: [44, 79],
    torso: 78,
    farArm: T([71, FOOT], 'back'),
    nearArm: T([73, FOOT], 'back'),
    farLeg: A(0, -90),
    nearLeg: A(2, -90),
    farToe: -100,
    nearToe: -100,
    ...over,
  }
}

/** Lying on the back, head to the left. */
function supine(over: Partial<Frame> = {}): Frame {
  return {
    hip: [66, LYING],
    torso: -90,
    head: 6,
    farArm: T([86, FOOT], 'up'),
    nearArm: T([88, FOOT], 'up'),
    farLeg: T([86, FOOT], 'up'),
    nearLeg: T([88, FOOT], 'up'),
    ...over,
  }
}

/** Lying on one side, head propped on the lower arm, seen from the front. */
function sideLying(over: Partial<Frame> = {}): Frame {
  return {
    hip: [60, LYING],
    torso: -84,
    head: 4,
    farArm: T([22, FOOT], 'up'),
    nearArm: T([44, FOOT], 'up'),
    farLeg: A(90, 90),
    nearLeg: A(88, 88),
    farToe: 180,
    nearToe: 180,
    ...over,
  }
}

/** Lying face down, head to the right. */
function prone(over: Partial<Frame> = {}): Frame {
  return {
    hip: [44, LYING],
    torso: 90,
    head: -4,
    farArm: T([62, FOOT], 'up'),
    nearArm: T([64, FOOT], 'up'),
    farLeg: A(-90, -90),
    nearLeg: A(-90, -90),
    farToe: -170,
    nearToe: -170,
    ...over,
  }
}

const SQUAT: Frame = {
  hip: [46, 80],
  torso: 38,
  farArm: A(88, 90),
  nearArm: A(90, 92),
  farLeg: T([60, FOOT]),
  nearLeg: T([62, FOOT]),
}

const pushUp = (handX = PLANK_HANDS): Pick<Pose, 'a' | 'b'> => ({
  a: highPlank(18, handX),
  b: highPlank(4, handX),
})

/** Standing reverse lunge: the `back` leg steps behind and the knee drops. */
function lungeFrame(back: 'far' | 'near'): Frame {
  const front = T([72, FOOT], 'fwd')
  const rear = A(-10, -96)
  return {
    hip: [52, 80],
    torso: 2,
    farArm: A(-6, -2),
    nearArm: A(4, 2),
    farLeg: back === 'far' ? rear : front,
    nearLeg: back === 'far' ? front : rear,
    farToe: back === 'far' ? 60 : undefined,
    nearToe: back === 'near' ? 60 : undefined,
  }
}

// ---- One pose per exercise -------------------------------------------------

const DONKEY: Pose = {
  work: ['nearLeg'],
  a: allFours(),
  b: allFours({ nearLeg: A(-100, -180) }),
}

const FIRE_HYDRANT: Pose = {
  view: 'front',
  scale: 1.3,
  work: ['nearLeg'],
  a: {
    hip: [60, 75],
    torso: 0,
    torsoLen: 8,
    head: 0,
    farArm: A(16, 6),
    nearArm: A(16, 6),
    farLeg: { a: [0, 0], len: [22, 1] },
    nearLeg: { a: [0, 0], len: [22, 1] },
    farToe: 0,
    nearToe: 0,
  },
  b: {
    hip: [58, 75],
    torso: -6,
    torsoLen: 8,
    farArm: A(16, 6),
    nearArm: A(14, 4),
    farLeg: { a: [2, 0], len: [22, 1] },
    nearLeg: { a: [84, 10], len: [22, 6] },
    farToe: 0,
    nearToe: 0,
  },
}

const SPLIT_SQUAT: Pose = {
  work: ['farLeg', 'nearLeg'],
  a: {
    hip: [54, 63],
    torso: 2,
    farArm: A(-4, -2),
    nearArm: A(4, 2),
    nearLeg: T([72, FOOT]),
    farLeg: T([34, 99], 'down'),
    farToe: 40,
  },
  b: {
    hip: [52, 80],
    torso: 2,
    farArm: A(-4, -2),
    nearArm: A(4, 2),
    nearLeg: T([72, FOOT]),
    farLeg: T([34, 99], 'down'),
    farToe: 40,
  },
}

const CALF_ONE: Pose = {
  work: ['farLeg'],
  props: [{ kind: 'wall', x: 86 }],
  a: {
    hip: [60, 57],
    torso: 3,
    farArm: A(-6, -2),
    nearArm: T([83, 48], 'down'),
    farLeg: T([60, FOOT]),
    nearLeg: A(-4, -70),
  },
  b: {
    hip: [61, 51],
    torso: 3,
    farArm: A(-6, -2),
    nearArm: T([83, 48], 'down'),
    farLeg: T([61, 96]),
    nearLeg: A(-4, -70),
    farToe: 40,
  },
}

const KICK: Pose = {
  work: ['nearLeg'],
  scale: 0.95,
  a: lungeFrame('near'),
  b: {
    hip: [56, 57],
    torso: -8,
    farArm: A(30, 70),
    nearArm: A(-30, 20),
    farLeg: T([56, FOOT]),
    nearLeg: A(88, 88),
    nearToe: 160,
  },
}

const SIDE_LIFT: Pose = {
  work: ['farLeg'],
  a: sideLying({ nearLeg: T([62, FOOT], 'up'), farLeg: A(92, 92) }),
  b: sideLying({ nearLeg: T([62, FOOT], 'up'), farLeg: A(104, 104) }),
}

const LEG_CIRCLE: Pose = {
  work: ['nearLeg'],
  a: sideLying({ nearLeg: A(112, 112) }),
  b: sideLying({ nearLeg: A(100, 104) }),
}

const TRICEP_STRETCH: Pose = {
  view: 'front',
  work: ['nearArm'],
  still: 'a',
  a: { ...STAND_FRONT, nearArm: A(150, -32), farArm: T('nearElbow', 'up', [-1, -2]) },
  b: { ...STAND_FRONT, head: 4, nearArm: A(146, -36), farArm: T('nearElbow', 'up', [-1, -2]) },
}

const KNEELING_STRETCH: Pose = {
  work: ['farLeg'],
  a: {
    hip: [50, 79],
    torso: 0,
    farArm: T('hip', 'back', [5, -3]),
    nearArm: T('hip', 'back', [7, -3]),
    nearLeg: T([74, FOOT], 'up'),
    farLeg: A(-20, -90),
    farToe: -90,
  },
  b: {
    hip: [56, 84],
    torso: -6,
    farArm: T('hip', 'back', [5, -3]),
    nearArm: T('hip', 'back', [7, -3]),
    nearLeg: T([78, FOOT], 'up'),
    farLeg: A(-39, -90),
    farToe: -90,
  },
}

const CALF_STRETCH: Pose = {
  work: ['farLeg'],
  still: 'a',
  props: [{ kind: 'wall', x: 96 }],
  a: {
    hip: [60, 64],
    torso: 26,
    farArm: T([92, 42], 'down'),
    nearArm: T([93, 44], 'down'),
    nearLeg: T([74, FOOT], 'fwd'),
    farLeg: T([30, FOOT], 'fwd'),
    farToe: 90,
  },
  b: {
    hip: [63, 66],
    torso: 30,
    farArm: T([92, 42], 'down'),
    nearArm: T([93, 44], 'down'),
    nearLeg: T([74, FOOT], 'fwd'),
    farLeg: T([30, FOOT], 'fwd'),
    farToe: 90,
  },
}

const TWIST: Pose = {
  view: 'front',
  floor: false,
  work: ['torso'],
  props: [{ kind: 'mat', x: 14, y: 6, w: 92, h: 108 }],
  a: {
    hip: [60, 64],
    torso: 0,
    head: 0,
    farArm: A(88, 90),
    nearArm: A(88, 90),
    farLeg: A(4, 2),
    nearLeg: A(4, 2),
    farToe: 0,
    nearToe: 0,
  },
  b: {
    hip: [60, 64],
    torso: 0,
    head: 6,
    farArm: A(88, 90),
    nearArm: A(88, 90),
    farLeg: A(62, -12),
    nearLeg: A(-58, 22),
    farToe: 0,
    nearToe: 0,
  },
}

const LUNGE_HOP: Pose = {
  work: ['nearLeg', 'farLeg'],
  scale: 0.95,
  a: lungeFrame('near'),
  b: {
    hip: [56, 52],
    torso: 4,
    farArm: A(40, 120),
    nearArm: A(-40, 20),
    farLeg: T([56, 96]),
    nearLeg: A(95, 5),
    farToe: 40,
  },
}

const mirrored = (p: Pose): Pose => ({ ...p, mirror: !p.mirror })

export const POSES: Record<string, Pose> = {
  'jumping-jacks': {
    view: 'front',
    scale: 0.9,
    work: ['farLeg', 'nearLeg', 'farArm', 'nearArm'],
    a: STAND_FRONT,
    b: {
      hip: [60, 59],
      torso: 0,
      farArm: A(150, 168),
      nearArm: A(150, 168),
      farLeg: T([44, FOOT], 'back'),
      nearLeg: T([76, FOOT]),
    },
  },
  'wall-sit': {
    work: ['farLeg', 'nearLeg'],
    still: 'a',
    props: [{ kind: 'wall', x: 41 }],
    a: {
      hip: [49, 79],
      torso: 0,
      farArm: A(70, 85),
      nearArm: A(74, 88),
      farLeg: T([69, FOOT], 'up'),
      nearLeg: T([71, FOOT], 'up'),
    },
    b: {
      hip: [49, 80],
      torso: 0,
      head: 3,
      farArm: A(70, 85),
      nearArm: A(74, 88),
      farLeg: T([69, FOOT], 'up'),
      nearLeg: T([71, FOOT], 'up'),
    },
  },
  'push-ups': { work: ['farArm', 'nearArm'], ...pushUp() },
  crunches: {
    work: ['torso'],
    a: supine({ farArm: A(92, 90), nearArm: A(92, 90) }),
    b: supine({ torso: -52, arch: 4, head: 14, farArm: A(74, 76), nearArm: A(76, 78) }),
  },
  'step-ups': {
    work: ['farLeg', 'nearLeg'],
    scale: 0.86,
    props: [{ kind: 'box', x: 62, w: 34, h: 18 }],
    a: {
      hip: [52, 60],
      torso: 8,
      farArm: A(30, 60),
      nearArm: A(-25, -5),
      farLeg: T([48, FOOT]),
      nearLeg: T([74, 83], 'fwd'),
    },
    b: {
      hip: [72, 40],
      torso: 2,
      farArm: A(-25, -5),
      nearArm: A(30, 60),
      nearLeg: T([74, 83]),
      farLeg: A(92, 0),
    },
  },
  squats: { work: ['farLeg', 'nearLeg'], a: { ...STAND, farArm: A(60, 70), nearArm: A(62, 72) }, b: SQUAT },
  'triceps-dips': {
    work: ['farArm', 'nearArm'],
    props: [{ kind: 'box', x: 16, w: 28, h: 30 }],
    a: {
      hip: [49, 71],
      torso: 0,
      farArm: T([39, 71], 'back'),
      nearArm: T([41, 71], 'back'),
      farLeg: T([80, FOOT], 'up'),
      nearLeg: T([82, FOOT], 'up'),
    },
    b: {
      hip: [50, 82],
      torso: 10,
      farArm: T([39, 71], 'back'),
      nearArm: T([41, 71], 'back'),
      farLeg: T([80, FOOT], 'up'),
      nearLeg: T([82, FOOT], 'up'),
    },
  },
  plank: { work: ['torso'], still: 'a', a: forearmPlank(0), b: forearmPlank(2.5) },
  'high-knees': {
    work: ['farLeg', 'nearLeg'],
    a: {
      hip: [60, 55],
      torso: 2,
      farArm: A(45, 150),
      nearArm: A(-40, 50),
      farLeg: T([60, 99]),
      nearLeg: A(100, 5),
      farToe: 50,
    },
    b: {
      hip: [60, 55],
      torso: 2,
      farArm: A(-40, 50),
      nearArm: A(45, 150),
      nearLeg: T([60, 99]),
      farLeg: A(100, 5),
      nearToe: 50,
    },
  },
  lunges: {
    work: ['farLeg', 'nearLeg'],
    scale: 0.95,
    a: { ...STAND, hip: [46, 57], farLeg: T([44, FOOT]), nearLeg: T([48, FOOT]) },
    b: {
      hip: [58, 80],
      torso: 2,
      farArm: A(-6, -2),
      nearArm: A(4, 2),
      nearLeg: T([80, FOOT]),
      farLeg: A(-8, -96),
      farToe: 60,
    },
  },
  'push-up-rotation': {
    work: ['torso', 'nearArm'],
    a: highPlank(),
    b: { ...highPlank(), nearArm: A(178, 180), farArm: T([PLANK_HANDS, FOOT], 'up') },
  },
  'side-plank': {
    work: ['torso'],
    a: (() => {
      const neck: Point = [84, 86]
      return {
        hip: hipFrom(neck, 64),
        torso: 64,
        farArm: A(0, 90),
        nearArm: A(178, 180),
        farLeg: T([12, 97], 'up'),
        nearLeg: T([14, 95], 'up'),
        farToe: 70,
        nearToe: 70,
      }
    })(),
    b: (() => {
      const l = line([12, 97], 8)
      return {
        hip: l.hip,
        torso: l.torso,
        farArm: A(0, 90),
        nearArm: A(178, 180),
        farLeg: T([12, 97], 'down'),
        nearLeg: T([14, 95], 'down'),
        farToe: 70,
        nearToe: 70,
      }
    })(),
  },
  'mountain-climbers': {
    work: ['farLeg', 'nearLeg'],
    a: { ...highPlank(), nearLeg: T([58, 97], 'down'), nearToe: 20 },
    b: { ...highPlank(), farLeg: T([58, 97], 'down'), farToe: 20, nearLeg: T([12, 95], 'down') },
  },
  'glute-bridge': {
    work: ['farLeg', 'nearLeg'],
    a: supine({ hip: [62, LYING], farArm: A(92, 90), nearArm: A(92, 90), farLeg: T([82, FOOT], 'up'), nearLeg: T([84, FOOT], 'up') }),
    b: (() => {
      const neck: Point = [32, LYING]
      return supine({
        hip: hipFrom(neck, -120),
        torso: -120,
        head: 26,
        farArm: A(92, 90),
        nearArm: A(92, 90),
        farLeg: T([80, FOOT], 'up'),
        nearLeg: T([82, FOOT], 'up'),
      })
    })(),
  },
  'dead-bug': {
    work: ['torso'],
    a: supine({ farArm: A(180, 180), nearArm: A(178, 178), farLeg: A(178, 90), nearLeg: A(180, 92) }),
    b: supine({ farArm: A(180, 180), nearArm: A(-100, -100), farLeg: A(100, 98), nearLeg: A(180, 92) }),
  },
  'bird-dog': {
    work: ['torso', 'nearArm', 'farLeg'],
    a: allFours(),
    b: allFours({ nearArm: A(100, 100), farLeg: A(-96, -96), farToe: -186 }),
  },
  'incline-push-up': {
    work: ['farArm', 'nearArm'],
    props: [{ kind: 'box', x: 56, w: 28, h: 30 }],
    a: (() => {
      const l = line([12, 95], 44)
      return { hip: l.hip, torso: l.torso, farArm: T([70, 71], 'up'), nearArm: T([72, 71], 'up'), farLeg: T([12, 95], 'down'), nearLeg: T([14, 95], 'down'), farToe: 10, nearToe: 10 }
    })(),
    b: (() => {
      const l = line([12, 95], 32)
      return { hip: l.hip, torso: l.torso, farArm: T([70, 71], 'up'), nearArm: T([72, 71], 'up'), farLeg: T([12, 95], 'down'), nearLeg: T([14, 95], 'down'), farToe: 10, nearToe: 10 }
    })(),
  },
  'knee-push-up': {
    work: ['farArm', 'nearArm'],
    a: (() => {
      const k = kneeLine([34, FOOT], 34)
      return { hip: k.hip, torso: k.torso, farArm: T([75, FOOT], 'up'), nearArm: T([77, FOOT], 'up'), farLeg: A(k.thigh, -150), nearLeg: A(k.thigh, -146), farToe: -60, nearToe: -60 }
    })(),
    b: (() => {
      const k = kneeLine([34, FOOT], 10)
      return { hip: k.hip, torso: k.torso, farArm: T([75, FOOT], 'up'), nearArm: T([77, FOOT], 'up'), farLeg: A(k.thigh, -150), nearLeg: A(k.thigh, -146), farToe: -60, nearToe: -60 }
    })(),
  },
  'reverse-lunges': {
    work: ['farLeg', 'nearLeg'],
    scale: 0.95,
    a: { ...STAND, hip: [70, 57], farLeg: T([70, FOOT]), nearLeg: T([72, FOOT]) },
    b: {
      hip: [50, 80],
      torso: 2,
      farArm: A(-6, -2),
      nearArm: A(4, 2),
      farLeg: T([72, FOOT]),
      nearLeg: A(-10, -96),
      nearToe: 60,
    },
  },
  'calf-raises': {
    work: ['farLeg', 'nearLeg'],
    a: STAND,
    b: { ...STAND, hip: [61, 51], farLeg: T([59, 95.5]), nearLeg: T([63, 95.5]), farToe: 40, nearToe: 40 },
  },
  'shoulder-taps': {
    work: ['torso'],
    a: highPlank(),
    b: { ...highPlank(), nearArm: T('neck', 'down', [-2, 6]) },
  },
  'plank-up-downs': {
    work: ['torso', 'farArm', 'nearArm'],
    a: forearmPlank(),
    b: { ...highPlank(18), farArm: T([86, FOOT], 'up'), nearArm: T([88, FOOT], 'up') },
  },
  'march-in-place': {
    work: ['farLeg', 'nearLeg'],
    a: { ...STAND, farArm: A(30, 70), nearArm: A(-25, 10), nearLeg: A(70, 0) },
    b: { ...STAND, farArm: A(-25, 10), nearArm: A(30, 70), farLeg: A(70, 0) },
  },
  'hip-hinge': {
    work: ['farLeg', 'nearLeg'],
    a: STAND,
    b: { hip: [50, 62], torso: 72, farArm: A(-2, 0), nearArm: A(2, 2), farLeg: T([60, FOOT]), nearLeg: T([62, FOOT]) },
  },
  'jumping-squats': {
    work: ['farLeg', 'nearLeg'],
    scale: 0.84,
    a: { ...SQUAT, farArm: A(-30, -20), nearArm: A(-28, -18) },
    b: { hip: [60, 47], torso: 4, farArm: A(-36, -24), nearArm: A(-32, -20), farLeg: A(-4, 4), nearLeg: A(0, 8), farToe: 30, nearToe: 30 },
  },
  'reverse-crunches': {
    work: ['torso'],
    a: supine({ farArm: A(92, 90), nearArm: A(92, 90), farLeg: A(178, 90), nearLeg: A(180, 92) }),
    b: supine({ hip: [66, 92], torso: -84, arch: 3, farArm: A(92, 90), nearArm: A(92, 90), farLeg: A(-150, 150), nearLeg: A(-148, 152) }),
  },
  'straight-arm-plank': {
    work: ['torso'],
    still: 'a',
    a: highPlank(18),
    b: highPlank(17),
  },
  'russian-twist': {
    work: ['torso'],
    a: {
      hip: [56, LYING],
      torso: -38,
      farArm: T([76, 74], 'down'),
      nearArm: T([77, 75], 'down'),
      farLeg: A(118, 58),
      nearLeg: A(120, 60),
    },
    b: {
      hip: [56, LYING],
      torso: -34,
      farArm: T([66, 98], 'fwd'),
      nearArm: T([67, 99], 'fwd'),
      farLeg: A(116, 56),
      nearLeg: A(118, 58),
    },
  },
  burpees: {
    work: ['farLeg', 'nearLeg', 'farArm', 'nearArm'],
    scale: 0.82,
    a: highPlank(),
    b: { hip: [60, 50], torso: 0, farArm: A(150, 160), nearArm: A(-150, -160), farLeg: A(-2, 2), nearLeg: A(2, 4), farToe: 25, nearToe: 25 },
  },
  'long-arm-crunches': {
    work: ['torso'],
    a: supine({ farArm: A(-90, -90), nearArm: A(-92, -92) }),
    b: supine({ torso: -50, arch: 4, head: 8, farArm: A(-128, -128), nearArm: A(-130, -130) }),
  },
  'one-leg-bridge': {
    work: ['farLeg', 'nearLeg'],
    a: supine({ hip: [62, LYING], farArm: A(92, 90), nearArm: A(92, 90), farLeg: T([82, FOOT], 'up'), nearLeg: A(150, 112) }),
    b: (() => {
      const neck: Point = [32, LYING]
      return supine({
        hip: hipFrom(neck, -120),
        torso: -120,
        head: 26,
        farArm: A(92, 90),
        nearArm: A(92, 90),
        farLeg: T([80, FOOT], 'up'),
        nearLeg: A(118, 118),
      })
    })(),
  },
  'one-leg-push-ups': {
    work: ['farArm', 'nearArm'],
    a: { ...highPlank(18), nearLeg: A(-80, -80) },
    b: { ...highPlank(4, PLANK_HANDS), nearLeg: A(-88, -88) },
  },
  'cross-arm-crunches': {
    work: ['torso'],
    a: supine({ farArm: T('chest', 'up', [2, -6]), nearArm: T('chest', 'up', [3, -7]) }),
    b: supine({ torso: -52, arch: 4, head: 14, farArm: T('chest', 'up', [6, -2]), nearArm: T('chest', 'up', [7, -3]) }),
  },
  'bicycle-crunches': {
    work: ['torso'],
    a: supine({ torso: -60, arch: 3, head: 12, farArm: T('head', 'up', [3, -4]), nearArm: T('nearKnee', 'up', [-6, -2]), nearLeg: A(-160, 140), farLeg: A(96, 96) }),
    b: supine({ torso: -60, arch: 3, head: 12, nearArm: T('head', 'up', [3, -4]), farArm: T('farKnee', 'up', [-6, -2]), farLeg: A(-160, 140), nearLeg: A(96, 96) }),
  },
  'froggy-glute-lifts': {
    work: ['farLeg', 'nearLeg'],
    a: prone({ farArm: A(110, -60), nearArm: A(108, -62), farLeg: A(-90, -170), nearLeg: A(-90, -172), farToe: -80, nearToe: -80 }),
    b: prone({ farArm: A(110, -60), nearArm: A(108, -62), farLeg: A(-110, -175), nearLeg: A(-110, -176), farToe: -80, nearToe: -80 }),
  },
  'donkey-kick-left': DONKEY,
  'split-squat-right': SPLIT_SQUAT,
  'fire-hydrant-left': mirrored(FIRE_HYDRANT),
  'fire-hydrant-right': FIRE_HYDRANT,
  'plie-squats': {
    view: 'front',
    work: ['farLeg', 'nearLeg'],
    a: { hip: [60, 60], torso: 0, farArm: T('chest', 'down', [0, 2]), nearArm: T('chest', 'down', [0, 2]), farLeg: T([44, FOOT], 'back'), nearLeg: T([76, FOOT]), farToe: 80, nearToe: 80 },
    b: { hip: [60, 78], torso: 0, farArm: T('chest', 'down', [0, 2]), nearArm: T('chest', 'down', [0, 2]), farLeg: T([42, FOOT], 'back'), nearLeg: T([78, FOOT]), farToe: 80, nearToe: 80 },
  },
  'donkey-kick-right': mirrored(DONKEY),
  'sumo-squat-calf-raises': {
    view: 'front',
    work: ['farLeg', 'nearLeg'],
    a: { hip: [60, 78], torso: 0, farArm: A(30, 140), nearArm: A(30, 140), farLeg: T([42, FOOT], 'back'), nearLeg: T([78, FOOT]), farToe: 80, nearToe: 80 },
    b: { hip: [60, 73], torso: 0, farArm: A(30, 140), nearArm: A(30, 140), farLeg: T([42, 97], 'back'), nearLeg: T([78, 97]), farToe: 10, nearToe: 10 },
  },
  'split-squat-left': mirrored(SPLIT_SQUAT),
  'curtsy-lunges': {
    view: 'front',
    work: ['farLeg', 'nearLeg'],
    a: { ...STAND_FRONT, farArm: T('chest', 'down', [0, 2]), nearArm: T('chest', 'down', [0, 2]) },
    b: { hip: [58, 74], torso: 0, farArm: T('chest', 'down', [0, 2]), nearArm: T('chest', 'down', [0, 2]), farLeg: T([52, FOOT], 'back'), nearLeg: T([46, 99], 'down'), nearToe: 20 },
  },
  'single-left-leg-calf-raises': CALF_ONE,
  'side-lunge-knee-hop': {
    view: 'front',
    work: ['farLeg', 'nearLeg'],
    a: { hip: [66, 76], torso: 4, farArm: A(20, 60), nearArm: A(20, 60), farLeg: T([40, FOOT], 'back'), nearLeg: T([86, FOOT]) },
    b: { hip: [56, 54], torso: 0, farArm: A(30, 150), nearArm: A(10, 20), farLeg: T([54, 96], 'back'), nearLeg: { a: [175, 2], len: [12, 20] } },
  },
  'single-right-leg-calf-raises': mirrored(CALF_ONE),
  'bottom-leg-lift-left': SIDE_LIFT,
  'bottom-leg-lift-right': mirrored(SIDE_LIFT),
  'right-lunge-knee-hops': LUNGE_HOP,
  'side-leg-circles-left': mirrored(LEG_CIRCLE),
  'side-leg-circles-right': LEG_CIRCLE,
  'backward-lunge-front-kick-left': KICK,
  'backward-lunge-front-kick-right': mirrored(KICK),
  'side-arm-raise': {
    view: 'front',
    work: ['farArm', 'nearArm'],
    a: STAND_FRONT,
    b: { ...STAND_FRONT, farArm: A(84, 88), nearArm: A(84, 88) },
  },
  'diamond-push-ups': { work: ['farArm', 'nearArm'], ...pushUp(PLANK_HANDS - 8) },
  punches: {
    work: ['farArm', 'nearArm'],
    a: { hip: [58, 59], torso: 6, farArm: T('head', 'down', [5, 7]), nearArm: A(90, 90), farLeg: T([66, FOOT]), nearLeg: T([50, FOOT], 'fwd'), farToe: 80 },
    b: { hip: [58, 59], torso: 6, nearArm: T('head', 'down', [5, 7]), farArm: A(88, 90), farLeg: T([66, FOOT]), nearLeg: T([50, FOOT], 'fwd'), farToe: 80 },
  },
  'shoulder-stretch': {
    view: 'front',
    work: ['nearArm'],
    still: 'a',
    a: { ...STAND_FRONT, nearArm: A(-80, -92), farArm: T('nearElbow', 'down', [0, 2]) },
    b: { ...STAND_FRONT, nearArm: A(-86, -96), farArm: T('nearElbow', 'down', [0, 2]) },
  },
  'arm-circles': {
    view: 'front',
    work: ['farArm', 'nearArm'],
    a: { ...STAND_FRONT, farArm: A(78, 80), nearArm: A(78, 80) },
    b: { ...STAND_FRONT, farArm: A(100, 102), nearArm: A(100, 102) },
  },
  'reverse-push-ups': {
    work: ['farArm', 'nearArm'],
    a: {
      hip: [56, 57],
      torso: 140,
      farArm: T([88, FOOT], 'up'),
      nearArm: T([90, FOOT], 'up'),
      farLeg: T([42, FOOT], 'back'),
      nearLeg: T([44, FOOT], 'back'),
      farToe: 70,
      nearToe: 70,
    },
    b: {
      hip: [58, 60],
      torso: 124,
      head: 10,
      farArm: T([88, FOOT], 'up'),
      nearArm: T([90, FOOT], 'up'),
      farLeg: T([42, FOOT], 'back'),
      nearLeg: T([44, FOOT], 'back'),
      farToe: 70,
      nearToe: 70,
    },
  },
  'tricep-stretch-left': mirrored(TRICEP_STRETCH),
  'tricep-stretch-right': TRICEP_STRETCH,
  'kneeling-lunge-stretch-left': KNEELING_STRETCH,
  'kneeling-lunge-stretch-right': mirrored(KNEELING_STRETCH),
  'calf-stretch-left': CALF_STRETCH,
  'calf-stretch-right': mirrored(CALF_STRETCH),
  'cat-cow-pose': {
    work: ['torso'],
    a: allFours({ arch: -7, head: -30 }),
    b: allFours({ arch: 9, head: 50 }),
  },
  'cobra-stretch': {
    work: ['torso'],
    a: prone(),
    b: (() => {
      const hip: Point = [44, LYING]
      return prone({ hip, torso: 38, arch: -3, head: -18, farArm: T([62, FOOT], 'up'), nearArm: T([64, FOOT], 'up') })
    })(),
  },
  'child-pose': {
    work: ['torso'],
    a: { hip: [40, 86], torso: 96, arch: 5, head: 8, farArm: T([97, FOOT], 'up'), nearArm: T([99, FOOT], 'up'), farLeg: A(58, -90), nearLeg: A(60, -90), farToe: -90, nearToe: -90 },
    b: { hip: [40, 88], torso: 100, arch: 6, head: 8, farArm: T([97, FOOT], 'up'), nearArm: T([99, FOOT], 'up'), farLeg: A(61, -90), nearLeg: A(63, -90), farToe: -90, nearToe: -90 },
  },
  'spine-lumbar-twist-left': mirrored(TWIST),
  'spine-lumbar-twist-right': TWIST,
}
