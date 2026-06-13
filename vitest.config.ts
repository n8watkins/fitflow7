import { defineConfig } from 'vitest/config'

// Tests live in top-level test/ (outside src) so the production `tsc -b` and
// `vite build` never see them. Pure logic only — a node env plus an in-memory
// localStorage stub (test/setup.ts) avoids pulling in jsdom.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
  },
})
