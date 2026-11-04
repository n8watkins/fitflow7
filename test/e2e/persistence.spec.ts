import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { accountRoutines, accountSessions, accountSettings, newUser, signIn, skipOnboarding } from './auth'

// Is what you do actually kept? These drive the real app and API end to end:
// signed in, signed out, across reloads, a second device, Sign out everywhere,
// offline, and the guest-to-account hand-over the UI promises.

// The header exists twice (desktop and phone layouts); use the one on screen.
test.beforeEach(async ({ context }) => {
  await skipOnboarding(context)
})

const chip = (page: Page) => page.getByTestId('save-status').locator('visible=true')

async function createRoutine(page: Page, name: string) {
  await page.goto('/routines/new/edit')
  await page.getByPlaceholder('Name your routine').fill(name)
  await page.getByRole('button', { name: 'Save Routine' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText(name).first()).toBeVisible()
}

/** Runs Classic 7 to the end on a fast-forwarded clock. */
async function finishWorkout(context: BrowserContext) {
  const page = await context.newPage()
  await page.clock.install()
  await page.goto('/workout/classic-7')
  await expect(page.getByText('Prepare', { exact: false }).first()).toBeVisible()
  await page.clock.runFor(10 * 60 * 1000)
  await expect(page.getByRole('heading', { name: 'Workout Complete!' })).toBeVisible()
  return page
}

async function chooseIllustrations(page: Page) {
  await page.goto('/settings')
  await page.getByRole('radio', { name: 'Illustrations' }).click()
  await expect(page.getByRole('radio', { name: 'Illustrations' })).toHaveAttribute('aria-checked', 'true')
}

async function signOutFromMenu(page: Page) {
  await page.getByRole('button', { name: /^Account:/ }).locator('visible=true').click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
}

test('signed in: a workout, a routine and a setting survive reload and signing out and in again @mobile', async ({ context, page }) => {
  const user = newUser('keep')
  await signIn(context, user)

  const done = await finishWorkout(context)
  await expect(done.getByTestId('save-status-line')).toHaveAttribute('data-kind', 'synced', { timeout: 15_000 })
  await expect(done.getByTestId('save-status-line')).toContainText('Saved to your account')
  await done.close()

  await createRoutine(page, 'Keep me routine')
  await chooseIllustrations(page)
  await expect(chip(page)).toHaveAttribute('data-kind', 'synced', { timeout: 15_000 })
  await expect(chip(page)).toHaveText('Saved')

  expect(await accountRoutines(user)).toEqual(['Keep me routine'])
  expect(await accountSessions(user)).toBe(1)
  expect((await accountSettings(user))?.exercise_images).toBe('illustrations')

  // Reload: everything is still there.
  await page.reload()
  await page.goto('/')
  await expect(page.getByText('Keep me routine').first()).toBeVisible()

  // Sign out: the app says the data stays on this device, and it does.
  await signOutFromMenu(page)
  await expect(page.getByTestId('account-notice')).toContainText('Signed out')
  await expect(chip(page)).toHaveAttribute('data-kind', 'local')
  await expect(chip(page)).toHaveText('On this device')
  await expect(page.getByText('Keep me routine').first()).toBeVisible()
  expect((await context.cookies()).some((c) => c.name === 'ff_session' && c.value)).toBe(false)

  // Sign in again: same data, synced.
  await signIn(context, user)
  await page.reload()
  await expect(chip(page)).toHaveAttribute('data-kind', 'synced', { timeout: 15_000 })
  await expect(page.getByText('Keep me routine').first()).toBeVisible()
  await page.goto('/history')
  await expect(page.getByText('Classic 7').first()).toBeVisible()
  await page.goto('/settings')
  await expect(page.getByRole('radio', { name: 'Illustrations' })).toHaveAttribute('aria-checked', 'true')
})

test('a second device signed in as the same user gets the same data', async ({ browser, context, page }) => {
  const user = newUser('two')
  await signIn(context, user)
  await finishWorkout(context).then((p) => p.close())
  await createRoutine(page, 'From device one')
  await chooseIllustrations(page)
  await expect(chip(page)).toHaveText('Saved', { timeout: 15_000 })

  const other = await browser.newContext()
  await skipOnboarding(other)
  await signIn(other, user)
  const second = await other.newPage()
  await second.goto('/')
  await expect(chip(second)).toHaveText('Saved', { timeout: 15_000 })
  await expect(second.getByText('From device one').first()).toBeVisible()
  await second.goto('/history')
  await expect(second.getByText('Classic 7').first()).toBeVisible()
  await second.goto('/settings')
  await expect(second.getByRole('radio', { name: 'Illustrations' })).toHaveAttribute('aria-checked', 'true')
  await other.close()
})

test('Sign out everywhere ends the other sessions, and their data stays on that device', async ({ browser, context, page }) => {
  const user = newUser('everywhere')
  await signIn(context, user)
  await createRoutine(page, 'Still here after')
  await expect(chip(page)).toHaveText('Saved', { timeout: 15_000 })

  const other = await browser.newContext()
  await skipOnboarding(other)
  await signIn(other, user)
  const second = await other.newPage()
  await second.goto('/settings')
  await second.getByRole('button', { name: 'Sign out everywhere' }).click()
  await expect(chip(second)).toHaveAttribute('data-kind', 'local')

  // The first device finds out on its next sync and says so.
  await page.goto('/')
  await expect(page.getByTestId('account-notice')).toContainText('You were signed out', { timeout: 15_000 })
  await expect(chip(page)).toHaveAttribute('data-kind', 'local')
  await expect(page.getByText('Still here after').first()).toBeVisible()
  const me = await page.evaluate(async () => (await fetch('/api/me', { credentials: 'include' })).json())
  expect(me.user).toBeNull()
  await other.close()
})

test('signed out: data is kept on this device, and signing in adds it to the account', async ({ context, page }) => {
  await page.goto('/')
  await expect(chip(page)).toHaveText('On this device')
  await expect(chip(page)).toHaveAttribute('title', /saved on this device only/)
  await createRoutine(page, 'Made as a guest')
  await page.reload()
  await expect(page.getByText('Made as a guest').first()).toBeVisible()

  await page.goto('/settings')
  await expect(page.getByText('When you sign in, everything saved on this device is added to your account')).toBeVisible()

  const user = newUser('guest')
  expect(await accountRoutines(user)).toEqual([])
  await signIn(context, user)
  await page.reload()
  await expect(chip(page)).toHaveText('Saved', { timeout: 15_000 })
  expect(await accountRoutines(user)).toEqual(['Made as a guest'])
})

test('signing out right after a change still saves it to the account', async ({ context, page }) => {
  const user = newUser('quick')
  await signIn(context, user)
  await page.goto('/')
  await expect(chip(page)).toHaveText('Saved', { timeout: 15_000 })
  await createRoutine(page, 'Saved then signed out')
  await signOutFromMenu(page)
  await expect(page.getByTestId('account-notice')).toContainText('Signed out')
  expect(await accountRoutines(user)).toEqual(['Saved then signed out'])
})

test('offline: changes wait on the device and sync when the connection is back', async ({ context, page }) => {
  const user = newUser('offline')
  await signIn(context, user)
  await page.goto('/settings')
  await expect(chip(page)).toHaveText('Saved', { timeout: 15_000 })

  await context.setOffline(true)
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  await page.getByRole('radio', { name: 'Illustrations' }).click()
  await expect(chip(page)).toHaveText('Offline, will sync', { timeout: 15_000 })
  expect((await accountSettings(user))?.exercise_images ?? null).toBeNull()

  await context.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(chip(page)).toHaveText('Saved', { timeout: 15_000 })
  expect((await accountSettings(user))?.exercise_images).toBe('illustrations')
})

test('a settings page opened before the first sync does not overwrite newer account settings', async ({ browser, context, page }) => {
  const user = newUser('stale')
  await signIn(context, user)
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Increase Rounds' }).click()
  await page.getByRole('button', { name: 'Increase Rounds' }).click()
  await expect(chip(page)).toHaveText('Saved', { timeout: 15_000 })
  expect((await accountSettings(user))?.default_rounds).toBe(3)

  // A second device opens Settings while its first sync is still slow.
  const other = await browser.newContext()
  await skipOnboarding(other)
  await signIn(other, user)
  const second = await other.newPage()
  await second.route('**/api/sync', async (route) => {
    await new Promise((r) => setTimeout(r, 2500))
    await route.continue()
  })
  await second.goto('/settings')
  await expect(chip(second)).toHaveText('Saved', { timeout: 15_000 })
  await second.unroute('**/api/sync')
  await second.getByRole('button', { name: 'Increase Work duration' }).click()
  await expect(chip(second)).toHaveText('Saved', { timeout: 15_000 })

  const row = await accountSettings(user)
  expect(row?.default_rounds).toBe(3)
  expect(row?.default_work_seconds).toBe(35)
  await other.close()
})
