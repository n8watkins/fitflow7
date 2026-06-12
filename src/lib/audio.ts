/**
 * WebAudio cue beeps for FitFlow 7.
 * No asset files — all sounds are generated via OscillatorNode.
 * AudioContext is lazily created and resumed on first call (must be user-gesture-initiated or after one).
 */

let ctx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext()
  }
  return ctx
}

// Finding 19: close the AudioContext on page unload to avoid hitting the browser limit
window.addEventListener('beforeunload', () => {
  ctx?.close().catch(() => {})
})

async function ensureResumed(): Promise<AudioContext> {
  const ac = getCtx()
  if (ac.state === 'suspended') {
    await ac.resume()
  }
  return ac
}

/**
 * Play a single oscillator tone with a gain envelope to avoid clicks.
 */
function playTone(
  ac: AudioContext,
  frequency: number,
  type: OscillatorType,
  startTime: number,
  duration: number,
  peakGain = 0.25,
): void {
  const osc = ac.createOscillator()
  const gain = ac.createGain()

  osc.type = type
  osc.frequency.setValueAtTime(frequency, startTime)

  // Attack / sustain / release envelope
  const attack = 0.01
  const release = 0.04
  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(peakGain, startTime + attack)
  gain.gain.setValueAtTime(peakGain, startTime + duration - release)
  gain.gain.linearRampToValueAtTime(0, startTime + duration)

  osc.connect(gain)
  gain.connect(ac.destination)

  osc.start(startTime)
  osc.stop(startTime + duration + 0.01)
}

// ---------------------------------------------------------------------------
// Public cue functions
// ---------------------------------------------------------------------------

/**
 * cueStart — fired when the workout session begins (prepare phase).
 * Two ascending sine tones: warm-up, hopeful.
 */
export async function cueStart(): Promise<void> {
  try {
    const ac = await ensureResumed()
    const now = ac.currentTime
    playTone(ac, 440, 'sine', now, 0.15, 0.2)
    playTone(ac, 554, 'sine', now + 0.18, 0.15, 0.2)
  } catch {
    // Silently ignore — audio is non-critical
  }
}

/**
 * cueWorkStart — fired at the start of each work phase.
 * Rising two-tone burst, energetic and bright.
 */
export async function cueWorkStart(): Promise<void> {
  try {
    const ac = await ensureResumed()
    const now = ac.currentTime
    playTone(ac, 523, 'triangle', now, 0.12, 0.22)
    playTone(ac, 659, 'triangle', now + 0.13, 0.15, 0.22)
  } catch {
    // ignore
  }
}

/**
 * cueRestStart — fired at the start of each rest phase.
 * Descending soft tones, relaxing.
 */
export async function cueRestStart(): Promise<void> {
  try {
    const ac = await ensureResumed()
    const now = ac.currentTime
    playTone(ac, 392, 'sine', now, 0.18, 0.15)
    playTone(ac, 330, 'sine', now + 0.2, 0.18, 0.12)
  } catch {
    // ignore
  }
}

/**
 * cueCountdownTick — fired for last 3 seconds of a phase.
 * Short crisp tick.
 */
export async function cueCountdownTick(): Promise<void> {
  try {
    const ac = await ensureResumed()
    const now = ac.currentTime
    playTone(ac, 880, 'sine', now, 0.08, 0.15)
  } catch {
    // ignore
  }
}

/**
 * cueComplete — fired when the workout finishes.
 * Three-note victory arpeggio.
 */
export async function cueComplete(): Promise<void> {
  try {
    const ac = await ensureResumed()
    const now = ac.currentTime
    playTone(ac, 523, 'sine', now, 0.15, 0.3)
    playTone(ac, 659, 'sine', now + 0.17, 0.15, 0.3)
    playTone(ac, 784, 'sine', now + 0.34, 0.25, 0.3)
  } catch {
    // ignore
  }
}
