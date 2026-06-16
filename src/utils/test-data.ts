import { config } from '../utils/config.js';
import type { CreateCardholderRequest } from '../api/types.js';

/**
 * Generates unique, re-runnable test data.
 *
 * Using a timestamp-based suffix keeps every run idempotent-friendly: re-running
 * the suite never collides on email/external_tag, and there's no manual cleanup.
 */
function stamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
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
