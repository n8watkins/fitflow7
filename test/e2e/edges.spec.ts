import { expect, test } from '@playwright/test'

// Unknown addresses are real 404s with the app's own page, and a page that
// fails to load shows an error page with Retry instead of a blank screen.

test('an unknown path answers 404 with the styled not-found page @mobile', async ({ page }) => {
  const res = await page.goto('/no-such-page')
  expect(res?.status()).toBe(404)
  await expect(page.getByTestId('not-found')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  await page.getByRole('link', { name: 'Home' }).click()
  await expect(page).toHaveURL(/\/$/)
})

test('app pages answer 200', async ({ request }) => {
  for (const path of ['/', '/settings', '/workout/classic-7', '/routines/new/edit']) {
    expect((await request.get(path)).status(), path).toBe(200)
  }
})

test.describe('without the service worker', () => {
  // The service worker would answer from its cache, past the blocked request.
  test.use({ serviceWorkers: 'block' })

test('a page that fails to download shows Retry, and Retry recovers @mobile', async ({ page }) => {
  await page.goto('/')
  await page.route(/\/assets\/Settings-[^/]+\.js$/, (route) => route.abort())
  await page.getByRole('link', { name: 'Settings', exact: true }).locator('visible=true').or(page.getByRole('button', { name: 'More' })).first().click()
  if (await page.getByRole('button', { name: 'More', expanded: true }).count()) {
    await page.getByRole('link', { name: 'Settings', exact: true }).locator('visible=true').click()
  }
  await expect(page.getByTestId('error-page')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'This page didn’t load' })).toBeVisible()
  await page.unroute(/\/assets\/Settings-[^/]+\.js$/)
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
})
})

test('no Content Security Policy errors on load', async ({ page }) => {
  const violations: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' && /Content Security Policy|CSP/i.test(m.text())) violations.push(m.text())
  })
  await page.goto('/')
  await page.goto('/settings')
  await page.waitForLoadState('networkidle')
  expect(violations).toEqual([])
})
