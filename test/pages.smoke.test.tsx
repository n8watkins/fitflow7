import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import Dashboard from '../src/pages/Dashboard'
import Stats from '../src/pages/Stats'
import Calendar from '../src/pages/Calendar'
import Challenges from '../src/pages/Challenges'
import { saveBodyProfile, saveTrainingProfile, saveWeightEntry } from '../src/lib/storage'

// B4: render smokes for the Session-6 pages. These read storage at render time
// (via useMemo), so a server render is enough to catch a crash or a missing key
// string — no jsdom needed. localStorage is the in-memory stub from setup.ts,
// cleared before each test.
function render(ui: React.ReactElement): string {
  return renderToString(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('Dashboard render smoke', () => {
  it('asks the two onboarding questions on a first visit', () => {
    const html = render(<Dashboard />)
    expect(html).toContain('What do you want from seven minutes a day?')
    expect(html).toContain('Recent workouts')
  })

  it('leads with today’s workout once onboarding was skipped, with no extra welcome card', () => {
    saveTrainingProfile({ onboardingDone: true })
    const html = render(<Dashboard />)
    expect(html).toContain('Today&#x27;s workout')
    expect(html).not.toContain('Welcome to FitFlow 7')
  })

  it('shows the plan card while the plan runs', () => {
    saveTrainingProfile({ onboardingDone: true, level: 'beginner', goal: 'habit', planStartedAt: new Date().toISOString() })
    const html = render(<Dashboard />).replace(/<!-- -->/g, '')
    expect(html).toContain('Week 1 of 4')
    expect(html).toContain('Classic 7, easier moves')
  })

  it('shows recent workouts beside today’s workout once there is data', () => {
    saveWeightEntry('2026-06-26', 77)
    const html = render(<Dashboard />)
    expect(html).not.toContain('Welcome to FitFlow 7')
    expect(html).toContain('Recent workouts')
  })
})

describe('Stats render smoke', () => {
  it('prompts first-run setup with empty storage', () => {
    const html = render(<Stats />)
    expect(html).toContain('Set up your stats.')
    expect(html).toContain('Body Mass Index')
  })

  it('shows trend deltas + goal progress when seeded', () => {
    saveBodyProfile({ heightCm: 180, goalWeightKg: 75 })
    saveWeightEntry('2026-05-01', 80)
    saveWeightEntry('2026-06-26', 77)
    const html = render(<Stats />)
    expect(html).toContain('30-day')
    expect(html).toContain('to goal')
    expect(html).toContain('Body Mass Index')
  })
})

describe('Calendar render smoke', () => {
  it('renders empty storage without throwing', () => {
    const html = render(<Calendar />)
    expect(html).toContain('Calendar')
    expect(html).toContain('Last 12 months')
  })
})

describe('Challenges render smoke', () => {
  it('renders the challenge list without throwing', () => {
    const html = render(<Challenges />)
    expect(html).toContain('Challenges')
  })
})
