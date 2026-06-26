import type { Routine } from '../types'

export const CLASSIC_7: Routine = {
  id: 'classic-7',
  name: 'Classic 7',
  description: 'The original 7-minute workout featuring twelve classic exercises. A comprehensive full-body routine that builds strength and endurance.',
  exerciseIds: [
    'jumping-jacks',
    'wall-sit',
    'push-ups',
    'crunches',
    'step-ups',
    'squats',
    'triceps-dips',
    'plank',
    'high-knees',
    'lunges',
    'push-up-rotation',
    'side-plank'
  ],
  workSeconds: 30,
  restSeconds: 10,
  rounds: 1,
  isSystem: true,
  createdAt: '2026-06-11T00:00:00.000Z',
  updatedAt: '2026-06-11T00:00:00.000Z'
}

export const ABS_WORKOUT: Routine = {
  id: 'abs-workout',
  name: 'Abs Workout',
  description: 'A core-focused circuit mixing crunches, planks, and explosive moves to torch your abs.',
  exerciseIds: [
    'jumping-squats',
    'reverse-crunches',
    'straight-arm-plank',
    'russian-twist',
    'bird-dog',
    'burpees',
    'long-arm-crunches',
    'one-leg-bridge',
    'one-leg-push-ups',
    'plank',
    'cross-arm-crunches',
    'mountain-climbers',
    'glute-bridge',
    'bicycle-crunches'
  ],
  workSeconds: 30,
  restSeconds: 10,
  rounds: 1,
  isSystem: true,
  createdAt: '2026-06-25T00:00:00.000Z',
  updatedAt: '2026-06-25T00:00:00.000Z'
}

export const BUTT_WORKOUT: Routine = {
  id: 'butt-workout',
  name: 'Butt Workout',
  description: 'A glute-building routine packed with squats, kickbacks, and lifts to sculpt and strengthen your backside.',
  exerciseIds: [
    'squats',
    'froggy-glute-lifts',
    'lunges',
    'glute-bridge',
    'donkey-kick-left',
    'split-squat-right',
    'fire-hydrant-left',
    'fire-hydrant-right',
    'plie-squats',
    'donkey-kick-right',
    'sumo-squat-calf-raises',
    'split-squat-left'
  ],
  workSeconds: 30,
  restSeconds: 10,
  rounds: 1,
  isSystem: true,
  createdAt: '2026-06-25T00:00:00.000Z',
  updatedAt: '2026-06-25T00:00:00.000Z'
}

export const LEG_WORKOUT: Routine = {
  id: 'leg-workout',
  name: 'Leg Workout',
  description: 'A lower-body burner combining lunges, calf raises, and leg lifts to build strong, balanced legs.',
  exerciseIds: [
    'calf-raises',
    'curtsy-lunges',
    'single-left-leg-calf-raises',
    'side-lunge-knee-hop',
    'single-right-leg-calf-raises',
    'bottom-leg-lift-left',
    'bottom-leg-lift-right',
    'right-lunge-knee-hops',
    'side-leg-circles-left',
    'side-leg-circles-right',
    'backward-lunge-front-kick-left',
    'backward-lunge-front-kick-right'
  ],
  workSeconds: 30,
  restSeconds: 10,
  rounds: 1,
  isSystem: true,
  createdAt: '2026-06-25T00:00:00.000Z',
  updatedAt: '2026-06-25T00:00:00.000Z'
}

export const ARM_WORKOUT: Routine = {
  id: 'arm-workout',
  name: 'Arm Workout',
  description: 'An upper-body session of push-ups, dips, and punches to tone and strengthen your arms and shoulders.',
  exerciseIds: [
    'side-arm-raise',
    'push-ups',
    'triceps-dips',
    'diamond-push-ups',
    'punches',
    'plank-up-downs',
    'shoulder-stretch',
    'arm-circles',
    'reverse-push-ups',
    'punches',
    'one-leg-push-ups',
    'shoulder-taps',
    'tricep-stretch-left',
    'tricep-stretch-right'
  ],
  workSeconds: 30,
  restSeconds: 10,
  rounds: 1,
  isSystem: true,
  createdAt: '2026-06-25T00:00:00.000Z',
  updatedAt: '2026-06-25T00:00:00.000Z'
}

export const STRETCH_WORKOUT: Routine = {
  id: 'stretch-workout',
  name: 'Stretching',
  description: 'A calming flow of stretches and poses to improve flexibility and release tension head to toe.',
  exerciseIds: [
    'kneeling-lunge-stretch-left',
    'kneeling-lunge-stretch-right',
    'calf-stretch-left',
    'calf-stretch-right',
    'tricep-stretch-left',
    'tricep-stretch-right',
    'cat-cow-pose',
    'cobra-stretch',
    'child-pose',
    'spine-lumbar-twist-left',
    'spine-lumbar-twist-right'
  ],
  workSeconds: 30,
  restSeconds: 5,
  rounds: 1,
  isSystem: true,
  createdAt: '2026-06-25T00:00:00.000Z',
  updatedAt: '2026-06-25T00:00:00.000Z'
}

export const SYSTEM_ROUTINES: Routine[] = [CLASSIC_7, ABS_WORKOUT, BUTT_WORKOUT, LEG_WORKOUT, ARM_WORKOUT, STRETCH_WORKOUT]
