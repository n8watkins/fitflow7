// The position each move starts in, for the neutral figure shown when a move
// has no photo (components/MoveGlyph.tsx).

export type Position = 'standing' | 'seated' | 'plank' | 'lying' | 'all-fours'

const BY_POSITION: Record<Exclude<Position, 'standing'>, string[]> = {
  seated: ['wall-sit', 'triceps-dips', 'reverse-push-ups', 'russian-twist'],
  plank: [
    'push-ups', 'plank', 'push-up-rotation', 'side-plank', 'mountain-climbers', 'incline-push-up',
    'shoulder-taps', 'plank-up-downs', 'straight-arm-plank', 'one-leg-push-ups', 'diamond-push-ups', 'burpees',
  ],
  lying: [
    'crunches', 'glute-bridge', 'dead-bug', 'reverse-crunches', 'long-arm-crunches', 'one-leg-bridge',
    'cross-arm-crunches', 'bicycle-crunches', 'froggy-glute-lifts', 'bottom-leg-lift-left', 'bottom-leg-lift-right',
    'side-leg-circles-left', 'side-leg-circles-right', 'cobra-stretch', 'spine-lumbar-twist-left', 'spine-lumbar-twist-right',
  ],
  'all-fours': [
    'bird-dog', 'knee-push-up', 'donkey-kick-left', 'donkey-kick-right', 'fire-hydrant-left', 'fire-hydrant-right',
    'kneeling-lunge-stretch-left', 'kneeling-lunge-stretch-right', 'cat-cow-pose', 'child-pose',
  ],
}

const POSITION_OF = new Map<string, Position>(
  (Object.entries(BY_POSITION) as [Position, string[]][]).flatMap(([pos, ids]) => ids.map((id) => [id, pos] as const)),
)

/** The position a move starts in; standing unless listed above. */
export function positionOf(exerciseId: string): Position {
  return POSITION_OF.get(exerciseId) ?? 'standing'
}

export const POSITION_LABEL: Record<Position, string> = {
  standing: 'Standing move',
  seated: 'Seated move',
  plank: 'Plank position',
  lying: 'Lying on the floor',
  'all-fours': 'On hands and knees',
}

