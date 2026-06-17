import { test, expect } from '../fixtures/api-fixtures.js';
import { uniqueTag } from '../support/utils/test-data.js';

/**
 * VALUE LOAD AMOUNT VALIDATION
 *
 * OpenAPI Spec Finding:
 *   - amount: integer type (smallest currency unit)
 *   - Example: $10.00 CAD = 1000 units
 *   - No decimal values allowed (integer constraint)
 *   - Min/max values NOT documented in spec
 *
 * Assumptions in these tests:
 *   - Minimum valid amount: 1 (penny) - to be verified
 *   - Zero amount: likely invalid - to be verified
 *   - Decimal amounts: should fail (type mismatch)
 *   - String amounts: should fail (type mismatch)
 *   - Large amounts: should work unless max enforced
 *
 * Note: Test comments indicate what we're exploring vs. what spec guarantees.
 */
test.describe('Value Load Amount Validation [OPENAPI-SPEC]', () => {
  test('[spec-confirmed] load with integer amount succeeds @smoke', async ({ client, seededAccount }) => {
    // OpenAPI confirms: amount must be integer in smallest currency unit
    const res = await client.createValueLoad({
      account_id: seededAccount.accountId,
      amount: 1000, // 1000 units = $10.00, integer
      external_tag: uniqueTag()
    });
    expect(res.status()).toBe(201);
  });

  test('[boundary-minimum] load with amount 1 (one penny, smallest positive unit)', async ({
    client,
    seededAccount
  }) => {
    // Assumption: minimum valid amount is 1 unit
    // If rejected, indicates minimum is higher (need to discover)
    const res = await client.createValueLoad({
      account_id: seededAccount.accountId,
      amount: 1,
      external_tag: uniqueTag()
    });

    if (res.status() === 201) {
      test.info().annotations.push({
        type: 'note',
        description: 'Minimum amount: 1 unit (penny) is accepted'
      });
      expect(res.status()).toBe(201);
    } else {
      test.info().annotations.push({
        type: 'note',
        description: `Minimum amount: 1 unit rejected (${res.status()}). Minimum may be higher.`
      });
      expect([400, 422]).toContain(res.status());
    }
  });

  test('[boundary-zero] load with amount 0 (no load)', async ({ client, seededAccount }) => {
    // Assumption: zero amount is invalid
    // Amount 0 doesn't move money; likely rejected
    const res = await client.createValueLoad({
      account_id: seededAccount.accountId,
      amount: 0,
      external_tag: uniqueTag()
    });

    test.info().annotations.push({
      type: 'note',
      description: `Amount 0 behavior: HTTP ${res.status()}`
    });

    // Accept either: rejection or silent success
    expect([201, 400, 422]).toContain(res.status());
  });

  test('[negative] load with decimal amount rejected (type mismatch)', async ({ client, seededAccount }) => {
    // OpenAPI says integer; decimal should fail
    // Assumption: 10.50 is rejected with 400/422
    const res = await client.createValueLoad({
      account_id: seededAccount.accountId,
      amount: 10.5 as never, // Type mismatch: decimal, not integer
      external_tag: uniqueTag()
    });

    expect(res.status()).toBeGreaterThanOrEqual(400);

    if (res.status() < 400) {
      test.info().annotations.push({
        type: 'warning',
        description: 'Decimal amount accepted (lenient parsing). Spec requires integer.'
      });
    }
  });

  test('[negative] load with string amount behavior (lenient parsing discovered)', async ({
    client,
    seededAccount
  }) => {
    // Type mismatch: string instead of integer
    // Assumption: "1000" might be rejected, but API may have lenient parsing
    const res = await client.createValueLoad({
      account_id: seededAccount.accountId,
      amount: '1000' as never, // Type mismatch: string
      external_tag: uniqueTag()
    });

    test.info().annotations.push({
      type: 'note',
      description: `String amount ("1000") status: HTTP ${res.status()}`
    });

    if (res.status() === 201) {
      test.info().annotations.push({
        type: 'warning',
        description: '📝 FINDING: String amounts are accepted and coerced to integers (lenient parsing).'
      });
    } else {
      test.info().annotations.push({
        type: 'note',
        description: 'String amounts are strictly rejected'
      });
    }
  });

  test('[boundary-large] load with large amount (exploratory: 99,999,999 units ≈ $1M)', async ({
    client,
    seededAccount
  }) => {
    // Assumption: Large amounts work unless max enforced
    // 99,999,999 units ≈ $999,999.99 CAD
    // This helps discover max limit if one exists
    const res = await client.createValueLoad({
      account_id: seededAccount.accountId,
      amount: 99_999_999,
      external_tag: uniqueTag()
    });

    test.info().annotations.push({
      type: 'note',
      description: `Large amount (99,999,999 units) status: HTTP ${res.status()}`
    });

    // If rejected, indicates max limit is lower
    if ([201].includes(res.status())) {
      test.info().annotations.push({
        type: 'note',
        description: 'Large amounts are accepted. No maximum limit discovered yet.'
      });
    } else if ([400, 422].includes(res.status())) {
      test.info().annotations.push({
        type: 'note',
        description: 'Large amounts are rejected. Max limit is lower than 99,999,999 units.'
      });
    }
  });

  test('[negative] negative amount (should fail)', async ({ client, seededAccount }) => {
    // Negative amounts make no sense for "load" operation
    // Assumption: -1000 is rejected with 400/422
    const res = await client.createValueLoad({
      account_id: seededAccount.accountId,
      amount: -1000,
      external_tag: uniqueTag()
    });

    expect(res.status()).toBeGreaterThanOrEqual(400);

    if (res.status() < 400) {
      test.info().annotations.push({
        type: 'warning',
        description:
          'Negative amount accepted on load endpoint. Use unload endpoint for withdrawals instead.'
      });
    }
  });
});
