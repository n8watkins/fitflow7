import { defineConfig } from 'vitest/config'

// Tests live in top-level test/ (outside src) so the production `tsc -b` and
// `vite build` never see them. A node env plus an in-memory localStorage stub
// (test/setup.ts) avoids pulling in jsdom — even the page render smokes (B4) use
// react-dom/server renderToString rather than a DOM, since pages read storage at
// render time.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
  },
})
