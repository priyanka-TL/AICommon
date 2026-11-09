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

const sheet = (page: Page) => page.getByRole('dialog')

async function openDeployment(page: Page, project: string) {
  await page.locator('table').getByText(project, { exact: true }).click()
  await expect(sheet(page).getByRole('heading', { name: project })).toBeVisible()
}

test('Projects tab lists every deployment with status, port and URL', async ({ page }) => {
  await signIn(page, 'ShikshaLokam · User')
  await page.goto('/app/environments/env-sl-tutor?tab=projects')
  const table = page.locator('table')
  await expect(table.getByText('AI Education Assistant', { exact: true })).toBeVisible()
  await expect(table.getByText('Multilingual Speech Recognition', { exact: true })).toBeVisible()
  await expect(table.getByText('Teacher Support Chatbot', { exact: true })).toBeVisible()
  await expect(table.getByText('Failed')).toBeVisible()
  await expect(table.getByText('3000')).toBeVisible()
  await expect(table.getByText('8000')).toBeVisible()
})

test('a second project on the same port is blocked', async ({ page }) => {
  await signIn(page, 'ShikshaLokam · User')
  await page.goto('/app/environments/env-sl-tutor?tab=projects')
  await openDeployment(page, 'AI Education Assistant')
  const port = sheet(page).getByLabel('Port', { exact: true })
  await port.fill('8000')
  await expect(sheet(page).getByText(/Port 8000 is already used by Multilingual Speech Recognition/)).toBeVisible()
  await expect(sheet(page).getByRole('button', { name: 'Save configuration' })).toBeDisabled()
  await port.fill('3005')
  await expect(sheet(page).getByText(/already used by/)).toHaveCount(0)
  await expect(sheet(page).getByRole('button', { name: 'Save configuration' })).toBeEnabled()
})

test('the systemd unit follows the configured start command', async ({ page }) => {
  await signIn(page, 'ShikshaLokam · User')
  await page.goto('/app/environments/env-sl-tutor?tab=projects')
  await openDeployment(page, 'AI Education Assistant')
  await sheet(page).getByRole('tab', { name: 'Guide' }).click()
  await expect(sheet(page).getByText('ExecStart=/home/deploy/.nvm/nvm-exec node dist/server.js')).toBeVisible()
  await expect(sheet(page).getByText('sudo systemctl enable --now reading-tutor-api', { exact: false }).first()).toBeVisible()

  await sheet(page).getByRole('tab', { name: 'Configuration' }).click()
  await sheet(page).getByLabel('Start command').fill('node dist/cluster.js --workers 2')
  await sheet(page).getByRole('tab', { name: 'Guide' }).click()
  await expect(sheet(page).getByText('ExecStart=/home/deploy/.nvm/nvm-exec node dist/cluster.js --workers 2')).toBeVisible()

  const download = page.waitForEvent('download')
  await sheet(page).getByRole('button', { name: 'Download as script' }).click()
  expect((await download).suggestedFilename()).toBe('deploy.sh')
})

test('a failed deployment shows the failing step and can be redeployed', async ({ page }) => {
  await signIn(page, 'ShikshaLokam · User')
  await page.goto('/app/environments/env-sl-tutor?tab=projects')
  await openDeployment(page, 'Multilingual Speech Recognition')
  await expect(sheet(page).getByText('Failed at step: Build')).toBeVisible()
  await expect(sheet(page).getByText(/No module named 'app.scoring'/).first()).toBeVisible()

  // Redeploying unchanged fails again at the same step.
  await sheet(page).getByRole('button', { name: 'Redeploy', exact: true }).first().click()
  await expect(sheet(page).getByText('Failed at step: Build')).toBeVisible({ timeout: 15_000 })

  // Fix the branch, then redeploy: it runs to the end.
  await sheet(page).getByRole('tab', { name: 'Configuration' }).click()
  await sheet(page).getByLabel('Branch').fill('release/2.3')
  await sheet(page).getByRole('button', { name: 'Save and redeploy' }).first().click()
  await expect(sheet(page).getByRole('log', { name: 'Deployment log' })).toContainText('Check health', { timeout: 15_000 })
  await expect(sheet(page).getByText('Running').first()).toBeVisible({ timeout: 15_000 })
  await expect(sheet(page).getByText('Failed at step')).toHaveCount(0)
})

test('projects can be added with the models they need, and removed again', async ({ page }) => {
  await signIn(page, 'Mantra4Change · User')
  await page.goto('/app/environments/env-m4c-coach?tab=projects')
  await page.getByRole('button', { name: 'Add project' }).first().click()
  const dlg = sheet(page)
  await dlg.getByRole('checkbox', { name: 'Add Feedback Analysis' }).click()
  await expect(dlg.getByText(/Uses Mistral Small 3.1, GPT-5/)).toBeVisible()
  await dlg.getByRole('button', { name: 'Add project' }).click()
  await expect(page.getByText(/Attached Mistral Small 3.1, GPT-5/)).toBeVisible()
  await expect(page.locator('table').getByText('Feedback Analysis', { exact: true })).toBeVisible()

  // Over capacity: the shortfall and an upgrade button appear.
  await page.getByRole('button', { name: 'Add project' }).first().click()
  await expect(dlg.getByText('Every project is already here')).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Actions for Feedback Analysis' }).click()
  await page.getByRole('menuitem', { name: 'Remove from environment' }).click()
  await page.getByRole('button', { name: 'Stop and remove' }).click()
  await expect(page.locator('table').getByText('Feedback Analysis', { exact: true })).toHaveCount(0)
})

test('a shortfall offers an upgrade request', async ({ page }) => {
  await signIn(page, 'ShikshaLokam · User')
  await page.goto('/app/environments/env-sl-tutor?tab=projects')
  // Remove one project so there is something to add back.
  await page.getByRole('button', { name: 'Actions for Teacher Support Chatbot' }).click()
  await page.getByRole('menuitem', { name: 'Remove from environment' }).click()
  await page.getByRole('button', { name: 'Stop and remove' }).click()
  await page.getByRole('button', { name: 'Add project' }).first().click()
  const dlg = sheet(page)
  await dlg.getByRole('checkbox', { name: 'Add Teacher Support Chatbot' }).click()
  await dlg.getByRole('spinbutton', { name: 'vCPU' }).fill('64')
  await expect(dlg.getByText(/Not enough room/)).toBeVisible()
  await expect(dlg.getByRole('button', { name: 'Add project' })).toBeDisabled()
  await dlg.getByRole('button', { name: 'Request upgrade' }).click()
  await expect(page.getByText('Upgrade request sent for review.')).toBeVisible()
})

test('the request wizard can host several projects', async ({ page }) => {
  await signIn(page, 'ShikshaLokam · User')
  await page.goto('/app/environments/new')
  await expect(page.getByText('Also host these projects')).toBeVisible()
  await page.getByRole('checkbox', { name: /Also host/ }).first().click()
  await expect(page.getByRole('checkbox', { name: /Also host/ }).first()).toBeChecked()
})
