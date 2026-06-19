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
  // Single worker by default to prevent rate limiting and test flakiness.
  // Tests fail with 500 errors when multiple workers hit the API simultaneously.
  // Override with WORKERS environment variable for faster local execution:
  //   WORKERS=4 npm test        (run with 4 workers)
  //   WORKERS=auto npm test     (auto-detect CPU count)
  workers: process.env.WORKERS ? (process.env.WORKERS === 'auto' ? undefined : parseInt(process.env.WORKERS)) : 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'test-results/playwright' }],
    ['json', { outputFile: 'test-results/playwright/results.json' }],
    ['junit', { outputFile: 'test-results/playwright/junit.xml' }],
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
      // Programs are independent and safe to parallelize
      fullyParallel: true,
    },
    {
      name: 'cardholders',
      testDir: './tests/cardholders',
      // Run sequentially: tests depend on seededAccount fixture
      // Parallel workers caused fixture collisions and 500 errors
      fullyParallel: false,
    },
    {
      name: 'accounts',
      testDir: './tests/accounts',
      // Run sequentially: all tests use seededAccount fixture
      // Parallel execution caused cardholder creation conflicts
      fullyParallel: false,
    },
    {
      name: 'value-loads',
      testDir: './tests/value-loads',
      // Run sequentially: tests depend on seededAccount fixture
      // Parallel fixture execution caused 500 errors on cardholder creation
      fullyParallel: false,
    },
    {
      name: 'integration',
      testDir: './tests/integration',
      // Integration tests: cross-domain validation of idempotency, conservation,
      // format validation, error codes, and status transitions
      // Run sequentially to avoid rate limiting on cardholder creation and
      // account state instability issues (see GitHub #11, #12, #16)
      fullyParallel: false,
    },
  ],
});
