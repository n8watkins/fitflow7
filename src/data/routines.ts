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

export const SYSTEM_ROUTINES: Routine[] = [CLASSIC_7]
