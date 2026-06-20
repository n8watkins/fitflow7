import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import Community from '../src/pages/Community'

// Server-render smoke test (effects don't run, so the network call is skipped):
// guards the community page against a render-time crash / white screen.
describe('Community page render', () => {
  it('renders without throwing', () => {
    const html = renderToString(createElement(MemoryRouter, null, createElement(Community)))
    expect(html).toContain('Community')
  })
})
