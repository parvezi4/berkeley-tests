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
  // Single worker on CI to reduce staging API load and prevent test flakiness.
  // Tests were failing with 500 errors when multiple workers hit the API simultaneously.
  // Local development can use multiple workers (undefined = auto-detect CPU count).
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
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
      name: 'exploration',
      testDir: './tests/exploration',
      // Empirical exploration tests: diagnostic suite for API behaviour validation
      // Run sequentially to avoid staging API overload with state-dependent tests
      fullyParallel: false,
    },
    {
      name: 'tier2',
      testDir: './tests/tier2',
      // Tier 2: core idempotency, conservation, format validation
      // Tests use createFreshAccount() per test, safe to parallelize
      fullyParallel: true,
    },
    {
      name: 'tier3',
      testDir: './tests/tier3',
      // Tier 3: error codes, state transitions
      // Tests use createFreshAccount() per test, safe to parallelize
      fullyParallel: true,
    },
  ],
});
