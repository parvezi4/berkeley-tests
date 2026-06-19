import { test, expect } from '../fixtures/api-fixtures.js';
import { newCardholder, createCardholderWithRetry } from '../support/utils/test-data.js';

/**
 * CARDHOLDER FIELD LENGTH BOUNDARIES
 *
 * OpenAPI Spec Findings (maxLength constraints):
 *   - first_name, middle_name, last_name: maxLength 50
 *   - address1: maxLength 40
 *   - address2: maxLength 30
 *   - city: maxLength 100
 *   - email: maxLength 50
 *
 * Assumptions:
 *   - Fields at maxLength accepted (201)
 *   - Fields over maxLength rejected (400/422)
 *   - Validation is strict (no silent truncation assumed)
 *
 * Note: These boundaries are explicitly documented in OpenAPI, so tests are confirmatory.
 */

// Helper to generate strings of exact length
const stringOfLength = (len: number, char = 'a'): string => char.repeat(len);

test.describe('Cardholder Field Length Boundaries [OPENAPI-SPEC]', () => {
  test('[boundary] first_name at maxLength 50 (accepted)', async ({ client }) => {
    // OpenAPI: maxLength 50
    // Assumption: exactly 50 chars accepted
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          first_name: stringOfLength(50)
        })
      )
    );
    expect(res.status()).toBe(201);
  });

  test('[boundary] first_name over maxLength 51 (behavior discovery)', async ({ client }) => {
    // OpenAPI: maxLength 50
    // Discovery: does API enforce the limit?
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          first_name: stringOfLength(51)
        })
      )
    );

    if (res.status() === 201) {
      test.info().annotations.push({
        type: 'warning',
        description: '📝 FINDING: first_name accepts 51 chars (over OpenAPI maxLength 50). API is lenient.'
      });
    } else {
      test.info().annotations.push({
        type: 'note',
        description: `first_name over limit rejected (${res.status()})`
      });
    }
  });

  test('[boundary] last_name at maxLength 50 (accepted)', async ({ client }) => {
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          last_name: stringOfLength(50)
        })
      )
    );
    expect(res.status()).toBe(201);
  });

  test('[boundary] last_name over maxLength 51 (behavior discovery)', async ({ client }) => {
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          last_name: stringOfLength(51)
        })
      )
    );
    test.info().annotations.push({
      type: 'note',
      description: `last_name over 50 chars: HTTP ${res.status()}`
    });
  });

  test('[boundary] address1 at maxLength 40 (accepted)', async ({ client }) => {
    // OpenAPI: maxLength 40
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          address1: stringOfLength(40)
        })
      )
    );
    expect(res.status()).toBe(201);
  });

  test('[boundary] address1 over maxLength 41 (behavior discovery)', async ({ client }) => {
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          address1: stringOfLength(41)
        })
      )
    );
    test.info().annotations.push({
      type: 'note',
      description: `address1 over 40 chars: HTTP ${res.status()}`
    });
  });

  test('[boundary] address2 at maxLength 30 (accepted)', async ({ client }) => {
    // OpenAPI: maxLength 30
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          address2: stringOfLength(30)
        })
      )
    );
    expect(res.status()).toBe(201);
  });

  test('[boundary] address2 over maxLength 31 (behavior discovery)', async ({ client }) => {
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          address2: stringOfLength(31)
        })
      )
    );
    test.info().annotations.push({
      type: 'note',
      description: `address2 over 30 chars: HTTP ${res.status()}`
    });
  });

  test('[boundary] city at maxLength 100 (accepted)', async ({ client }) => {
    // OpenAPI: maxLength 100
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          city: stringOfLength(100)
        })
      )
    );
    expect(res.status()).toBe(201);
  });

  test('[boundary] city over maxLength 101 (behavior discovery)', async ({ client }) => {
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          city: stringOfLength(101)
        })
      )
    );
    test.info().annotations.push({
      type: 'note',
      description: `city over 100 chars: HTTP ${res.status()}`
    });
  });

  test('[boundary] email at maxLength 50 (accepted)', async ({ client }) => {
    // OpenAPI: maxLength 50, format: email
    // Challenge: must be valid email and fit in 50 chars
    // Example: "aaaaaaaaaaaaaaaaaaaaaaaaa@example.com" = 37 chars
    const email = stringOfLength(50 - '@example.com'.length) + '@example.com'; // 50 chars total
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          email
        })
      )
    );
    expect(res.status()).toBe(201);
  });

  test('[boundary] email over maxLength 51 (behavior discovery)', async ({ client }) => {
    // 51 chars total (over 50-char limit)
    const email = stringOfLength(51 - '@example.com'.length) + '@example.com'; // 51 chars total
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          email
        })
      )
    );
    test.info().annotations.push({
      type: 'note',
      description: `email over 50 chars: HTTP ${res.status()}`
    });
  });

  test('[boundary] middle_name at maxLength 50 (behavior discovery)', async ({ client }) => {
    // OpenAPI: maxLength 50 (optional field)
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          middle_name: stringOfLength(50)
        })
      )
    );
    test.info().annotations.push({
      type: 'note',
      description: `middle_name at 50 chars: HTTP ${res.status()}`
    });
  });

  test('[boundary] middle_name over maxLength 51 (behavior discovery)', async ({ client }) => {
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          middle_name: stringOfLength(51)
        })
      )
    );
    test.info().annotations.push({
      type: 'note',
      description: `middle_name over 50 chars: HTTP ${res.status()}`
    });
  });
});
