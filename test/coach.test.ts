import { describe, it, expect } from 'vitest'
import { coachLine, pickVoice, type CoachMoment } from '../src/lib/coach'

const jacks = { name: 'Jumping Jacks', cue: 'Jump feet wide, arms overhead, repeat' }
const wallSit = { name: 'Wall Sit', cue: 'Hold a 90° seat against the wall' }

function at(over: Partial<CoachMoment>): CoachMoment {
  return { phase: 'work', secondsLeft: 30, phaseSeconds: 30, exercise: jacks, nextExercise: wallSit, isLast: false, ...over }
}

describe('voice coach lines', () => {
  it('announces the first move when the countdown starts', () => {
    expect(coachLine(at({ phase: 'prepare', secondsLeft: 10, phaseSeconds: 10 }), 'energetic')).toBe('Get ready. First up: Jumping Jacks.')
  })

  it('names the move when work starts, in the chosen tone', () => {
    expect(coachLine(at({}), 'energetic')).toBe('Jumping Jacks. Go!')
    expect(coachLine(at({}), 'calm')).toBe('Jumping Jacks. Begin.')
  })

  it('calls halfway and ten seconds left in a 30-second move', () => {
    expect(coachLine(at({ secondsLeft: 15 }), 'energetic')).toBe('Halfway. Keep it up!')
    expect(coachLine(at({ secondsLeft: 10 }), 'calm')).toBe('Ten seconds.')
    expect(coachLine(at({ secondsLeft: 14 }), 'calm')).toBeNull()
  })

  it('says only "ten seconds" when halfway is also ten seconds, and nothing extra on short moves', () => {
    expect(coachLine(at({ secondsLeft: 10, phaseSeconds: 20 }), 'calm')).toBe('Ten seconds.')
    expect(coachLine(at({ secondsLeft: 6, phaseSeconds: 12 }), 'calm')).toBeNull()
  })

  it('names the next move and its cue when rest starts', () => {
    expect(coachLine(at({ phase: 'rest', secondsLeft: 10, phaseSeconds: 10 }), 'calm')).toBe('Rest. Next up: Wall Sit. Hold a 90° seat against the wall.')
  })

  it('says the workout is done', () => {
    expect(coachLine(at({ phase: 'complete', secondsLeft: 0 }), 'energetic')).toBe('Workout complete. Great job!')
    expect(coachLine(at({ phase: 'complete', secondsLeft: 0 }), 'calm')).toBe('Workout complete. Well done.')
  })

  it('stays quiet when off', () => {
    expect(coachLine(at({}), 'off')).toBeNull()
  })
})

describe('voice choice', () => {
  const v = (name: string, lang: string, localService = true, isDefault = false) => ({ name, lang, localService, default: isDefault }) as SpeechSynthesisVoice
  it('prefers an on-device English voice so it works offline', () => {
    const voices = [v('Google UK English Female', 'en-GB', false), v('Samantha', 'en-US', true), v('Thomas', 'fr-FR', true, true)]
    expect(pickVoice(voices, 'en-US')?.name).toBe('Samantha')
  })
  it('falls back to any English voice, then nothing', () => {
    expect(pickVoice([v('Google US English', 'en-US', false)], 'en-US')?.name).toBe('Google US English')
    expect(pickVoice([v('Thomas', 'fr-FR')], 'en-US')).toBeUndefined()
  })
})
