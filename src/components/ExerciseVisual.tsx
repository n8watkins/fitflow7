import { useEffect, useState } from 'react'
import type { Exercise } from '../types'

// Renders an exercise's bundled photo when present, falling back to its emoji
// (and also if the image fails to load). Two-frame movement animation plays only
// when hovered (desktop) or when a parent opts in via `autoPlay` (e.g. the
// in-workout Player and the expanded modal) — so browse lists stay calm/static.
export default function ExerciseVisual({
  exercise,
  imgClassName = '',
  emojiClassName = '',
  autoPlay = false,
}: {
  exercise: Exercise
  imgClassName?: string
  emojiClassName?: string
  /** Animate without needing hover (workout Player, expanded modal). */
  autoPlay?: boolean
}) {
  const [failed, setFailed] = useState(false)
  const [frame, setFrame] = useState(0)
  const [hovered, setHovered] = useState(false)
  // Honor prefers-reduced-motion: never animate the two-frame swap.
  const [reduceMotion] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  )
  const canAnimate = Boolean(exercise.imageUrl && exercise.imageUrl2 && !failed)
  const animating = canAnimate && (autoPlay || hovered) && !reduceMotion

  // Preload the second frame so the first swap is instant.
  useEffect(() => {
    if (exercise.imageUrl2) {
      const img = new Image()
      img.src = exercise.imageUrl2
    }
  }, [exercise.imageUrl2])

  // Only run the interval while animating. When not animating we just render the
  // still first frame (derived below) — no state reset needed.
  useEffect(() => {
    if (!animating) return
    const id = setInterval(() => setFrame((f) => (f === 0 ? 1 : 0)), 700)
    return () => clearInterval(id)
  }, [animating])

  if (exercise.imageUrl && !failed) {
    const showFrame = animating ? frame : 0
    const src = showFrame === 1 && exercise.imageUrl2 ? exercise.imageUrl2 : exercise.imageUrl
    return (
      <img
        src={src}
        alt={exercise.name}
        loading="lazy"
        onError={() => setFailed(true)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={imgClassName}
      />
    )
  }
  return <span className={emojiClassName}>{exercise.icon}</span>
}
