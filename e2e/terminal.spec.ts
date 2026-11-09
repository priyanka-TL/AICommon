import { expect, test, type Page } from '@playwright/test'

const consoleErrors: string[] = []

test.beforeEach(async ({ page }) => {
  consoleErrors.length = 0
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => consoleErrors.push(err.message))
})

test.afterEach(async () => {
  expect(consoleErrors, 'console errors').toEqual([])
})

async function signIn(page: Page, who: string) {
  await page.goto('/login')
  await page.evaluate(() => {
    sessionStorage.removeItem('aic-session')
    localStorage.clear()
  })
  await page.goto('/login')
  await page.getByRole('button', { name: new RegExp(`^${who.replace(/[·]/g, '.')}`) }).click()
  await expect(page.getByRole('button', { name: 'Open user menu' })).toBeVisible()
}

const screen = (page: Page) => page.locator('.xterm-rows')

async function openTerminal(page: Page, envId: string) {
  await page.goto(`/environments/${envId}/terminal`)
  await expect(page.getByText('Connected', { exact: true })).toBeVisible()
  await expect(screen(page)).toContainText('Type help')
  await page.locator('.xterm').click()
}

/** Clears the screen first so the output fits the visible rows. */
async function run(page: Page, cmd: string) {
  await page.keyboard.type('clear')
  await page.keyboard.press('Enter')
  await page.keyboard.type(cmd)
  await page.keyboard.press('Enter')
}

test('nvidia-smi works on a GPU environment and systemctl shows deployed services', async ({ page }) => {
  await signIn(page, 'ShikshaLokam · User')
  await openTerminal(page, 'env-sl-tutor')
  await expect(screen(page)).toContainText('arjun@kannada-reading-tutor:~$')

  await run(page, 'nvidia-smi')
  await expect(screen(page)).toContainText('NVIDIA A10')
  await expect(screen(page)).toContainText('CUDA Version')

  await run(page, 'systemctl status reading-tutor-api')
  await expect(screen(page)).toContainText('reading-tutor-api.service - AI Education Assistant')
  await expect(screen(page)).toContainText('active (running)')

  await run(page, 'systemctl')
  await expect(screen(page)).toContainText('reading-tutor-api.service')

  await run(page, 'pm2 list')
  await expect(screen(page)).toContainText('speech-scoring-api')
  await expect(screen(page)).toContainText('errored')

  await run(page, 'cat /srv/reading-tutor-api/.env')
  await expect(screen(page)).toContainText('NODE_ENV=••••••••')

  await run(page, 'curl localhost:3000/health')
  await expect(screen(page)).toContainText('"status":"ok"')

  await run(page, 'rm -rf /')
  await expect(screen(page)).toContainText('won’t run it')

  await run(page, 'frobnicate')
  await expect(screen(page)).toContainText('command not supported in simulated terminal — type help')

  // Tab completion and history
  await run(page, '')
  await page.keyboard.type('cd /sr')
  await page.keyboard.press('Tab')
  await page.keyboard.type('read')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await expect(screen(page)).toContainText('arjun@kannada-reading-tutor:/srv/reading-tutor-api$')
  await page.keyboard.press('ArrowUp')
  await expect(screen(page)).toContainText('$ cd /srv/reading-tutor-api/')

  await page.getByRole('button', { name: 'Close session' }).click()
  await expect(page).toHaveURL(/\/app\/environments\/env-sl-tutor$/)
})

test('nvidia-smi is refused on a CPU environment', async ({ page }) => {
  await signIn(page, 'Mantra4Change · Tenant Admin')
  await page.goto('/tenant-admin/infrastructure/env-m4c-docparse')
  await expect(page.getByRole('button', { name: /Open in terminal/ })).toBeDisabled()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Open in terminal$/ })).toBeEnabled()
  await openTerminal(page, 'env-m4c-docparse')
  await run(page, 'nvidia-smi')
  await expect(screen(page)).toContainText('nvidia-smi: command not found')
  await expect(screen(page)).toContainText('no GPU')
})

test('terminal is unavailable for Stopped environments', async ({ page }) => {
  await signIn(page, 'ShikshaLokam · Tenant Admin')
  await page.goto('/tenant-admin/infrastructure/env-sl-lessonplan')
  await expect(page.getByRole('button', { name: /Open in terminal/ })).toBeDisabled()
  await page.goto('/environments/env-sl-lessonplan/terminal')
  await expect(page.getByText('Terminal not available')).toBeVisible()
  await expect(page.getByText('The environment is stopped. Start it to open a terminal.')).toBeVisible()
})

test('QA gets a read-only terminal and sessions are audited', async ({ page }) => {
  await signIn(page, 'ShikshaLokam · QA Engineer')
  await page.goto('/qa/environments/env-sl-tutor')
  await page.getByRole('button', { name: 'Open in terminal (read-only)' }).click()
  await expect(page.getByText('Read-only', { exact: true })).toBeVisible()
  await expect(page.getByText('Connected', { exact: true })).toBeVisible()
  await page.locator('.xterm').click()

  await run(page, 'systemctl restart reading-tutor-api')
  await expect(screen(page)).toContainText('QA access is read-only')
  await run(page, 'git pull')
  await expect(screen(page)).toContainText('QA access is read-only')
  await run(page, 'systemctl status reading-tutor-api')
  await expect(screen(page)).toContainText('active (running)')

  await run(page, 'exit')
  await expect(page.getByText('Disconnected', { exact: true })).toBeVisible()

  // The Tenant Admin sees the open and close entries, with no command text.
  await page.evaluate(() => sessionStorage.setItem('aic-session', JSON.stringify({ state: { currentUserId: 'u-sl-ta', tenantFilter: 'all', qaTenantWide: false }, version: 0 })))
  await page.goto('/tenant-admin/audit')
  await expect(page.getByRole("table").getByText(/Lakshmi Iyer opened a terminal session on “Kannada reading tutor” \(read-only\)/)).toBeVisible()
  await expect(page.getByRole("table").getByText(/Lakshmi Iyer closed a terminal session on “Kannada reading tutor” after \d+ s/)).toBeVisible()
  await expect(page.getByText('systemctl restart')).toHaveCount(0)
})
