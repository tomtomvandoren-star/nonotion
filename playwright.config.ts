import { defineConfig, devices } from '@playwright/test'

const isCI = Boolean(process.env.CI)

// Parcours de bout en bout sur les trois moteurs (spec 1.6.8) : WebKit sert de proxy
// pour Safari, iOS et la vue web de macOS.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  // Le serveur de développement PHP ne traite qu'une requête à la fois sous Windows :
  // en local, les scénarios passent l'un après l'autre. En CI (Linux), il a plusieurs processus.
  workers: isCI ? 2 : 1,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  use: {
    // E2E_BASE_URL : jouer les tests sur un autre front, comme le build de production (vite preview).
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
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
      env: isCI ? { PHP_CLI_SERVER_WORKERS: '4' } : {},
      url: 'http://127.0.0.1:8000/api/health',
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      // En CI, le build de production, celui que reçoivent les utilisateurs (vite preview relaie /api
      // comme le serveur de dev) ; en local, le serveur de dev.
      command: isCI
        ? 'node node_modules/vite/bin/vite.js build && node node_modules/vite/bin/vite.js preview --port 5173 --strictPort'
        : 'node node_modules/vite/bin/vite.js',
      cwd: 'apps/web',
      url: 'http://localhost:5173',
      reuseExistingServer: !isCI,
      timeout: 180_000,
    },
  ],
})
