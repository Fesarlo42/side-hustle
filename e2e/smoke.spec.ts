import { expect, test } from '@playwright/test'

/** Loads the page, restarts the demo, lets it run 30 s at 10× and saves screenshots. */
test('dashboard runs the demo without console errors', async ({ page, request }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))

  await request.post('/api/demo', { data: { action: 'restart' } })
  await request.post('/api/demo', { data: { action: 'speed', value: 10 } })

  for (const [w, h] of [
    [1280, 720],
    [1920, 1080],
  ] as const) {
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/')
    await expect(page.getByLabel('Status line')).toBeVisible()
  }
  await page.waitForTimeout(30_000)
  for (const [w, h] of [
    [1280, 720],
    [1920, 1080],
  ] as const) {
    await page.setViewportSize({ width: w, height: h })
    await page.screenshot({ path: `e2e/screenshots/dashboard-${w}x${h}.png`, fullPage: true })
  }
  expect(errors).toEqual([])
})
