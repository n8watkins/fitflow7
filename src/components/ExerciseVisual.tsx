import { useEffect, useState } from 'react'
import type { Exercise } from '../types'

// Renders an exercise's bundled photo when present, falling back to its emoji
// (and also if the image fails to load). When a second frame (end position)
// exists, the two alternate to form a simple movement animation.
export default function ExerciseVisual({
  exercise,
  imgClassName = '',
  emojiClassName = '',
}: {
  exercise: Exercise
  imgClassName?: string
  emojiClassName?: string
}) {
  const [failed, setFailed] = useState(false)
  const [frame, setFrame] = useState(0)
  const animate = Boolean(exercise.imageUrl && exercise.imageUrl2 && !failed)

  // Preload the second frame so the swap is instant.
  useEffect(() => {
    if (exercise.imageUrl2) {
      const img = new Image()
      img.src = exercise.imageUrl2
    }
  }, [exercise.imageUrl2])

  useEffect(() => {
    if (!animate) return
    const id = setInterval(() => setFrame((f) => (f === 0 ? 1 : 0)), 1000)
    return () => clearInterval(id)
  }, [animate])

  if (exercise.imageUrl && !failed) {
    const src = frame === 1 && exercise.imageUrl2 ? exercise.imageUrl2 : exercise.imageUrl
    return (
      <img
        src={src}
        alt={exercise.name}
        loading="lazy"
        onError={() => setFailed(true)}
        className={imgClassName}
      />
    )
  }
  return <span className={emojiClassName}>{exercise.icon}</span>
}
