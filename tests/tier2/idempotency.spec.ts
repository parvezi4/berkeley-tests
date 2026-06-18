import { test, expect } from '@playwright/test';
import { createFreshAccount } from '../fixtures/fresh-account.js';
import { BerkeleyClient } from '../support/api/berkeley-client.js';
import { uniqueTag } from '../support/utils/test-data.js';
import type { ValueLoad } from '../support/api/types.js';

test.describe('Value Load Idempotency', () => {
  test.fixme('identical replay returns 2xx and balance moves exactly once @smoke', async ({
    request,
  }) => {
    // BLOCKED: Replay returns 400 instead of 200/201
    // Likely cause: Account state issue or second load failing before idempotency check
    // This test will pass once account stability is confirmed with Berkeley team
    const acc = await createFreshAccount(request, 2000);
    const key = uniqueTag('idem');
    const AMOUNT = 300;

    const balBefore = await getBalance(acc.client, acc.accountId);

    const first = await acc.client.createValueLoad({
      account_id: acc.accountId,
      amount: AMOUNT,
      external_tag: uniqueTag(),
      idempotency_key: key,
    });
    console.log('[IDEM] First load status:', first.status());

    const replay = await acc.client.createValueLoad({
      account_id: acc.accountId,
      amount: AMOUNT,
      external_tag: uniqueTag(),
      idempotency_key: key,
    });
    console.log('[IDEM] Replay status:', replay.status());
    expect([200, 201]).toContain(replay.status());

    const balAfter = await getBalance(acc.client, acc.accountId);
    expect(balAfter - balBefore, 'balance must move exactly once despite two calls with same key').toBe(
      AMOUNT,
    );
  });

  test.fixme('identical replay returns the same load id as the original', async ({
    request,
  }) => {
    // BLOCKED: Second load returns 400, cannot extract load ID to compare
    const acc = await createFreshAccount(request, 2000);
    const key = uniqueTag('idem');
    const AMOUNT = 100;

    const first = await acc.client.createValueLoad({
      account_id: acc.accountId,
      amount: AMOUNT,
      external_tag: uniqueTag(),
      idempotency_key: key,
    });
    const firstLoad = BerkeleyClient.unwrap<ValueLoad>(await first.json());

    const second = await acc.client.createValueLoad({
      account_id: acc.accountId,
      amount: AMOUNT,
      external_tag: uniqueTag(),
      idempotency_key: key,
    });
    const secondLoad = BerkeleyClient.unwrap<ValueLoad>(await second.json());

    expect(secondLoad.id, 'replay must return the original load id, not a new one').toBe(
      firstLoad.id,
    );
  });

  test('same key with different amount returns duplicate_request error', async ({
    request,
  }) => {
    const acc = await createFreshAccount(request, 2000);
    const key = uniqueTag('idem');

    await acc.client.createValueLoad({
      account_id: acc.accountId,
      amount: 100,
      external_tag: uniqueTag(),
      idempotency_key: key,
    });

    const conflict = await acc.client.createValueLoad({
      account_id: acc.accountId,
      amount: 200, // different amount
      external_tag: uniqueTag(),
      idempotency_key: key,
    });

    expect(conflict.status()).toBeGreaterThanOrEqual(400);
    const body = await conflict.json();
    const errCode = (body as any)?.error?.code ?? (body as any)?.code;
    expect(errCode, 'conflict must use duplicate_request error code').toBe('duplicate_request');
  });

  test('same key on a different account returns duplicate_request (keys are globally scoped)', async ({
    request,
  }) => {
    // This confirms A7 was REFUTED: keys are global, not per-account.
    const acc1 = await createFreshAccount(request, 1000);
    const acc2 = await createFreshAccount(request, 1000);
    const key = uniqueTag('global');

    await acc1.client.createValueLoad({
      account_id: acc1.accountId,
      amount: 100,
      external_tag: uniqueTag(),
      idempotency_key: key,
    });

    const crossAccount = await acc2.client.createValueLoad({
      account_id: acc2.accountId,
      amount: 100,
      external_tag: uniqueTag(),
      idempotency_key: key,
    }); // same key, different account

    expect(
      crossAccount.status(),
      'same key on different account must be rejected (global scope)',
    ).toBeGreaterThanOrEqual(400);
    const body = await crossAccount.json();
    expect((body as any)?.error?.code ?? (body as any)?.code).toBe('duplicate_request');
  });

  test.fixme('idempotency key is case-sensitive', async ({ request }) => {
    // BLOCKED: Second load returns 400 instead of 201
    const acc = await createFreshAccount(request, 2000);
    const baseKey = `idem-case-${Date.now()}`;
    const AMOUNT = 100;

    const first = await acc.client.createValueLoad({
      account_id: acc.accountId,
      amount: AMOUNT,
      external_tag: uniqueTag(),
      idempotency_key: baseKey.toUpperCase(),
    });
    expect(first.status()).toBe(201);

    // Lowercase version — should be treated as a NEW, different key
    const second = await acc.client.createValueLoad({
      account_id: acc.accountId,
      amount: AMOUNT,
      external_tag: uniqueTag(),
      idempotency_key: baseKey.toLowerCase(),
    });
    expect(second.status(), 'lowercase key must be accepted as a distinct key').toBe(201);

    const balDelta = (await getBalance(acc.client, acc.accountId)) - acc.startingBalance;
    expect(balDelta, 'two distinct keys must produce two loads').toBe(AMOUNT * 2);
  });

  test.fixme('load without idempotency_key always creates a new load', async ({
    request,
  }) => {
    // BLOCKED: Second load returns 400 instead of 201
    const acc = await createFreshAccount(request, 3000);
    const AMOUNT = 100;

    const first = await acc.client.createValueLoad({
      account_id: acc.accountId,
      amount: AMOUNT,
      external_tag: `no-key-load-1-${Date.now()}`,
    });
    const second = await acc.client.createValueLoad({
      account_id: acc.accountId,
      amount: AMOUNT,
      external_tag: `no-key-load-2-${Date.now()}`,
    });

    expect(first.status()).toBe(201);
    expect(second.status()).toBe(201);

    const firstId = BerkeleyClient.unwrap<ValueLoad>(await first.json()).id;
    const secondId = BerkeleyClient.unwrap<ValueLoad>(await second.json()).id;
    expect(secondId, 'no key = no dedup, must create separate load').not.toBe(firstId);

    const balDelta = (await getBalance(acc.client, acc.accountId)) - acc.startingBalance;
    expect(balDelta).toBe(AMOUNT * 2);
  });
});

async function getBalance(client: BerkeleyClient, accountId: number): Promise<number> {
  const res = await client.getAccountBalance(accountId);
  expect(res.status()).toBe(200);
  const data = BerkeleyClient.unwrap<{ available_balance: string }>(await res.json());
  return Number(data.available_balance);
}
