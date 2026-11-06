import { expect, test, type Page } from '@playwright/test'

type Account = 'Super Admin' | 'ShikshaLokam · Tenant Admin' | 'ShikshaLokam · User' | 'Mantra4Change · Tenant Admin' | 'Mantra4Change · User'

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

async function noDemoText(page: Page) {
  const text = await page.locator('body').innerText()
  expect(text.replace(/demo123/g, '')).not.toMatch(/demo/i)
}

async function signIn(page: Page, who: Account) {
  await page.goto('/login')
  await page.evaluate(() => sessionStorage.removeItem('aic-session'))
  await page.goto('/login')
  await noDemoText(page)
  await page.getByRole('button', { name: new RegExp(`^${who.replace(/[·]/g, '.')}`) }).click()
  await expect(page.getByRole('button', { name: 'Open user menu' })).toBeVisible()
}

async function go(page: Page, path: string) {
  await page.goto(path)
  await page.waitForLoadState('networkidle')
  await noDemoText(page)
}

async function chooseOption(page: Page, trigger: ReturnType<Page['locator']>, option: string | RegExp) {
  await trigger.click()
  await page.getByRole('option', { name: option }).click()
}

const dialog = (page: Page) => page.getByRole('dialog')

/** The timeline item marked "Current". */
const currentStep = (page: Page) => page.getByRole('list', { name: 'Status history' }).locator('li', { hasText: 'Current' })

test('1–2: only three tenants, Default hidden outside tenant management, Super Admin is neutral', async ({ page }) => {
  await signIn(page, 'Super Admin')
  await expect(page.getByText('All tenants').first()).toBeVisible()

  await go(page, '/super-admin/tenants')
  const rows = page.locator('table tbody tr')
  await expect(rows).toHaveCount(3)
  await expect(page.locator('table')).toContainText('Default')
  await expect(page.locator('table')).toContainText('System')
  await expect(page.locator('table')).toContainText('ShikshaLokam')
  await expect(page.locator('table')).toContainText('Mantra4Change')

  await page.getByRole('combobox', { name: 'Tenant filter' }).click()
  const options = page.getByRole('option')
  await expect(options).toHaveText(['All tenants', 'ShikshaLokam', 'Mantra4Change'])
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Open user menu' }).click()
  const menu = page.getByRole('menu')
  await expect(menu).toContainText('Platform Administrator')
  await expect(menu).toContainText('Default · Super Admin')
  await expect(menu).not.toContainText('ShikshaLokam')
  await page.keyboard.press('Escape')

  await go(page, '/super-admin')
  await expect(page.getByText('Platform dashboard')).toBeVisible()
  await expect(page.locator('main')).not.toContainText('Default')

  await signIn(page, 'ShikshaLokam · Tenant Admin')
  await go(page, '/tenant-admin/users')
  await expect(page.locator('main')).not.toContainText('Default')
  await expect(page.locator('main')).not.toContainText('Platform Administrator')
})

test('3: tenant admins cannot see the other tenant', async ({ page }) => {
  await signIn(page, 'ShikshaLokam · Tenant Admin')
  for (const [path, forbidden] of [
    ['/tenant-admin/users', ['Sneha Kulkarni', 'Rahul Menon']],
    ['/tenant-admin/infrastructure', ['Leader coaching assistant', 'Mantra4Change']],
    ['/tenant-admin/requests?tab=all', ['Classroom observation analytics']],
    ['/tenant-admin/projects', ['Document Intelligence']],
    ['/tenant-admin/audit', ['Sneha Kulkarni', 'Mantra4Change']],
    ['/tenant-admin/suggestions', ['Haystack']],
  ] as const) {
    await go(page, path)
    for (const f of forbidden) await expect(page.locator('main')).not.toContainText(f)
  }
  await go(page, '/tenant-admin/monitoring')
  await page.getByRole('combobox', { name: 'Environment' }).click()
  await expect(page.getByRole('option', { name: 'Leader coaching assistant' })).toHaveCount(0)
  await expect(page.getByRole('option', { name: 'Kannada reading tutor' })).toHaveCount(1)
  await page.keyboard.press('Escape')
  await go(page, '/tenant-admin/infrastructure/env-m4c-coach')
  await expect(page.getByText('outside what you can see')).toBeVisible()
  await go(page, '/tenant-admin/requests/req-m4c-sip')
  await expect(page.getByText('outside what you can see')).toBeVisible()

  await signIn(page, 'Mantra4Change · Tenant Admin')
  await go(page, '/tenant-admin/users')
  await expect(page.locator('main')).not.toContainText('Ramya Krishnan')
  await go(page, '/tenant-admin/infrastructure')
  await expect(page.locator('main')).not.toContainText('Kannada reading tutor')
})

async function wizardToReview(page: Page) {
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: /^Next:/ }).click()
  await expect(page.getByRole('heading', { name: 'Review', level: 2 })).toBeVisible()
}

test('4: draft, changes requested, resubmit, forward, approve, provisioning to active', async ({ page }) => {
  await signIn(page, 'ShikshaLokam · User')
  await go(page, '/app/environments/new')
  await page.getByLabel('Environment name').fill('Grade 3 maths tutor')
  await page.getByRole('button', { name: 'Save draft' }).click()
  await go(page, '/app/requests')
  await expect(page.getByText('Grade 3 maths tutor')).toBeVisible()
  await page.getByRole('link', { name: 'Continue draft' }).first().click()
  await expect(page.getByText('You’re continuing a saved draft')).toBeVisible()
  await page.getByRole('button', { name: /^Review/ }).click()
  await page.getByLabel(/Why does your organisation need this/).fill('Grade 3 children need maths practice in Kannada.')
  await page.getByRole('button', { name: 'Submit request' }).click()
  await expect(page).toHaveURL(/\/app\/requests\/req-/)
  const id = page.url().split('/').pop()!

  await signIn(page, 'ShikshaLokam · Tenant Admin')
  await go(page, `/tenant-admin/requests/${id}`)
  await expect(page.locator('header').getByText('Under review').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Approve request' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Request changes' }).click()
  await dialog(page).getByLabel(/Comment for the requester/).fill('Please turn on auto-shutdown after 1 idle hour.')
  await dialog(page).getByRole('button', { name: 'Request changes' }).click()
  await expect(page.locator('header').getByText('Changes requested').first()).toBeVisible()

  await signIn(page, 'ShikshaLokam · User')
  await go(page, `/app/requests/${id}`)
  await page.getByRole('button', { name: 'Edit & resubmit' }).click()
  await expect(page.getByText('Please turn on auto-shutdown after 1 idle hour.')).toBeVisible()
  await page.getByRole('button', { name: /^Review/ }).click()
  await page.getByRole('button', { name: 'Resubmit request' }).click()
  await expect(page).toHaveURL(new RegExp(id))

  await signIn(page, 'ShikshaLokam · Tenant Admin')
  await go(page, `/tenant-admin/requests/${id}`)
  await page.getByRole('button', { name: 'Forward to Super Admin' }).click()
  await dialog(page).getByRole('button', { name: 'Forward to Super Admin' }).click()
  await expect(page.locator('header').getByText('Escalated').first()).toBeVisible()

  await signIn(page, 'Super Admin')
  await go(page, `/super-admin/requests/${id}`)
  await page.getByRole('button', { name: 'Approve request' }).click()
  await dialog(page).getByRole('button', { name: /^Approve/ }).click()
  await expect(currentStep(page)).toContainText('Provisioning')
  await expect(currentStep(page)).toContainText('Active', { timeout: 15_000 })

  const timeline = page.getByRole('list', { name: 'Status history' })
  for (const s of ['Draft', 'Submitted', 'Under review', 'Changes requested', 'Resubmitted', 'Escalated', 'Approved', 'Provisioning', 'Active'])
    await expect(timeline.getByText(s, { exact: true }).first()).toBeVisible()
})

test('5: over-quota request can only be forwarded; Super Admin approves', async ({ page }) => {
  await signIn(page, 'ShikshaLokam · User')
  await go(page, '/app/environments/new')
  await page.getByLabel('Environment name').fill('Large speech benchmark')
  await page.getByRole('button', { name: /^Next:/ }).click()
  await page.getByRole('radio', { name: /NVIDIA A100/ }).click()
  await chooseOption(page, page.locator('#gpu-count'), '3 GPUs')
  await expect(page.locator('main').getByText('Over quota', { exact: true }).locator('visible=true').first()).toBeVisible()
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: /^Next:/ }).click()
  await page.getByLabel(/Why does your organisation need this/).fill('State benchmark needs three GPUs for a week.')
  await page.getByRole('button', { name: 'Submit request' }).click()
  await expect(page).toHaveURL(/\/app\/requests\/req-/)
  const id = page.url().split('/').pop()!

  await signIn(page, 'ShikshaLokam · Tenant Admin')
  await go(page, `/tenant-admin/requests/${id}`)
  await expect(page.locator('header').getByText('Over quota')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Approve request' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Forward to Super Admin' }).click()
  await dialog(page).getByRole('button', { name: 'Forward to Super Admin' }).click()

  await signIn(page, 'Super Admin')
  await go(page, '/super-admin/requests')
  await expect(page.getByRole('row', { name: /Large speech benchmark/ })).toBeVisible()
  await go(page, `/super-admin/requests/${id}`)
  await page.getByRole('button', { name: 'Approve request' }).click()
  await dialog(page).getByRole('button', { name: 'Approve over quota' }).click()
  await expect(currentStep(page)).toContainText('Provisioning')
  await expect(currentStep(page)).toContainText('Active', { timeout: 15_000 })
})

test('6: simulated provisioning failure, retry, active', async ({ page }) => {
  await signIn(page, 'Super Admin')
  await go(page, '/super-admin/requests/req-m4c-docscale')
  await page.getByRole('button', { name: 'Approve request' }).click()
  await dialog(page).getByRole('checkbox').last().click()
  await dialog(page).getByRole('button', { name: /^Approve/ }).click()
  await expect(page.getByText('Simulated: GPU capacity unavailable in pool').first()).toBeVisible({ timeout: 15_000 })
  await page.getByRole('link', { name: 'Open environment' }).click()
  await page.getByRole('button', { name: 'Retry provisioning' }).click()
  await expect(page.getByText('Setting up your environment')).toBeVisible()
  await expect(currentStep(page)).toContainText('Provisioning')
  await expect(currentStep(page)).toContainText('Active', { timeout: 15_000 })
  await expect(page.getByText('Setting up your environment')).toHaveCount(0)
})

test('7: Super Admin suspends, user sees it, Super Admin resumes', async ({ page }) => {
  await signIn(page, 'Super Admin')
  await go(page, '/super-admin/infrastructure/env-sl-tutor')
  await page.getByRole('button', { name: 'Suspend' }).click()
  await dialog(page).getByLabel('Reason').fill('Checking an unusual traffic spike.')
  await dialog(page).getByRole('button', { name: 'Suspend' }).click()
  await expect(page.getByText('Suspended by the Super Admin')).toBeVisible()

  await signIn(page, 'ShikshaLokam · User')
  await go(page, '/app/environments/env-sl-tutor')
  await expect(page.getByText('Suspended by the Super Admin')).toBeVisible()
  await expect(page.getByText('Checking an unusual traffic spike.').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Resume' })).toHaveCount(0)

  await signIn(page, 'Super Admin')
  await go(page, '/super-admin/infrastructure/env-sl-tutor')
  await page.getByRole('button', { name: 'Resume' }).click()
  await expect(page.getByText('Suspended by the Super Admin')).toHaveCount(0)
  await expect(currentStep(page)).toContainText('Active')
})

test('8: monitoring is live only for active environments and scoped by role', async ({ page }) => {
  await signIn(page, 'ShikshaLokam · User')
  await go(page, '/app/monitoring')
  await page.getByRole('combobox', { name: 'Environment' }).click()
  await expect(page.getByRole('option', { name: 'Kannada reading tutor' })).toHaveCount(1)
  await expect(page.getByRole('option', { name: 'Speech benchmark batch' })).toHaveCount(0)
  await expect(page.getByRole('option', { name: 'Leader coaching assistant' })).toHaveCount(0)
  await page.getByRole('option', { name: 'Kannada reading tutor' }).click()
  await expect(page.getByText('Live · updates every 5 s')).toBeVisible()
  await expect(page.getByText('Simulated data').first()).toBeVisible()

  await go(page, '/app/environments/env-sl-lessonplan?tab=monitoring')
  await expect(page.getByText('No live data — showing last 7 days')).toBeVisible()

  await signIn(page, 'ShikshaLokam · Tenant Admin')
  await go(page, '/tenant-admin/infrastructure/env-sl-asr-ft')
  await expect(page.getByRole('tab', { name: 'Monitoring' })).toBeDisabled()

  await signIn(page, 'Super Admin')
  await go(page, '/super-admin/monitoring')
  await chooseOption(page, page.getByRole('combobox', { name: 'Tenant filter' }), 'Mantra4Change')
  await page.getByRole('combobox', { name: 'Environment' }).click()
  await expect(page.getByRole('option', { name: 'Kannada reading tutor' })).toHaveCount(0)
  await expect(page.getByRole('option', { name: 'Leader coaching assistant' })).toHaveCount(1)
})

test('9: suggestion approved for one tenant, then published to all', async ({ page }) => {
  await signIn(page, 'ShikshaLokam · User')
  await go(page, '/app/catalog')
  await page.getByRole('button', { name: 'Suggest a capability' }).click()
  await dialog(page).getByLabel('GitHub repository').fill('https://github.com/langchain-ai/langgraph')
  await expect(dialog(page).getByText('Already available.')).toBeVisible()
  await dialog(page).getByLabel('GitHub repository').fill('https://github.com/microsoft/autogen')
  await expect(dialog(page).getByText('Preview simulated — no GitHub call is made.')).toBeVisible()
  await expect(dialog(page).getByLabel('Capability name')).toHaveValue('Autogen')
  await dialog(page).getByLabel('Short description').fill('Framework for building multi-agent applications.')
  await dialog(page).getByLabel('Why your team needs it').fill('We want planner and checker agents for lesson content.')
  await dialog(page).getByLabel('Licence').fill('MIT')
  await dialog(page).getByRole('button', { name: 'Send suggestion' }).click()
  await go(page, '/app/catalog?tab=suggestions')
  await expect(page.getByText('Autogen').first()).toBeVisible()

  await signIn(page, 'ShikshaLokam · Tenant Admin')
  await go(page, '/tenant-admin/suggestions')
  await page.getByRole('button', { name: /Autogen/ }).click()
  await dialog(page).getByRole('button', { name: 'Approve for ShikshaLokam' }).click()

  await signIn(page, 'ShikshaLokam · User')
  await go(page, '/app/catalog')
  await page.getByLabel('Search models and tools').fill('Autogen')
  await expect(page.getByRole('link', { name: /Autogen/ })).toBeVisible()

  await signIn(page, 'Mantra4Change · User')
  await go(page, '/app/catalog')
  await page.getByLabel('Search models and tools').fill('Autogen')
  await expect(page.getByRole('link', { name: /Autogen/ })).toHaveCount(0)

  await signIn(page, 'Super Admin')
  await go(page, '/super-admin/suggestions')
  await page.getByRole('button', { name: /Autogen/ }).click()
  await dialog(page).getByLabel('Version').fill('0.7')
  await dialog(page).getByRole('button', { name: 'Publish' }).click()

  await signIn(page, 'Mantra4Change · User')
  await go(page, '/app/catalog')
  await page.getByLabel('Search models and tools').fill('Autogen')
  await expect(page.getByRole('link', { name: /Autogen/ })).toBeVisible()
})

test('responsive screenshots at 375, 768 and 1440 in light and dark', async ({ page }) => {
  await signIn(page, 'ShikshaLokam · Tenant Admin')
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((t) => localStorage.setItem('aic-theme', t), theme)
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      for (const path of ['/tenant-admin', '/tenant-admin/requests/req-sl-benchmark', '/tenant-admin/infrastructure/env-sl-tutor?tab=monitoring']) {
        await go(page, path)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        expect(overflow, `${path} at ${width}px overflows`).toBeLessThanOrEqual(1)
        await page.screenshot({ path: `test-results/screens/${theme}-${width}-${path.replace(/[/?=]/g, '_')}.png`, fullPage: false })
      }
    }
  }
})
