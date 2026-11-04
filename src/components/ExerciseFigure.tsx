import { useMemo } from 'react'
import { POSES } from '../data/figures'
import { centerShift, chainPath, FLOOR, solveFrame, torsoPath, type Chain, type Point } from '../lib/figure'

// A rounded figure drawn in code for every exercise: solid limbs, the far-side
// arm and leg in a lighter tone for depth, and the worked body parts in the
// accent color. It morphs between the move's start and end pose while
// `animate` is on (and the user allows motion); otherwise it holds one pose.
// Colors come from theme tokens, so it suits both themes. Poses: data/figures.ts.

const DUR = '1.6s'
const SPLINE = '.45 0 .55 1;.45 0 .55 1'

function Morph({ attr, a, b }: { attr: string; a: string | number; b: string | number }) {
  return (
    <animate
      attributeName={attr}
      dur={DUR}
      repeatCount="indefinite"
      values={`${a};${b};${a}`}
      calcMode="spline"
      keySplines={SPLINE}
    />
  )
}

export default function ExerciseFigure({
  exerciseId,
  name,
  animate = false,
  className = '',
}: {
  exerciseId: string
  /** Accessible name; defaults to the exercise id. Empty marks it decorative. */
  name?: string
  animate?: boolean
  className?: string
}) {
  const pose = POSES[exerciseId]
  const geo = useMemo(() => {
    if (!pose) return null
    const view = pose.view ?? 'side'
    const a = solveFrame(pose.a, view)
    const b = solveFrame(pose.b, view)
    return { a, b, still: pose.still === 'a' ? a : b, dx: centerShift([a, b], pose.props) }
  }, [pose])
  if (!pose || !geo) return null

  const worked = new Set<Chain>(pose.work)
  const color = (chain: Chain, far: boolean) =>
    worked.has(chain) ? 'var(--fig-work)' : far ? 'var(--fig-back)' : 'var(--fig-skin)'
  const limb = (chain: Exclude<Chain, 'torso'>, far: boolean) => {
    const d = chainPath(geo.still[chain] as Point[])
    return (
      <path
        key={chain}
        d={d}
        fill="none"
        stroke={color(chain, far)}
        strokeOpacity={far && worked.has(chain) ? 0.6 : 1}
        strokeWidth={8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {animate && <Morph attr="d" a={chainPath(geo.a[chain])} b={chainPath(geo.b[chain])} />}
      </path>
    )
  }
  const flip = pose.mirror ? 'translate(120 0) scale(-1 1) ' : ''
  const k = pose.scale ?? 1
  const shrink = k === 1 ? '' : `translate(60 ${FLOOR}) scale(${k}) translate(-60 ${-FLOOR}) `

  return (
    <svg
      viewBox="0 0 120 120"
      className={`ff-figure ${className}`}
      {...(name === '' ? { 'aria-hidden': true } : { role: 'img', 'aria-label': name ?? exerciseId })}
    >
      {pose.floor !== false && (
        <line x1="6" y1={FLOOR} x2="114" y2={FLOOR} stroke="var(--fig-floor)" strokeWidth="2" strokeLinecap="round" />
      )}
      {pose.props?.map((p, i) =>
        p.kind === 'mat' ? <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} rx="10" fill="var(--fig-floor)" opacity=".55" /> : null,
      )}
      <g transform={`${shrink}${flip}translate(${geo.dx} 0)`}>
        {pose.props?.map((p, i) =>
          p.kind === 'mat' ? null : p.kind === 'wall' ? (
            <line key={i} x1={p.x} y1="10" x2={p.x} y2={FLOOR} stroke="var(--fig-floor)" strokeWidth="4" strokeLinecap="round" />
          ) : (
            <rect key={i} x={p.x} y={FLOOR - p.h} width={p.w} height={p.h} rx="2.5" fill="var(--fig-floor)" />
          ),
        )}
        {limb('farLeg', true)}
        {limb('farArm', true)}
        <path
          d={torsoPath(geo.still.torso)}
          fill="none"
          stroke={color('torso', false)}
          strokeWidth={13}
          strokeLinecap="round"
        >
          {animate && <Morph attr="d" a={torsoPath(geo.a.torso)} b={torsoPath(geo.b.torso)} />}
        </path>
        {limb('nearLeg', false)}
        <circle cx={geo.still.head[0]} cy={geo.still.head[1]} r="8.5" fill="var(--fig-skin)">
          {animate && <Morph attr="cx" a={geo.a.head[0]} b={geo.b.head[0]} />}
          {animate && <Morph attr="cy" a={geo.a.head[1]} b={geo.b.head[1]} />}
        </circle>
        {limb('nearArm', false)}
      </g>
    </svg>
  )
}
