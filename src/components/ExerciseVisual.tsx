import { useState } from 'react'
import type { Exercise } from '../types'

// Renders an exercise's bundled photo when present, falling back to its emoji
// (and also falling back if the image fails to load).
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
  if (exercise.imageUrl && !failed) {
    return (
      <img
        src={exercise.imageUrl}
        alt={exercise.name}
        loading="lazy"
        onError={() => setFailed(true)}
        className={imgClassName}
      />
    )
  }
  return <span className={emojiClassName}>{exercise.icon}</span>
}
