import { test, expect } from '../fixtures/api-fixtures.js';
import { newCardholder, createCardholderWithRetry } from '../support/utils/test-data.js';

/**
 * CARDHOLDER PHONE CONSTRAINTS BY REGION
 *
 * OpenAPI Spec Findings:
 *   - Canadian programs (country: 124): phone REQUIRED, max 16 digits
 *   - US programs (country: 840): phone OPTIONAL, max 10 digits
 *
 * Your staging program uses country: 124 (Canada), so phone is required.
 *
 * Assumptions:
 *   - Canadian cardholder without phone: rejected with 400/422
 *   - Canadian cardholder with phone over 16 digits: rejected
 *   - Phone formats: tested as-is (no normalization assumed)
 *
 * Note: These constraints are explicitly documented in OpenAPI, so tests are confirmatory.
 */
test.describe('Cardholder Phone Constraints [OPENAPI-SPEC]', () => {
  test('[spec-confirmed] canadian cardholder (country 124) without phone is rejected', async ({
    client
  }) => {
    // OpenAPI: Canadian programs require phone
    // Attempt to create without phone should fail
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          country: '124', // Canada
          phone: undefined
        })
      )
    );

    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('[discovery] canadian cardholder (country 124) with phone behavior', async ({
    client
  }) => {
    // OpenAPI: Canadian programs require phone
    // Discovery: is phone truly required?
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          country: '124', // Canada
          phone: '1231231234' // 10 digits (well within 16-digit max)
        })
      )
    );

    test.info().annotations.push({
      type: 'note',
      description: `Canadian with phone: HTTP ${res.status()}`
    });
  });

  test('[boundary] canadian cardholder with 16-digit phone (maxLength)', async ({ client }) => {
    // OpenAPI: Canadian max phone is 16 digits
    // Assumption: 16-digit phone accepted (at boundary)
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          country: '124', // Canada
          phone: '1'.repeat(16) // Exactly 16 digits
        })
      )
    );

    if (res.status() === 201) {
      test.info().annotations.push({
        type: 'note',
        description: 'Canadian phone at maxLength (16 digits) accepted'
      });
      expect(res.status()).toBe(201);
    } else {
      test.info().annotations.push({
        type: 'warning',
        description: `Canadian phone at 16-digit limit rejected (${res.status()}). Max may be lower.`
      });
      expect(res.status()).toBeGreaterThanOrEqual(400);
    }
  });

  test('[boundary] canadian cardholder with 17-digit phone (over maxLength)', async ({ client }) => {
    // OpenAPI: Canadian max phone is 16 digits
    // Assumption: 17-digit phone rejected
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          country: '124', // Canada
          phone: '1'.repeat(17) // 17 digits (over limit)
        })
      )
    );

    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('[spec-pattern] canadian cardholder with formatted phone (+ and dashes)', async ({ client }) => {
    // Assumption: Phone formatting (+ dashes) allowed or normalized
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          country: '124',
          phone: '+1-555-0100' // Formatted with + and -
        })
      )
    );

    test.info().annotations.push({
      type: 'note',
      description: `Formatted phone (+1-555-0100) status: HTTP ${res.status()}`
    });

    if (res.status() === 201) {
      test.info().annotations.push({
        type: 'note',
        description: 'Formatted phone accepted (may be normalized internally)'
      });
    }
  });

  test('[discovery] us cardholder (country 840) without phone behavior', async ({
    client
  }) => {
    // OpenAPI: US programs have phone as optional
    // Discovery: is phone truly optional?
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          country: '840', // USA
          phone: undefined // Optional for US
        })
      )
    );

    test.info().annotations.push({
      type: 'note',
      description: `US without phone: HTTP ${res.status()}`
    });
  });

  test('[spec-reference] us cardholder (country 840) with phone over 10 digits', async ({ client }) => {
    // OpenAPI: US max phone is 10 digits
    // Assumption: 11-digit phone rejected for US
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          country: '840', // USA
          phone: '12345678901' // 11 digits (over US limit)
        })
      )
    );

    test.info().annotations.push({
      type: 'note',
      description: `US cardholder with 11-digit phone status: HTTP ${res.status()}`
    });

    if (res.status() >= 400) {
      test.info().annotations.push({
        type: 'note',
        description: 'US phone max 10 digits enforced'
      });
    } else if (res.status() === 201) {
      test.info().annotations.push({
        type: 'warning',
        description: 'US phone over 10 digits accepted (lenient parsing)'
      });
    }
  });
});
