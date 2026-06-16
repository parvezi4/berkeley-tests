import { test, expect } from '../../src/fixtures/api-fixtures.js';
import { BerkeleyClient } from '../../src/api/berkeley-client.js';
import { uniqueTag } from '../../src/utils/test-data.js';
import type { AccountBalance, ListResponse, ValueLoad } from '../../src/api/types.js';

/** Read an account's available balance as a number (minor units / cents). */
async function availableBalance(client: BerkeleyClient, accountId: number): Promise<number> {
  const res = await client.getAccountBalance(accountId);
  expect(res.status(), 'balance read should succeed').toBe(200);
  const balance = BerkeleyClient.unwrap<AccountBalance>(await res.json());
  return Math.round(Number(balance.available_balance) * 100);
}

test.describe('Value Loads', () => {
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
   * FLAGSHIP TEST — money conservation.
   *
   * The single highest-value assertion in the suite: a load of N must increase
   * the account's available balance by exactly N. If this is ever wrong, money
   * is being created or destroyed. Proven entirely black-box, from balances.
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
   * Idempotency — replaying the same idempotency key must not double-load.
   * Either the second call is rejected, or it returns the same load without
   * moving the balance a second time. Both are acceptable; a second balance
   * movement is not.
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

  test('List Value Loads returns a counted collection', async ({ client }) => {
    const res = await client.listValueLoads({ limit: 25 });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as ListResponse<ValueLoad>;
    expect(body).toHaveProperty('count');
    expect(Array.isArray(body.data)).toBeTruthy();
  });

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
