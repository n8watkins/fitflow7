import type { Exercise } from '../types'
import { POSITION_LABEL, positionOf, type Position } from '../lib/positions'

// A neutral body-position figure for moves without a photo. The emoji these
// moves used to show were often misleading (a rock climber for Wall Sit, a box
// for Crunches), so until every move has its own picture the fallback shows
// only the position the move starts in: standing, seated, plank, lying or on
// all fours. Drawn in code, colored by currentColor, so it suits both themes.

// Stick figures on a 48×48 grid: a head circle plus one stroked path each.
const FIGURES: Record<Position, { head: [number, number]; path: string }> = {
  standing: { head: [24, 8], path: 'M24 13v15M24 18l-8 7M24 18l8 7M24 28l-6 14M24 28l6 14' },
  seated: { head: [16, 10], path: 'M16 15v14h14v13M16 20l9 4M10 6v36M30 42h5' },
  plank: { head: [9, 22], path: 'M13 24l28 6M15 25v13M41 30l2 8' },
  lying: { head: [8, 33], path: 'M12 34h20M32 34l6-9 4 9M18 34l6-6' },
  'all-fours': { head: [10, 18], path: 'M14 21h20M15 21v17M33 21l3 17h6' },
}

export default function MoveGlyph({ exercise, className = '' }: { exercise: Pick<Exercise, 'id'>; className?: string }) {
  const position = positionOf(exercise.id)
  const { head, path } = FIGURES[position]
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label={POSITION_LABEL[position]}>
      <circle cx={head[0]} cy={head[1]} r="4.5" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 44h40" stroke="currentColor" strokeOpacity=".25" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
