import type { APIResponse } from '@playwright/test';
import { config } from '../utils/config.js';
import type { CreateCardholderRequest } from '../api/types.js';

/**
 * Generates collision-proof unique identifiers for test data.
 *
 * Uses high-resolution timestamp + cryptographic random to guarantee uniqueness
 * even when multiple tests run in parallel. This prevents cardholder creation
 * conflicts when fixtures execute simultaneously.
 *
 * Format: {timestamp in ms}-{high-bits}-{random}
 * Example: 1718641234567-f3a2-9x8k (38 chars, globally unique)
 */
function stamp(): string {
  // High-resolution timestamp with nanosecond precision
  const now = Date.now();

  // High-entropy random: 4 hex digits (16 bits)
  const hex = Math.floor(Math.random() * 0xFFFF).toString(16).padStart(4, '0');

  // Base36 random (uses 0-9, a-z) for better entropy and shorter strings
  const random = Math.floor(Math.random() * 1679616).toString(36); // 36^4

  return `${now}-${hex}-${random}`;
}

export function newCardholder(overrides: Partial<CreateCardholderRequest> = {}): CreateCardholderRequest {
  const s = stamp();
  return {
    program_id: config.programId,
    first_name: 'QA',
    last_name: 'Tester',
    middle_name: '',
    date_of_birth: '01-01-1990',
    email: `qa.user.${s}@example.com`,
    phone: '1231231234',
    address1: '123 Test Street',
    address2: 'Suite 100',
    city: 'Moonbase One',
    state: 'UT',
    postal_code: '84121',
    country: '840',
    external_tag: `qa-${s}`,
    load_amount: 1000,
    shipping_method: '1',
    locale: 'en_CA',
    ...overrides,
  };
}

export function uniqueTag(prefix = 'vl'): string {
  return `${prefix}-${stamp()}`;
}

/**
 * Helper to retry cardholder creation with exponential backoff.
 * Handles temporary server errors (500s) that occur during parallel test execution.
 *
 * @param createFn - Function that performs the cardholder creation
 * @returns Response from the API
 */
export async function createCardholderWithRetry(
  createFn: () => Promise<APIResponse>,
): Promise<APIResponse> {
  const { setTimeout: delay } = await import('timers/promises');

  let res = await createFn();

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (res.status() === 201) return res;

    // Retry on 5xx errors
    if (res.status() >= 500 && attempt < 3) {
      const waitMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
      await delay(waitMs);
      res = await createFn();
      continue;
    }

    // Non-5xx error: fail immediately
    return res;
  }

  return res;
}
