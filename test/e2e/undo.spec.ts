import { expect, test, type Page } from '@playwright/test'
import { skipOnboarding } from './auth'

// Deletes happen at once with an Undo toast instead of a confirm() prompt.

test.beforeEach(async ({ context }) => {
  await skipOnboarding(context)
})

async function makeRoutine(page: Page, name: string) {
  await page.goto('/routines/new/edit')
  await page.getByPlaceholder('Name your routine').fill(name)
  await page.getByRole('button', { name: 'Save Routine' }).click()
  await expect(page).toHaveURL(/\/$/)
}

async function deleteRoutine(page: Page, name: string) {
  await page.goto('/workouts')
  await page.getByRole('listitem').filter({ hasText: name }).getByRole('link', { name: 'Edit' }).click()
  await page.getByRole('button', { name: 'Delete Routine' }).click()
  await expect(page).toHaveURL(/\/workouts$/)
}

test('deleting a routine shows Undo, and Undo brings it back exactly @mobile', async ({ page }) => {
  await page.goto('/')
  await makeRoutine(page, 'Undo me')
  await deleteRoutine(page, 'Undo me')
  const toast = page.getByTestId('toast')
  await expect(toast).toContainText('“Undo me” deleted')
  await expect(page.getByText('Undo me', { exact: true })).toHaveCount(0)
  await toast.getByRole('button', { name: 'Undo' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Undo me', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Undo me', { exact: true })).toBeVisible()
})

test('a delete that is not undone stays deleted after the toast and a reload', async ({ page }) => {
  await page.clock.install()
  await page.goto('/')
  await makeRoutine(page, 'Gone for good')
  await deleteRoutine(page, 'Gone for good')
  await expect(page.getByTestId('toast')).toBeVisible()
  await page.clock.runFor(7000)
  await expect(page.getByTestId('toast')).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('Gone for good', { exact: true })).toHaveCount(0)
})
