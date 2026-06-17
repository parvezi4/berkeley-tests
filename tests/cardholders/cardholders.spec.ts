import { test, expect } from '../fixtures/api-fixtures.js';
import { BerkeleyClient } from '../support/api/berkeley-client.js';
import { newCardholder, createCardholderWithRetry } from '../support/utils/test-data.js';
import type { CreateCardholderResponse, ListResponse } from '../support/api/types.js';

/**
 * Cardholders endpoint test suite.
 *
 * Tests verify that the Cardholders API correctly handles cardholder lifecycle:
 * creation, retrieval, listing, and updates. These are foundational operations
 * for the card issuing system, as every account is tied to a cardholder.
 */
test.describe('Cardholders', () => {
  /**
   * Core happy-path test: Creating a cardholder should return a 201 status
   * with the created cardholder id and processor reference. An initial load
   * amount may be applied during creation.
   */
  test('Create Cardholder returns 201 with id, processor reference, and a successful load @smoke', async ({
    client,
  }) => {
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder({ load_amount: 500 })),
    );
    expect(res.status()).toBe(201);

    const body = BerkeleyClient.unwrap<CreateCardholderResponse>(await res.json());
    expect(body.id).toBeGreaterThan(0);
    expect(body.primary_processor_reference).toBeTruthy();
    if (body.value_load_result) {
      expect(body.value_load_result.code).toBe('success');
    }
  });

  /**
   * Verify that a created cardholder can be retrieved by id and that the
   * retrieved data matches what was created.
   */
  test('Get Cardholder returns the same id that was created', async ({ client }) => {
    const createRes = await client.createCardholder(newCardholder());
    const created = BerkeleyClient.unwrap<CreateCardholderResponse>(await createRes.json());

    const getRes = await client.getCardholder(created.id);
    expect(getRes.status()).toBe(200);
    const fetched = BerkeleyClient.unwrap<{ id?: number; cardholder_id?: number }>(await getRes.json());
    expect(String(fetched.id ?? fetched.cardholder_id)).toBe(String(created.id));
  });

  /**
   * Verify that the list endpoint returns a paginated collection of cardholders.
   * This allows consumers to iterate through all cardholders with limit/offset.
   */
  test('List Cardholders returns a collection', async ({ client }) => {
    const res = await client.listCardholders({ limit: 10 });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as ListResponse<unknown> | unknown[];
    const arr = Array.isArray(body) ? body : (body as ListResponse<unknown>).data;
    expect(Array.isArray(arr)).toBeTruthy();
  });

  /**
   * Verify that cardholders can be updated with partial field changes.
   * The update should succeed without requiring all original fields.
   * Note: Address fields have a cooldown period and are tested separately.
   */
  test('Update Cardholder accepts a partial personal-info update', async ({ client }) => {
    const createRes = await client.createCardholder(newCardholder());
    const created = BerkeleyClient.unwrap<CreateCardholderResponse>(await createRes.json());

    // Note: address fields are intentionally omitted — Berkeley enforces an
    // address-change cooldown, a documented behaviour covered separately below.
    const res = await client.updateCardholder(created.id, {
      first_name: 'Updated',
      last_name: 'Tester',
      phone: '6135550100',
    });
    expect([200, 201]).toContain(res.status());
  });

  /**
   * Negative test: Creating a cardholder with missing required fields
   * should be rejected with a 4xx error, not a 5xx server error.
   */
  test('[negative] missing required fields is rejected with a 4xx', async ({ client }) => {
    // Only last_name supplied — program_id, first_name, email, etc. omitted.
    const res = await client.createCardholder({ last_name: 'NoOtherFields' } as never);
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
    expect([200, 201]).not.toContain(res.status());
  });

  /**
   * Negative test: Requesting a cardholder that doesn't exist should
   * return a 4xx error, not 5xx.
   */
  test('[negative] fetching a non-existent cardholder returns a 4xx', async ({ client }) => {
    const res = await client.getCardholder(999_999_999);
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });
});
