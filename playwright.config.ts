import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

// End-to-end persistence tests (test/e2e): the built app and its API run in
// `wrangler dev` against a real libSQL server, and the browser drives the UI.
// Sign-in uses seeded sessions (test/e2e/auth.ts), never real OAuth accounts.
//
// The database: set E2E_DB_URL to a running libSQL server (CI runs one as a
// service container), or let this config start `sqld` (SQLD_BIN, default
// `sqld` on PATH; install it with the Turso CLI) on a throwaway file.

const PORT = 8797
const DB_PORT = 8098
export const E2E_BASE_URL = `http://127.0.0.1:${PORT}`
const externalDb = process.env.E2E_DB_URL
const dbUrl = externalDb ?? `http://127.0.0.1:${DB_PORT}`
process.env.E2E_DB_URL = dbUrl

// The secret comes from this file only (wrangler.jsonc declares SESSION_SECRET,
// so wrangler loads just that from it), so a local .dev.vars never leaks in.
// Everything else is a plain var on the command line.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fitflow7-e2e-'))
const secretsFile = path.join(tmp, 'worker.env')
fs.writeFileSync(secretsFile, 'SESSION_SECRET=e2e-session-secret\n')
const vars = {
  TURSO_DATABASE_URL: dbUrl,
  APP_URL: E2E_BASE_URL,
  // Only so the Sign in button renders; the tests never complete real OAuth.
  GITHUB_CLIENT_ID: 'e2e',
  GITHUB_CLIENT_SECRET: 'e2e',
}
const varFlags = Object.entries(vars)
  .map(([k, v]) => `--var ${k}:${v}`)
  .join(' ')

const servers: NonNullable<Parameters<typeof defineConfig>[0]['webServer']> & unknown[] = []
if (!externalDb) {
  servers.push({
    command: `${process.env.SQLD_BIN ?? 'sqld'} --db-path ${path.join(tmp, 'db')} --http-listen-addr 127.0.0.1:${DB_PORT}`,
    url: `http://127.0.0.1:${DB_PORT}/health`,
    reuseExistingServer: false,
    timeout: 30_000,
  })
}
servers.push({
  command: `npx wrangler dev --port ${PORT} --ip 127.0.0.1 --env-file ${secretsFile} ${varFlags} --persist-to ${path.join(tmp, 'state')} --show-interactive-dev-session=false`,
  url: `${E2E_BASE_URL}/api/me`,
  reuseExistingServer: false,
  timeout: 120_000,
  env: { WRANGLER_SEND_METRICS: 'false' },
})

export default defineConfig({
  testDir: 'test/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
  webServer: servers,
})
