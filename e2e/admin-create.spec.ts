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

const M4C = 't-mantra4change'

async function signIn(page: Page, who: string, reset = true) {
  await page.goto('/login')
  await page.evaluate((clear) => {
    sessionStorage.removeItem('aic-session')
    if (clear) localStorage.clear()
  }, reset)
  await page.goto('/login')
  await page.getByRole('button', { name: new RegExp(`^${who.replace(/[·]/g, '.')}`) }).click()
  await expect(page.getByRole('button', { name: 'Open user menu' })).toBeVisible()
}

async function pick(page: Page, label: string, option: string | RegExp) {
  await page.getByLabel(label, { exact: true }).click()
  await page.getByRole('option', { name: option }).click()
}

const next = (page: Page) => page.getByRole('button', { name: /^Next:/ }).click()

/** Fills Tenant & ownership and Purpose, then steps through to Review with defaults. */
async function fillWizard(page: Page, opts: { owner: string | RegExp; name: string; reason?: string; cpuOnly?: boolean; access?: string }) {
  await pick(page, 'Owner', opts.owner)
  if (opts.access) await page.getByRole('checkbox', { name: `Give ${opts.access} access` }).click()
  await page.getByLabel('Reason for creation').fill(opts.reason ?? 'Workshop for 20 teachers in Dharwad')
  await next(page)
  await page.getByLabel('Environment name').fill(opts.name)
  await next(page) // provider
  await next(page) // compute
  if (opts.cpuOnly) await page.getByRole('radiogroup', { name: 'Instance type' }).getByRole('radio').filter({ hasText: 'no GPU' }).first().click()
  for (let i = 0; i < 5; i++) await next(page) // llms, asr, caps, data, review
  await expect(page.getByRole('heading', { level: 2, name: 'Review' })).toBeVisible()
}

test('Super Admin creates an environment for Mantra4Change with a user as owner', async ({ page }) => {
  await signIn(page, 'Super Admin')
  await page.goto(`/super-admin/tenants/${M4C}`)
  await page.getByRole('tab', { name: /Infrastructure/ }).click()
  await page.getByRole('button', { name: 'Create infrastructure' }).click()
  await expect(page.getByRole('heading', { name: 'Create infrastructure' })).toBeVisible()
  await expect(page.getByLabel('Tenant', { exact: true })).toHaveText(/Mantra4Change/)
  await fillWizard(page, { owner: /^Rahul Menon/, name: 'Cohort staging', cpuOnly: true })

  // Check 6: the wizard total matches the environment detail page.
  const wizardTotal = (await page.getByLabel('Resources and estimated cost').last().locator('.text-kpi').textContent())?.trim()
  await page.getByRole('button', { name: 'Create infrastructure' }).click()
  // Mantra4Change's seeded RAM quota is nearly used up, so the Super Admin may be asked for an override.
  const dialog = page.getByRole('dialog')
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByLabel('Override reason').fill('Agreed with Mantra4Change for the cohort')
    await dialog.getByRole('button', { name: 'Create anyway' }).click()
  }
  await expect(page.getByRole('heading', { name: 'Cohort staging' })).toBeVisible()
  await expect(page.getByText('Admin-created').first()).toBeVisible()
  await expect(page.getByText(/Created by .* \(Super Admin\) — no approval required/)).toBeVisible()
  const detailTotal = (await page.locator('section', { has: page.getByRole('heading', { name: 'Estimated cost' }) }).locator('dd').last().textContent())?.trim()
  expect(detailTotal).toBe(`${wizardTotal} credits`)
  await expect(page.getByText('Active', { exact: true }).first()).toBeVisible({ timeout: 10_000 })

  // The owner sees it.
  await signIn(page, 'Mantra4Change · User', false)
  await expect(page.getByRole('link', { name: /Cohort staging/ })).toBeVisible()
  // The Tenant Admin sees it, and the tenant's audit log records it.
  await signIn(page, 'Mantra4Change · Tenant Admin', false)
  await page.goto('/tenant-admin/infrastructure')
  await expect(page.getByText('Cohort staging').first()).toBeVisible()
  await page.goto('/tenant-admin/audit')
  await expect(page.getByText(/created “Cohort staging” for Mantra4Change/).first()).toBeVisible()
})

test('Tenant Admin creates within quota, and must escalate when over quota', async ({ page }) => {
  await signIn(page, 'ShikshaLokam · Tenant Admin')
  await page.goto('/tenant-admin/infrastructure')
  await page.getByRole('button', { name: 'Create infrastructure' }).click()
  await expect(page.getByLabel('Tenant', { exact: true })).toHaveValue('ShikshaLokam')
  await fillWizard(page, { owner: /^Tenant-owned/, name: 'Shared staging', cpuOnly: true, reason: 'Shared staging for all projects' })
  await page.getByRole('button', { name: 'Create infrastructure' }).click()
  await expect(page.getByRole('heading', { name: 'Shared staging' })).toBeVisible()
  await expect(page.getByText('Tenant-owned · managed by the Tenant Admin')).toBeVisible()
  await expect(page.getByText('Active', { exact: true }).first()).toBeVisible({ timeout: 10_000 })

  // Over quota: 20 GPU environments.
  await page.goto('/tenant-admin/infrastructure/create')
  await fillWizard(page, { owner: /^Arjun Rao · User$/, name: 'Big GPU cohort' })
  await page.getByLabel('Create identical environments').fill('20')
  await expect(page.getByRole('button', { name: /^Create/ })).toBeDisabled()
  await page.getByRole('button', { name: 'Escalate to Super Admin' }).click()
  await expect(page).toHaveURL(/\/tenant-admin\/requests/)

  await signIn(page, 'Super Admin', false)
  await page.goto('/super-admin/requests')
  await expect(page.getByText('Big GPU cohort-01').first()).toBeVisible()
})

test('Super Admin over quota needs an override reason, shown on the timeline', async ({ page }) => {
  await signIn(page, 'Super Admin')
  await page.goto(`/super-admin/infrastructure/create?tenant=${M4C}`)
  await fillWizard(page, { owner: /^Rahul Menon/, name: 'Override lab' })
  await page.getByLabel('Create identical environments').fill('20')
  await page.getByRole('button', { name: 'Create 20 environments' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText(/This takes Mantra4Change over/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Create anyway' }).click()
  await expect(dialog.getByText(/Give an override reason/)).toBeVisible()
  await dialog.getByLabel('Override reason').fill('Quota increase agreed for the summer programme')
  await dialog.getByRole('button', { name: 'Create anyway' }).click()
  await expect(page).toHaveURL(/\/super-admin\/infrastructure$/)
  await page.getByRole('row', { name: /Override lab-07/ }).click()
  await expect(page.getByText(/Override reason: Quota increase agreed for the summer programme/)).toBeVisible()
})

test('Create 5 identical environments names them -01 to -05 and uses tenant quota', async ({ page }) => {
  await signIn(page, 'ShikshaLokam · Tenant Admin')
  const vcpuUsed = async () => {
    await page.goto('/tenant-admin/infrastructure')
    const text = await page.locator('section', { hasText: 'Allocated against' }).innerText()
    return Number(/vCPU\s*([\d,]+)\s*of/.exec(text)![1]!.replace(/,/g, ''))
  }
  const before = await vcpuUsed()
  await page.goto('/tenant-admin/infrastructure/create')
  await fillWizard(page, { owner: /^Arjun Rao · User$/, name: 'Workshop', cpuOnly: true })
  await page.getByLabel('Create identical environments').fill('5')
  await page.getByRole('button', { name: 'Create 5 environments' }).click()
  await expect(page).toHaveURL(/\/tenant-admin\/infrastructure$/)
  for (const n of ['01', '02', '03', '04', '05']) await expect(page.getByText(`Workshop-${n}`, { exact: true }).first()).toBeVisible()
  expect(await vcpuUsed()).toBe(before + 5 * 8)
})

test('a User cannot see or reach the admin create flow', async ({ page }) => {
  await signIn(page, 'Mantra4Change · User')
  await expect(page.getByRole('button', { name: 'Create infrastructure' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Create infrastructure' })).toHaveCount(0)
  for (const url of ['/super-admin/infrastructure/create', '/tenant-admin/infrastructure/create', '/app/infrastructure/create']) {
    await page.goto(url)
    await expect(page.getByRole('heading', { name: 'Create infrastructure' })).toHaveCount(0)
  }
})
