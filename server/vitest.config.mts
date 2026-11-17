import { defineConfig } from 'vitest/config';

// Server tests. tests/unit/* need nothing; tests/api/* drive the real Express
// app with supertest against a throwaway MongoDB named in TEST_DATABASE_URL
// (skipped when it isn't set). See tests/README.md.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    globalSetup: ['tests/global-setup.ts'],
    // The API tests share one database, so test files run one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
