import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Playwright configuration for the Berkeley Payments Card Issuing API suite.
 *
 * This is a pure API test project — no browsers are launched. Every test uses
 * Playwright's `request` fixture (via our typed BerkeleyClient) to exercise the
 * staging API directly.
 */
export default defineConfig({
  testDir: './tests',
  // Fail the build on CI if test.only is left in the source.
  forbidOnly: !!process.env.CI,
  // Retry once on CI to absorb transient network/provider blips; never locally.
  retries: process.env.CI ? 1 : 0,
  // Money-movement tests share account state, so we keep workers conservative.
  // Override per-project below where isolation allows more parallelism.
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  // Shared settings for all the requests we send.
  use: {
    baseURL: process.env.BASE_URL ?? 'https://api.staging.pungle.co',
    extraHTTPHeaders: {
      Accept: 'application/json',
    },
    // Capture full request/response on first retry for debugging.
    trace: 'on-first-retry',
    actionTimeout: 15_000,
  },
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  projects: [
    {
      name: 'programs',
      testDir: './tests/programs',
      fullyParallel: true,
    },
    {
      name: 'cardholders',
      testDir: './tests/cardholders',
    },
    {
      name: 'accounts',
      testDir: './tests/accounts',
    },
    {
      name: 'value-loads',
      testDir: './tests/value-loads',
    },
  ],
});
