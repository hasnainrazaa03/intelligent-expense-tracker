import { defineConfig, devices } from '@playwright/test';

// Screenshot tests (U7), separate from the end-to-end suite: no API server or
// database. They run on a production build with the API answered from
// fixtures and the clock frozen (tests/visual/harness.ts), so an image changes
// only when the UI does.
//
// Rendering differs between operating systems, so the reference images are
// made in Playwright's Linux image, the one CI runs them in:
//   npm run test:visual:update   (needs Docker; see scripts/update-screenshots.sh)
const PORT = 4174;
const phone = {
  ...devices['Pixel 7'],
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
};

export default defineConfig({
  testDir: './tests/visual',
  // One folder per project, no OS suffix: CI and the update script share them.
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  outputDir: 'test-results-visual',
  timeout: 60_000,
  fullyParallel: true,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-visual' }]] : 'list',
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      // Anti-aliasing noise, not a changed screen: ignore colour shifts below
      // `threshold` and up to 0.2% of the pixels.
      threshold: 0.2,
      maxDiffPixelRatio: 0.002,
      stylePath: './tests/visual/screenshot.css',
    },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    serviceWorkers: 'block',
    contextOptions: { reducedMotion: 'reduce' },
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
  },
  projects: [
    { name: 'laptop-dark', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, colorScheme: 'dark' } },
    { name: 'laptop-light', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, colorScheme: 'light' } },
    { name: 'phone-dark', use: { ...phone, colorScheme: 'dark' } },
    { name: 'phone-light', use: { ...phone, colorScheme: 'light' } },
  ],
  webServer: {
    // Its own build folder, so it never swaps the end-to-end suite's build.
    command: `npx vite build --outDir dist-visual && npx vite preview --outDir dist-visual --host localhost --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
