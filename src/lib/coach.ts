// Voice coach: what to say at each moment of a workout, and the speaking itself
// through the browser's speech synthesis (no audio files, no network: on-device
// voices work offline). Lines are short so they finish inside a 10-second rest.

import type { WorkoutPhase } from '../types'

export type CoachTone = 'off' | 'energetic' | 'calm'

export interface CoachMoment {
  phase: WorkoutPhase
  secondsLeft: number
  /** Length of the current phase in seconds. */
  phaseSeconds: number
  exercise: { name: string; cue?: string } | null
  nextExercise: { name: string; cue?: string } | null
  isLast: boolean
}

function withPeriod(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`
}

/** The line for this moment, or null when the coach stays quiet. Called on
 *  every tick; only the first second of a phase, halfway, ten seconds left and
 *  completion produce a line. */
export function coachLine(m: CoachMoment, tone: CoachTone): string | null {
  if (tone === 'off') return null
  const energetic = tone === 'energetic'
  const atStart = m.secondsLeft === m.phaseSeconds

  switch (m.phase) {
    case 'prepare':
      return atStart && m.exercise ? `Get ready. First up: ${m.exercise.name}.` : null
    case 'work': {
      if (atStart && m.exercise) return `${m.exercise.name}. ${energetic ? 'Go!' : 'Begin.'}`
      const half = Math.floor(m.phaseSeconds / 2)
      if (m.phaseSeconds >= 15 && m.secondsLeft === 10) return energetic ? 'Ten seconds. Push!' : 'Ten seconds.'
      if (m.phaseSeconds >= 20 && m.secondsLeft === half && half !== 10) return energetic ? 'Halfway. Keep it up!' : 'Halfway.'
      return null
    }
    case 'rest':
      if (!atStart) return null
      if (!m.nextExercise) return 'Rest.'
      return `Rest. Next up: ${m.nextExercise.name}.${m.nextExercise.cue ? ` ${withPeriod(m.nextExercise.cue)}` : ''}`
    case 'complete':
      return energetic ? 'Workout complete. Great job!' : 'Workout complete. Well done.'
    default:
      return null
  }
}

/** The best voice for `lang`: an on-device voice first (works offline), then
 *  any voice in the same language, then any English voice. */
export function pickVoice(voices: SpeechSynthesisVoice[], lang = 'en-US'): SpeechSynthesisVoice | undefined {
  const base = lang.split('-')[0]
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith(base))
  return (
    english.find((v) => v.localService && v.lang === lang) ??
    english.find((v) => v.localService) ??
    english.find((v) => v.lang === lang) ??
    english[0]
  )
}

const TONE_VOICE: Record<Exclude<CoachTone, 'off'>, { rate: number; pitch: number }> = {
  energetic: { rate: 1.08, pitch: 1.1 },
  calm: { rate: 0.95, pitch: 0.95 },
}

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null
}

export function speechAvailable(): boolean {
  return synth() !== null
}

/** Says `text` now, cutting off anything still being said. */
export function speak(text: string, tone: Exclude<CoachTone, 'off'>): void {
  const s = synth()
  if (!s) return
  s.cancel()
  const u = new SpeechSynthesisUtterance(text)
  const lang = typeof navigator !== 'undefined' && navigator.language?.startsWith('en') ? navigator.language : 'en-US'
  const voice = pickVoice(s.getVoices(), lang)
  if (voice) u.voice = voice
  u.lang = voice?.lang ?? lang
  u.rate = TONE_VOICE[tone].rate
  u.pitch = TONE_VOICE[tone].pitch
  s.speak(u)
}

export function stopSpeaking(): void {
  synth()?.cancel()
}

/** Safari and iOS only speak after speech was started inside a user gesture.
 *  Speaking an empty line on the first tap or key press unlocks it, so later
 *  timer-driven lines are heard. Call once at startup. */
export function unlockSpeechOnFirstGesture(): void {
  const s = synth()
  if (!s || typeof window === 'undefined') return
  const unlock = () => {
    const u = new SpeechSynthesisUtterance('')
    u.volume = 0
    s.speak(u)
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('pointerdown', unlock, { once: true })
  window.addEventListener('keydown', unlock, { once: true })
  // Chrome loads its voice list asynchronously; ask early so the first line
  // already has one.
  s.getVoices()
}
