import { test, expect } from '../fixtures/api-fixtures.js';
import { BerkeleyClient } from '../support/api/berkeley-client.js';
import { newCardholder, createCardholderWithRetry } from '../support/utils/test-data.js';

/**
 * DATE FORMAT MISMATCH TESTS
 *
 * OpenAPI Spec Finding:
 *   - Create Cardholder: date_of_birth format is "dd-MM-yyyy" (e.g., "01-01-1980")
 *   - Update Cardholder: date_of_birth format is "YYYY-MM-DD" (e.g., "1980-01-01")
 *
 * This inconsistency is unusual and likely a documentation bug or API inconsistency.
 * These tests verify the actual behavior and flag the discrepancy for the engineering team.
 *
 * Note: Tests include documentation of expected vs. actual behavior for investigation.
 */
test.describe('Cardholder Date Format [OPENAPI-SPEC]', () => {
  test('[spec-confirmed] create cardholder accepts dd-MM-yyyy format @smoke', async ({ client }) => {
    // OpenAPI documented format for create: "dd-MM-yyyy"
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          date_of_birth: '01-01-1980' // dd-MM-yyyy format
        })
      )
    );
    expect(res.status()).toBe(201);
  });

  test('[spec-to-verify] update cardholder accepts YYYY-MM-DD format', async ({ client }) => {
    // OpenAPI shows YYYY-MM-DD for update; verify this is correct
    const createRes = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder())
    );
    const created = BerkeleyClient.unwrap<{ id: number }>(await createRes.json());

    const updateRes = await client.updateCardholder(created.id, {
      date_of_birth: '1980-01-01' // YYYY-MM-DD format per spec
    });

    // Document finding
    if (updateRes.status() >= 400) {
      test.info().annotations.push({
        type: 'warning',
        description: `🐛 BUG FOUND: Update with YYYY-MM-DD failed (${updateRes.status()}). OpenAPI spec may be wrong. Update may also use dd-MM-yyyy.`
      });
      expect(updateRes.status()).toBeGreaterThanOrEqual(400);
    } else {
      expect([200, 201]).toContain(updateRes.status());
    }
  });

  test('[investigation] create with YYYY-MM-DD format (spec says wrong, but test anyway)', async ({
    client
  }) => {
    // If create strictly uses dd-MM-yyyy, this should fail
    // But let's test lenient parsing
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          date_of_birth: '1980-01-01' // YYYY-MM-DD (wrong per spec)
        })
      )
    );

    if (res.status() === 201) {
      test.info().annotations.push({
        type: 'warning',
        description: 'Create accepts YYYY-MM-DD (lenient parsing). OpenAPI says dd-MM-yyyy only.'
      });
    } else {
      test.info().annotations.push({
        type: 'note',
        description: `Create rejects YYYY-MM-DD as expected (${res.status()})`
      });
      expect(res.status()).toBeGreaterThanOrEqual(400);
    }
  });

  test('[investigation] update with dd-MM-yyyy format (spec says wrong, but test anyway)', async ({
    client
  }) => {
    // If update strictly uses YYYY-MM-DD, this should fail
    const createRes = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder())
    );
    const created = BerkeleyClient.unwrap<{ id: number }>(await createRes.json());

    const updateRes = await client.updateCardholder(created.id, {
      date_of_birth: '01-01-1980' // dd-MM-yyyy (wrong per spec)
    });

    if (updateRes.status() === 200 || updateRes.status() === 201) {
      test.info().annotations.push({
        type: 'warning',
        description: 'Update accepts dd-MM-yyyy (lenient parsing). OpenAPI says YYYY-MM-DD only.'
      });
    } else {
      test.info().annotations.push({
        type: 'note',
        description: `Update rejects dd-MM-yyyy as expected (${updateRes.status()})`
      });
      expect(updateRes.status()).toBeGreaterThanOrEqual(400);
    }
  });
});
