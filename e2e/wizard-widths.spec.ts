import { expect, test } from '@playwright/test'

for (const width of [1600, 1366, 1280, 1100, 1024, 900, 768, 375]) {
  test(`wizard model step at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/login')
    await page.getByRole('button', { name: /^ShikshaLokam . User/ }).click()
    await page.goto('/app/environments/new')
    await page.getByLabel('Environment name').fill('Width check')
    // Purpose → Provider & region → Compute → Language models
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /^Next:/ }).click()
    await page.getByRole('checkbox', { name: /Claude/ }).click()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(1)
    const cards = page.locator('[role="checkbox"]')
    for (const card of await cards.all()) {
      const clipped = await card.evaluate((el) => [...el.querySelectorAll('*')].some((c) => c.getBoundingClientRect().right > el.getBoundingClientRect().right + 1))
      expect(clipped, 'card content spills out').toBe(false)
    }
    await page.screenshot({ path: `test-results/wizard/${width}.png`, fullPage: true })
  })
}
