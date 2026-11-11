import { expect, test, type Page } from '@playwright/test'

const consoleErrors: string[] = []

test.beforeEach(async ({ page }) => {
  consoleErrors.length = 0
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => consoleErrors.push(err.message))
  await page.goto('/login')
  await page.evaluate(() => {
    sessionStorage.removeItem('aic-session')
    localStorage.clear()
  })
})

test.afterEach(async () => {
  expect(consoleErrors, 'console errors').toEqual([])
})

async function signIn(page: Page, who: string) {
  await page.goto('/login')
  await page.evaluate(() => sessionStorage.removeItem('aic-session'))
  await page.goto('/login')
  await page.getByRole('button', { name: new RegExp(`^${who.replace(/[·]/g, '.')}`) }).click()
  await expect(page.getByRole('button', { name: 'Open user menu' })).toBeVisible()
}

async function choose(page: Page, trigger: ReturnType<Page['locator']>, option: string | RegExp) {
  await trigger.click()
  await page.getByRole('option', { name: option }).click()
}

const inr = (n: number) => `₹${new Intl.NumberFormat('en-IN').format(Math.round(n))}`

/** The model cost formula, written out independently of the app (NGO tenant). */
function monthly(inPrice: number, outPrice: number, feePct: number, ngoPct: number, gstPct = 18) {
  const base = ((500 * 800) / 1e6) * inPrice + ((500 * 300) / 1e6) * outPrice
  const fee = (base * feePct) / 100
  const ngo = ((base + fee) * ngoPct) / 100
  const gst = ((base + fee - ngo) * gstPct) / 100
  return (base + fee - ngo + gst) * 30
}

test('a user adds Llama from a platform provider, compares prices and never sees a key field', async ({ page }) => {
  await signIn(page, 'ShikshaLokam · User')
  await page.goto('/app/projects/p-sl-quiz?tab=capabilities')
  await expect(page.getByRole('tab', { name: /AI Models & Capabilities/ })).toBeVisible()

  await choose(page, page.getByLabel('Add a capability or model'), /^Llama 3.3 70B/)
  const picker = page.getByTestId('platform-model-picker')
  await expect(picker).toBeVisible()

  // Check 1 and 3: Bedrock (AWS), the on-premise pool and OpenRouter, at different prices. GCP Vertex is not approved.
  await expect(picker.locator('[data-provider]')).toHaveCount(3)
  const aws = picker.locator('[data-provider="ip-aws"]')
  const onprem = picker.locator('[data-provider="ip-onprem"]')
  await expect(aws).toContainText('Amazon Web Services')
  await expect(onprem).toContainText('Shared On-premise GPU Pool')
  await expect(onprem).toContainText('Cheapest')
  await expect(picker.locator('[data-provider="ip-gcp"]')).toHaveCount(0)
  expect(await aws.getByTestId('option-price').textContent()).not.toEqual(await onprem.getByTestId('option-price').textContent())

  // Check 2: estimator matches the formula and follows the provider choice.
  await expect(page.getByTestId('est-monthly')).toHaveText(inr(monthly(22, 30, 5, 10)))
  await aws.click()
  await expect(aws).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByTestId('est-monthly')).toHaveText(inr(monthly(52, 70, 10, 10)))
  await page.getByLabel('Requests per day').fill('1000')
  await expect(page.getByTestId('est-monthly')).toHaveText(inr(monthly(52, 70, 10, 10) * 2))

  // No key field anywhere in the flow.
  await expect(page.getByLabel(/key/i)).toHaveCount(0)
  await expect(picker).toContainText('Key managed by Amazon Web Services')

  await page.getByRole('button', { name: 'Add to project' }).click()
  const row = page.locator('[data-project-capability="llm-llama"]')
  await expect(row).toContainText('Amazon Web Services')
  await expect(row).toContainText('Key managed by Amazon Web Services')
})

test('children’s data hides providers outside India, and a model with no allowed provider shows why', async ({ page }) => {
  await signIn(page, 'ShikshaLokam · User')
  await page.goto('/app/projects/p-sl-edu?tab=capabilities')
  await choose(page, page.getByLabel('Add a capability or model'), /^Llama 3.3 70B/)
  const picker = page.getByTestId('platform-model-picker')
  await expect(picker.locator('[data-provider="ip-openrouter"]')).toHaveCount(0)
  await expect(picker.locator('[data-provider="ip-onprem"]')).toBeVisible()

  // Gemini: Vertex isn't approved for ShikshaLokam and OpenRouter is outside India.
  await choose(page, page.getByLabel('Add a capability or model'), /^Gemini 2.5 Pro/)
  await expect(page.getByTestId('no-platform-provider')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add to project' })).toBeDisabled()
})

test('the ShikshaLokam Tenant Admin sees model costs for ShikshaLokam only', async ({ page }) => {
  await signIn(page, 'ShikshaLokam · Tenant Admin')
  await page.goto('/tenant-admin')
  await expect(page.getByText('Model cost this month')).toBeVisible()
  await page.goto('/tenant-admin/quotas#model-costs')
  const section = page.getByRole('region', { name: 'Model Costs' })
  await expect(section.getByRole('heading', { name: 'Model Costs' })).toBeVisible()

  for (const tab of ['model', 'provider', 'project', 'user'] as const) {
    await section.getByRole('tab', { name: `By ${tab}` }).click()
    await expect(section.getByTestId(`breakdown-${tab}`)).toBeVisible()
  }
  await section.getByRole('tab', { name: 'By project' }).click()
  await expect(section.getByTestId('breakdown-project')).toContainText('Teacher Support Chatbot')
  await expect(section).not.toContainText('Document Intelligence')
  await expect(section).not.toContainText('Feedback Analysis')
  await section.getByRole('tab', { name: 'By user' }).click()
  await expect(section).not.toContainText('Rahul Menon')

  // The seeded budget is past 80%, so the alert went out.
  await expect(section.getByTestId('model-budget-used')).toContainText('Tenant Admins were notified')
  await page.getByRole('button', { name: /Notifications/ }).click()
  await expect(page.getByText(/of this month’s model budget/).first()).toBeVisible()
})

test('a Super Admin price change applies from its effective date only', async ({ page }) => {
  await signIn(page, 'Super Admin')
  await page.goto('/super-admin/model-costs')
  const mtdCard = page.locator('.card', { hasText: 'Month to date' }).first()
  const before = await mtdCard.textContent()

  await page.goto('/super-admin/infra-providers/ip-onprem?tab=models')
  await expect(page.getByTestId('model-service-connection')).toBeVisible()
  await expect(page.locator('[data-price-row="llm-llama"]').first()).toContainText('₹22.00')
  await page.getByRole('button', { name: 'Edit model prices' }).click()
  const dialog = page.getByRole('dialog')
  const tomorrow = new Date(Date.now() + 86_400_000)
  const ymd = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
  await dialog.getByLabel('Effective from').fill(ymd)
  await dialog.getByLabel('Rate source').fill('Internal cost recovery rates, revised')
  const llama = dialog.locator('[data-model-price="llm-llama"]')
  await llama.getByLabel(/input price/).fill('30')
  await dialog.getByRole('button', { name: 'Publish rate card' }).click()
  await expect(dialog).toBeHidden()

  await expect(page.getByRole('heading', { name: /Upcoming: model prices on rate card v2/ })).toBeVisible()
  // The current card, and so today's costs, keep the old price.
  const current = page.locator('section', { has: page.getByRole('heading', { name: /^Model rate card · v1/ }) })
  await expect(current.locator('[data-price-row="llm-llama"]')).toContainText('₹22.00')

  await page.goto('/super-admin/model-costs')
  await expect(page.locator('.card', { hasText: 'Month to date' }).first()).toHaveText(before ?? '')
})

test('no user or Tenant Admin can see a provider’s model key', async ({ page }) => {
  const secrets = /Model service connection|••••••••4821|sk-or-|aic-vertex@|internal-••••|aic-openai-cin/

  await signIn(page, 'ShikshaLokam · User')
  for (const path of ['/app/projects/p-sl-teacher', '/app/projects/p-sl-teacher?tab=capabilities', '/app/catalog/llm-llama']) {
    await page.goto(path)
    await expect(page.locator('main')).toBeVisible()
    await expect(page.locator('body')).not.toContainText(secrets)
  }

  await signIn(page, 'ShikshaLokam · Tenant Admin')
  for (const path of ['/tenant-admin', '/tenant-admin/quotas', '/tenant-admin/infra-providers', '/tenant-admin/projects/p-sl-teacher?tab=capabilities']) {
    await page.goto(path)
    await expect(page.locator('main')).toBeVisible()
    await expect(page.locator('body')).not.toContainText(secrets)
  }
  await page.goto('/super-admin/infra-providers/ip-aws?tab=models')
  await expect(page.locator('body')).not.toContainText(secrets)
})
