import { defineConfig } from '@playwright/test'

const port = Number(process.env.PORT ?? 3100)

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    command: `npx next dev -p ${port}`,
    url: `http://localhost:${port}/api/state`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
