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

/** Fresh sample data for every test. */
async function reset(page: Page) {
  await page.goto('/login')
  await page.evaluate(() => {
    sessionStorage.removeItem('aic-session')
    localStorage.clear()
  })
}

async function signIn(page: Page, who: string) {
  await page.goto('/login')
  await page.evaluate(() => sessionStorage.removeItem('aic-session'))
  await page.goto('/login')
  await page.getByRole('button', { name: new RegExp(`^${who.replace(/[·]/g, '.')}`) }).click()
  await expect(page.getByRole('button', { name: 'Open user menu' })).toBeVisible()
}

const dialog = (page: Page) => page.getByRole('dialog')

async function choose(page: Page, trigger: ReturnType<Page['locator']>, option: string | RegExp) {
  await trigger.click()
  await page.getByRole('option', { name: option }).click()
}

test('1: an environment request with no project is submitted, approved and becomes Active', async ({ page }) => {
  await reset(page)
  await signIn(page, 'ShikshaLokam · User')
  await page.goto('/app/environments/new')
  await expect(page.getByText('You can add projects later.', { exact: false })).toBeVisible()
  await page.getByLabel('Environment name').fill('Scratch space for experiments')
  for (let i = 0; i < 7; i++) await page.getByRole('button', { name: /^Next:/ }).click()
  await expect(page.getByText('No projects yet (you can add them later)')).toBeVisible()
  await page.getByLabel(/Why does your organisation need this/).fill('Somewhere to try new libraries before a project needs them.')
  await page.getByRole('button', { name: 'Submit request' }).click()
  await expect(page).toHaveURL(/\/app\/requests\/req-/)
  const id = page.url().split('/').pop()!

  await signIn(page, 'ShikshaLokam · Tenant Admin')
  await page.goto(`/tenant-admin/requests/${id}`)
  await page.getByRole('button', { name: 'Forward to Super Admin' }).click()
  await dialog(page).getByRole('button', { name: 'Forward to Super Admin' }).click()

  await signIn(page, 'Super Admin')
  await page.goto(`/super-admin/requests/${id}`)
  await page.getByRole('button', { name: 'Approve request' }).click()
  await dialog(page).getByRole('button', { name: /^Approve/ }).click()
  const current = page.getByRole('list', { name: 'Status history' }).locator('li', { hasText: 'Current' })
  await expect(current).toContainText('Active', { timeout: 15_000 })

  await signIn(page, 'ShikshaLokam · User')
  await page.goto('/app')
  await page.getByRole('link', { name: /Scratch space for experiments/ }).first().click()
  await page.getByRole('tab', { name: /Projects/ }).click()
  await expect(page.getByText('No projects yet', { exact: true }).last()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add project' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create project' })).toBeVisible()
})

test('2: a user creates a project, adds capabilities, edits it and the change is audited', async ({ page }) => {
  await reset(page)
  await signIn(page, 'ShikshaLokam · User')
  await page.goto('/app')
  await expect(page.getByTestId('projects-tile')).toHaveAttribute('aria-label', 'Projects: 3, 2 deployed, 1 not deployed')
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Projects' }).click()
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Create project' }).first().click()

  await page.getByLabel('Name', { exact: true }).fill('Teacher Support Chatbot')
  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByText(/already exists in your organisation/)).toBeVisible()
  await page.getByLabel('Name', { exact: true }).fill('Attendance Insights')
  await page.getByLabel('Description').fill('Spots attendance patterns across schools.')
  await choose(page, page.getByLabel('Project type'), 'Data pipeline')
  await choose(page, page.getByLabel('Default runtime'), 'Python')
  await page.getByRole('checkbox', { name: 'Add Kiran Hegde' }).click()
  await page.getByRole('button', { name: 'Create project' }).click()

  await expect(page.getByRole('heading', { name: 'Attendance Insights', level: 1 })).toBeVisible()
  await choose(page, page.getByLabel('Add a capability or model'), /^LangChain/)
  await choose(page, page.getByLabel('Version', { exact: true }), '0.2')
  await page.getByRole('button', { name: 'Add to project' }).click()
  await choose(page, page.getByLabel('Add a capability or model'), /^BGE-M3/)
  await page.getByRole('button', { name: 'Add to project' }).click()
  const caps = page.locator('[data-project-capability]')
  await expect(caps).toHaveCount(2)
  await expect(page.locator('[data-project-capability="cap-langchain"]')).toContainText('Project')

  await page.getByRole('tab', { name: 'Settings' }).click()
  await page.getByLabel('Description').fill('Spots attendance patterns across schools and blocks.')
  await page.getByRole('button', { name: 'Save project' }).click()
  await expect(page.getByTestId('last-updated')).toContainText('Last updated by Arjun Rao')
  await page.getByRole('tab', { name: 'Activity' }).click()
  await expect(page.getByText(/updated description of “Attendance Insights”/)).toBeVisible()

  await signIn(page, 'ShikshaLokam · Tenant Admin')
  await page.goto('/tenant-admin/audit')
  await expect(page.locator('main')).toContainText('Arjun Rao updated description of “Attendance Insights”')
  await expect(page.locator('main')).toContainText('Arjun Rao added LangChain 0.2 to “Attendance Insights”')
})

test('3: a capability added to an environment appears for every project on it, labelled Environment', async ({ page }) => {
  await reset(page)
  await signIn(page, 'ShikshaLokam · User')
  await page.goto('/app/environments/env-sl-tutor?tab=capabilities')
  await choose(page, page.getByLabel('Add a shared capability'), /^Langfuse/)
  await page.getByRole('button', { name: 'Add to environment' }).click()
  await expect(page.locator('[data-env-capability="cap-langfuse"]')).toContainText('Environment')
  const perProject = page.locator('[data-project-caps]')
  await expect(perProject).toHaveCount(3)
  for (const block of await perProject.all()) await expect(block.locator('[data-item="cap-langfuse"]')).toContainText('Langfuse 3.80 · Environment')

  await page.goto('/app/projects/p-sl-edu?tab=capabilities')
  await expect(page.locator('[data-item="cap-langfuse"][data-source="environment"]').first()).toContainText('Environment')
})

test('4: a version conflict blocks deployment until a version is chosen', async ({ page }) => {
  await reset(page)
  await signIn(page, 'ShikshaLokam · User')
  await page.goto('/app/environments/env-sl-tutor?tab=projects')
  await page.getByRole('button', { name: 'Actions for AI Education Assistant' }).click()
  await page.getByRole('menuitem', { name: 'Redeploy' }).click()
  const sheet = dialog(page)
  await expect(sheet.locator('[data-check="capabilities"]')).toHaveAttribute('data-ok', 'false')
  await expect(sheet.getByText('Version conflict: LangGraph')).toBeVisible()
  const confirm = sheet.getByRole('button', { name: 'Confirm & deploy' })
  await expect(confirm).toBeDisabled()

  await sheet.getByRole('radio', { name: 'LangGraph 0.6 from Environment' }).click()
  await expect(sheet.locator('[data-check="capabilities"]')).toHaveAttribute('data-ok', 'true')
  await expect(confirm).toBeEnabled()
  await confirm.click()
  await expect(sheet.getByRole('log', { name: 'Deployment log' })).toContainText('Health check', { timeout: 20_000 })
})

test('5: Deploy always opens the checklist and steps first; nothing runs before Confirm & deploy', async ({ page }) => {
  await reset(page)
  await signIn(page, 'Mantra4Change · User')
  await page.goto('/app/projects/p-m4c-coach?tab=environments')
  await page.locator('[data-deployment]').filter({ hasText: 'Leader coaching assistant' }).getByRole('button', { name: /Redeploy/ }).click()
  const sheet = dialog(page)
  await expect(sheet.getByRole('heading', { name: '1. Pre-deploy checklist' })).toBeVisible()
  await expect(sheet.getByRole('heading', { name: '2. Deployment steps' })).toBeVisible()
  await expect(sheet.locator('details')).toHaveCount(13)
  for (const label of ['Environment is Active', 'Port is free', 'Resources are sufficient', 'Required keys are connected', 'Capabilities have no conflicts or missing services'])
    await expect(sheet.getByText(label, { exact: true })).toBeVisible()
  // CrewAI 0.120 (project) vs 0.140 (environment) must be resolved first.
  await expect(sheet.getByRole('button', { name: 'Confirm & deploy' })).toBeDisabled()
  await expect(sheet.getByText('Running', { exact: true }).first()).toBeVisible()
  await expect(sheet.getByText('Deploying')).toHaveCount(0)

  // Copy and download are always available.
  await expect(sheet.getByRole('button', { name: 'Copy all steps' })).toBeEnabled()
  await expect(sheet.getByRole('button', { name: 'Download deploy.sh' })).toBeEnabled()
  await page.keyboard.press('Escape')

  // A failed deployment on the same environment shows its failing step.
  await page.goto('/app/environments/env-m4c-coach?tab=projects')
  await page.locator('table').getByText('Feedback Analysis', { exact: true }).click()
  await expect(dialog(page).getByText('Failed at step: Build')).toBeVisible()
  await expect(dialog(page).getByRole('button', { name: 'Fix configuration' })).toBeVisible()
})

test('6: projects can be deployed from the project page, and archiving is blocked while running', async ({ page }) => {
  await reset(page)
  await signIn(page, 'ShikshaLokam · User')
  await page.goto('/app/projects/p-sl-quiz')
  await page.getByRole('button', { name: 'Deploy to environment' }).first().click()
  await choose(page, dialog(page).getByLabel('Environment'), 'Kannada reading tutor')
  await dialog(page).getByRole('button', { name: 'Continue to review' }).click()
  const sheet = dialog(page)
  await expect(sheet.getByRole('heading', { name: '1. Pre-deploy checklist' })).toBeVisible()
  await expect(sheet.getByText('Not deployed').first()).toBeVisible()
  await sheet.getByRole('button', { name: 'Confirm & deploy' }).click()
  await expect(sheet.getByRole('log', { name: 'Deployment log' })).toContainText('View logs', { timeout: 20_000 })
  await page.keyboard.press('Escape')

  await page.getByRole('tab', { name: 'Settings' }).click()
  await expect(page.getByRole('button', { name: 'Archive project' })).toBeDisabled()
  await expect(page.getByText(/Running on “Kannada reading tutor”/)).toBeVisible()
})
