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
  await expect(sheet(page).getByRole('button', { name: /Review deployment/ })).toBeDisabled()
  await port.fill('3005')
  await expect(sheet(page).getByText(/already used by/)).toHaveCount(0)
  await expect(sheet(page).getByRole('button', { name: 'Save configuration' })).toBeEnabled()
})

test('the review shows the generated systemd unit, which follows the start command', async ({ page }) => {
  await signIn(page, 'ShikshaLokam · User')
  await page.goto('/app/environments/env-sl-tutor?tab=projects')
  await openDeployment(page, 'AI Education Assistant')
  await sheet(page).getByRole('tab', { name: 'Review & steps' }).click()
  await sheet(page).getByText('Create the service', { exact: true }).click()
  await expect(sheet(page).getByText('ExecStart=/home/deploy/.nvm/nvm-exec node dist/server.js')).toBeVisible()
  await sheet(page).getByText('Enable and start the service', { exact: true }).click()
  await expect(sheet(page).getByText('sudo systemctl enable --now reading-tutor-api', { exact: false }).first()).toBeVisible()

  await sheet(page).getByRole('button', { name: 'Edit configuration' }).click()
  await sheet(page).getByLabel('Start command').fill('node dist/cluster.js --workers 2')
  await sheet(page).getByRole('button', { name: /Review deployment/ }).click()
  await sheet(page).getByText('Create the service', { exact: true }).click()
  await expect(sheet(page).getByText('ExecStart=/home/deploy/.nvm/nvm-exec node dist/cluster.js --workers 2')).toBeVisible()

  const download = page.waitForEvent('download')
  await sheet(page).getByRole('button', { name: 'Download deploy.sh' }).click()
  expect((await download).suggestedFilename()).toBe('deploy.sh')
})

test('a failed deployment shows the failing step and can be redeployed after review', async ({ page }) => {
  await signIn(page, 'ShikshaLokam · User')
  await page.goto('/app/environments/env-sl-tutor?tab=projects')
  await openDeployment(page, 'Multilingual Speech Recognition')
  await expect(sheet(page).getByText('Failed at step: Build')).toBeVisible()
  await expect(sheet(page).getByText(/No module named 'app.scoring'/).first()).toBeVisible()

  // Redeploy opens the review; HF_TOKEN isn't connected, so the warning must be overridden.
  await sheet(page).getByRole('button', { name: 'Redeploy', exact: true }).last().click()
  const confirm = sheet(page).getByRole('button', { name: 'Confirm & deploy' })
  await expect(confirm).toBeDisabled()
  await sheet(page).getByRole('checkbox', { name: /Deploy anyway/ }).click()
  await confirm.click()
  await expect(sheet(page).getByText('Failed at step: Build')).toBeVisible({ timeout: 20_000 })

  // Fix the branch, review again, then deploy: it runs to the end.
  await sheet(page).getByRole('button', { name: 'Fix configuration' }).click()
  await sheet(page).getByLabel('Branch').fill('release/2.3')
  await sheet(page).getByRole('button', { name: /Review deployment/ }).click()
  await sheet(page).getByRole('checkbox', { name: /Deploy anyway/ }).click()
  await sheet(page).getByRole('button', { name: 'Confirm & deploy' }).click()
  await expect(sheet(page).getByRole('log', { name: 'Deployment log' })).toContainText('Health check', { timeout: 20_000 })
  await expect(sheet(page).getByText('Running').first()).toBeVisible({ timeout: 20_000 })
  await expect(sheet(page).getByText('Failed at step')).toHaveCount(0)
})

test('projects can be added with the models they need, and removed again', async ({ page }) => {
  await signIn(page, 'Mantra4Change · User')
  await page.goto('/app/environments/env-m4c-coach?tab=projects')
  await page.getByRole('button', { name: 'Add project' }).first().click()
  const dlg = sheet(page)
  await dlg.getByRole('checkbox', { name: 'Add Parent Survey Insights' }).click()
  await expect(dlg.getByText(/Uses Gemini 2.5 Pro/)).toBeVisible()
  await dlg.getByRole('button', { name: 'Add project' }).click()
  await expect(page.getByText(/Attached Gemini 2.5 Pro/)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('table').getByText('Parent Survey Insights', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Actions for Parent Survey Insights' }).click()
  await page.getByRole('menuitem', { name: 'Remove from environment' }).click()
  await page.getByRole('button', { name: 'Stop and remove' }).click()
  await expect(page.locator('table').getByText('Parent Survey Insights', { exact: true })).toHaveCount(0)
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

test('the request wizard makes projects optional and multi-select', async ({ page }) => {
  await signIn(page, 'ShikshaLokam · User')
  await page.goto('/app/environments/new')
  await expect(page.getByText('You can add projects later.', { exact: false })).toBeVisible()
  const boxes = page.getByRole('checkbox', { name: /^Host / })
  await expect(boxes.first()).not.toBeChecked()
  await boxes.nth(0).click()
  await boxes.nth(1).click()
  await expect(boxes.nth(0)).toBeChecked()
  await expect(boxes.nth(1)).toBeChecked()
})
