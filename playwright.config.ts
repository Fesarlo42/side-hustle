import { defineConfig } from '@playwright/test'

const port = Number(process.env.PORT ?? 3100)

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    // The smoke test drives the scripted demo, so it runs on the mock.
    command: `SIDE_HUSTLE_SOURCE=mock npx next dev -p ${port}`,
    url: `http://localhost:${port}/api/state`,
    // Reuse only if it is already running the mock (see README).
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
