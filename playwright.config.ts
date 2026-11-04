import { defineConfig, devices } from '@playwright/test'

const isCI = Boolean(process.env.CI)

// Parcours de bout en bout sur les trois moteurs (spec 1.6.8) : WebKit sert de proxy
// pour Safari, iOS et la vue web de macOS.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    {
      command: 'php artisan serve --host=127.0.0.1 --port=8000',
      cwd: 'apps/api',
      url: 'http://127.0.0.1:8000/api/health',
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      command: 'node node_modules/vite/bin/vite.js',
      cwd: 'apps/web',
      url: 'http://localhost:5173',
      reuseExistingServer: !isCI,
    },
  ],
})
