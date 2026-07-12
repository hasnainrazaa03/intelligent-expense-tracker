import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    // Use `localhost` (not 127.0.0.1) so the client shares a site with the API
    // (localhost:3001) — otherwise the SameSite=Lax session cookie is dropped
    // cross-site and auth silently fails.
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --host localhost --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    // Logs in once and saves the session for the authenticated project.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    // Public pages run without a session.
    { name: 'public', testMatch: /public\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    // App flows reuse the saved session (no repeated logins → no rate-limit trips).
    {
      name: 'authenticated',
      testMatch: /app\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: 'tests/e2e/.auth/user.json' },
    },
  ],
});
