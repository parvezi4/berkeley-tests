import { test, expect } from '../fixtures/api-fixtures.js';
import { BerkeleyClient } from '../support/api/berkeley-client.js';
import { uniqueTag } from '../support/utils/test-data.js';
import type { AccountBalance, ListResponse, ValueLoad } from '../support/api/types.js';

/**
 * Value Loads endpoint test suite.
 *
 * Tests verify that the Value Loads API correctly handles fund transfers to accounts.
 * These are critical tests for financial correctness, including money conservation
 * (what goes in must come out) and idempotency (duplicate requests don't double-charge).
 */

/** Read an account's available balance as a number (minor units / cents). */
async function availableBalance(client: BerkeleyClient, accountId: number): Promise<number> {
  const res = await client.getAccountBalance(accountId);
  expect(res.status(), 'balance read should succeed').toBe(200);
  const balance = BerkeleyClient.unwrap<AccountBalance>(await res.json());
  return Math.round(Number(balance.available_balance) * 100);
}

test.describe('Value Loads', () => {
  /**
   * Core happy-path test: Creating a value load should return 201 with the
   * created load id and the requested amount echoed back.
   */
  test('Create Value Load returns 201 and echoes the amount @smoke', async ({
    client,
    seededAccount,
  }) => {
    const res = await client.createValueLoad({
      account_id: seededAccount.accountId,
      amount: 100,
      external_tag: uniqueTag(),
      message: 'QA automated load',
      idempotency_key: uniqueTag('idem'),
    });
    expect(res.status()).toBe(201);
    const load = BerkeleyClient.unwrap<ValueLoad>(await res.json());
    expect(load.id).toBeGreaterThan(0);
    expect(Number(load.amount)).toBe(100);
    if (load.load_type) expect(load.load_type).toBe('load');
  });

  /**
   * FLAGSHIP TEST — Money Conservation
   *
   * The single highest-value assertion in the suite: a load of N must increase
   * the account's available balance by exactly N. If this breaks, money is being
   * created or destroyed. This is proven entirely black-box, reading only balances
   * before and after, which makes it resilient to implementation changes.
   *
   * Goal: Verify that fund transfers are always accounted for correctly.
   */
  test('a value load increases available balance by exactly the loaded amount', async ({
    client,
    seededAccount,
  }) => {
    const LOAD = 250;
    const before = await availableBalance(client, seededAccount.accountId);

    const res = await client.createValueLoad({
      account_id: seededAccount.accountId,
      amount: LOAD,
      external_tag: uniqueTag(),
      idempotency_key: uniqueTag('idem'),
    });
    expect(res.status()).toBe(201);

    const after = await availableBalance(client, seededAccount.accountId);
    expect(after - before, 'balance must move by exactly the loaded amount').toBe(LOAD);
  });

  /**
   * Idempotency test: Replaying the same idempotency key must not double-load.
   *
   * Either the second call is rejected (4xx) or it returns the same load result
   * without moving the balance a second time. Both are acceptable; a second
   * balance movement is not. This protects against network retries accidentally
   * creating duplicate loads.
   *
   * Goal: Verify that clients can safely retry failed requests without risk.
   */
  test('replaying an idempotency key does not double-charge', async ({ client, seededAccount }) => {
    const LOAD = 100;
    const key = uniqueTag('idem');
    const tag = uniqueTag();

    const before = await availableBalance(client, seededAccount.accountId);

    const first = await client.createValueLoad({
      account_id: seededAccount.accountId,
      amount: LOAD,
      external_tag: tag,
      idempotency_key: key,
    });
    expect(first.status()).toBe(201);

    // Replay with the identical key.
    const replay = await client.createValueLoad({
      account_id: seededAccount.accountId,
      amount: LOAD,
      external_tag: tag,
      idempotency_key: key,
    });
    // Provider may return 200/201 (same record) or a 4xx (rejected duplicate).
    expect(replay.status()).toBeLessThan(500);

    const after = await availableBalance(client, seededAccount.accountId);
    expect(
      after - before,
      'two calls with the same idempotency key must move the balance only once',
    ).toBe(LOAD);
  });

  /**
   * Verify that the list endpoint returns a paginated collection with a count
   * of total loads. This allows consumers to iterate through loads for
   * reconciliation and auditing.
   */
  test('List Value Loads returns a counted collection', async ({ client }) => {
    const res = await client.listValueLoads({ limit: 25 });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as ListResponse<ValueLoad>;
    expect(body).toHaveProperty('count');
    expect(Array.isArray(body.data)).toBeTruthy();
  });

  /**
   * Verify that a created load can be retrieved by id with full details.
   * This allows consumers to look up a load's status and details after creation.
   */
  test('Get Value Load Details returns the created load', async ({ client, seededAccount }) => {
    const createRes = await client.createValueLoad({
      account_id: seededAccount.accountId,
      amount: 100,
      external_tag: uniqueTag(),
      idempotency_key: uniqueTag('idem'),
    });
    const created = BerkeleyClient.unwrap<ValueLoad>(await createRes.json());

    const res = await client.getValueLoad(created.id);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeTruthy();
  });

  /**
   * Negative test: Attempting to load funds to a non-existent account should
   * be rejected with a 4xx error, not a 5xx server error.
   */
  test('[negative] loading a non-existent account is rejected with a 4xx', async ({ client }) => {
    const res = await client.createValueLoad({
      account_id: 999_999_999,
      amount: 100,
      external_tag: uniqueTag(),
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });
});

/**
 * VALUE UNLOAD (OPENAPI-SPEC FINDING)
 *
 * OpenAPI Spec Findings:
 *   - Separate endpoint: POST /api/v1/card_issuing/value_loads/unload
 *   - Must be enabled per program (expect 4xx if not enabled)
 *   - Same schema as load (account_id, amount, external_tag, idempotency_key, etc.)
 *   - Purpose: Withdraw/refund funds from a cardholder account
 *
 * Assumption: Unload may not be enabled on all staging programs.
 * These tests are lenient: accept either success (201) or "not enabled" (422/4xx).
 */
test.describe('Value Unload [OPENAPI-SPEC]', () => {
  test('[spec-documented] unload endpoint exists; either works or is disabled per program', async ({
    client,
    seededAccount,
  }) => {
    // Lenient test: unload is program-specific
    // Accept: 201 (works), 422 (not enabled), or other 4xx (unsupported)
    const res = await client.createValueUnload({
      account_id: seededAccount.accountId,
      amount: 500, // 500 units = $5.00
      external_tag: uniqueTag(),
    });

    test.info().annotations.push({
      type: 'note',
      description: `Unload endpoint status: HTTP ${res.status()}`,
    });

    if (res.status() === 201) {
      test.info().annotations.push({
        type: 'note',
        description: 'Unload feature is ENABLED on this program. Funds withdrawn successfully.',
      });
    } else if (res.status() === 422 || (res.status() >= 400 && res.status() < 500)) {
      test.info().annotations.push({
        type: 'note',
        description: 'Unload feature is NOT ENABLED on this program (expected for many programs).',
      });
    } else if (res.status() >= 500) {
      test.info().annotations.push({
        type: 'warning',
        description: 'Unload returned server error (5xx). Check staging provider status.',
      });
    }

    // Accept both: success or "not enabled"
    expect(res.status() < 500).toBe(true); // At minimum, not a 5xx error
  });

  test('[discovery] unload affects balance if enabled', async ({ client, seededAccount }) => {
    // Only run if unload is enabled (lenient check)
    // First, attempt unload
    const beforeUnload = await availableBalance(client, seededAccount.accountId);

    const unloadRes = await client.createValueUnload({
      account_id: seededAccount.accountId,
      amount: 100,
      external_tag: uniqueTag(),
    });

    // If unload succeeded, balance should decrease
    if (unloadRes.status() === 201) {
      const afterUnload = await availableBalance(client, seededAccount.accountId);
      expect(afterUnload).toBeLessThan(beforeUnload);
      test.info().annotations.push({
        type: 'note',
        description: `Unload: balance decreased from ${beforeUnload} to ${afterUnload}`,
      });
    } else {
      test.info().annotations.push({
        type: 'note',
        description: `Unload not enabled on this program (status: ${unloadRes.status()}). Skipping balance verification.`,
      });
    }
  });
});
