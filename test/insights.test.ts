import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import Insights from '../src/pages/Insights'
import type { WorkoutSession } from '../src/types'

// Server-render smoke test (no jsdom needed): the Insights page is chart-heavy,
// so this guards against a render-time crash / white screen.
function render() {
  return renderToString(createElement(MemoryRouter, null, createElement(Insights)))
}

describe('Insights page render', () => {
  it('renders the empty state with no history', () => {
    const html = render()
    expect(html).toContain('Insights')
    expect(html).toContain('No insights yet')
  })

  it('renders charts when there is history', () => {
    const session: WorkoutSession = {
      id: 'smoke',
      routineName: 'Smoke Test',
      startedAt: new Date().toISOString(),
      durationSeconds: 420,
      completed: true,
      exercisesCompleted: 12,
      totalExercises: 12,
    }
    localStorage.setItem('fitflow.sessions', JSON.stringify([session]))
    const html = render()
    expect(html).toContain('Weekly activity')
    expect(html).toContain('Activity calendar')
    expect(html).toContain('Smoke Test') // top-routines list
  })
})
