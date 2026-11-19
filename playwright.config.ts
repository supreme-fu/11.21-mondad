import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  globalSetup: './tests/global-setup.ts',
  use: {
    baseURL: 'http://127.0.0.1:7101',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run start',
    url: 'http://127.0.0.1:7101/api/health',
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_PATH: 'server/data/e2e.db',
      RECEIPT_MODE: 'simulation',
      PORT: '7101',
    },
  },
});
