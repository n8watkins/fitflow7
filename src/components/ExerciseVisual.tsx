import { useEffect, useState } from 'react'
import type { Exercise } from '../types'
import { useSettings } from '../hooks/useSettings'
import ExerciseFigure from './ExerciseFigure'

// Shows an exercise as its bundled two-frame photo or as a drawn figure. The
// "Exercise images" setting picks: Photos uses the photo where a move has one
// and the figure elsewhere (or if the photo fails to load); Illustrations uses
// figures for every move. Movement plays only when hovered (desktop) or when a
// parent opts in via `autoPlay` (the in-workout Player and the expanded modal),
// so browse lists stay calm, and never with reduced motion.
export default function ExerciseVisual({
  exercise,
  imgClassName = '',
  autoPlay = false,
}: {
  exercise: Exercise
  /** Size and shape of the visual; used for the photo and the figure alike. */
  imgClassName?: string
  /** Animate without needing hover (workout Player, expanded modal). */
  autoPlay?: boolean
}) {
  const { exerciseImages } = useSettings()
  const [failed, setFailed] = useState(false)
  const [frame, setFrame] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [reduceMotion] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  )
  const photo = exerciseImages === 'photos' && exercise.imageUrl && !failed ? exercise.imageUrl : undefined
  const moving = (autoPlay || hovered) && !reduceMotion
  const animatingPhoto = Boolean(photo && exercise.imageUrl2 && moving)

  // Preload the second frame so the first swap is instant.
  useEffect(() => {
    if (!photo || !exercise.imageUrl2) return
    const img = new Image()
    img.src = exercise.imageUrl2
  }, [photo, exercise.imageUrl2])

  useEffect(() => {
    if (!animatingPhoto) return
    const id = setInterval(() => setFrame((f) => (f === 0 ? 1 : 0)), 700)
    return () => clearInterval(id)
  }, [animatingPhoto])

  const hover = { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) }

  if (photo) {
    const src = animatingPhoto && frame === 1 && exercise.imageUrl2 ? exercise.imageUrl2 : photo
    return <img src={src} alt={exercise.name} loading="lazy" onError={() => setFailed(true)} {...hover} className={imgClassName} />
  }
  return (
    <span {...hover} className={`inline-flex shrink-0 items-center justify-center bg-surface ${imgClassName}`}>
      <ExerciseFigure exerciseId={exercise.id} name={exercise.name} animate={moving} className="h-full w-full" />
    </span>
  )
}
