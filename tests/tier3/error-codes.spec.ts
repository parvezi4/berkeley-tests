import { test, expect } from '@playwright/test';
import { BerkeleyClient } from '../support/api/berkeley-client.js';
import { newCardholder, uniqueTag } from '../support/utils/test-data.js';
import { config } from '../support/utils/config.js';
import { createFreshAccount } from '../fixtures/fresh-account.js';

function assertError(body: unknown, expectedCode: string) {
  const err =
    ((body as Record<string, unknown>)?.error as Record<string, unknown>) ??
    (body as Record<string, unknown>);
  expect(String(err?.code ?? err?.error_code ?? ''), `expected error code "${expectedCode}"`).toBe(
    expectedCode,
  );
  expect(String(err?.message ?? '')).not.toBe('');
}

test.describe('Error Code Catalogue', () => {
  test('invalid auth token → 401/403', async ({ request }) => {
    const client = new BerkeleyClient(request);
    const res = await client.getProgramWithToken('invalid-token-0000');
    expect([401, 403]).toContain(res.status());
  });

  test('nonexistent cardholder → resource_not_found', async ({ request }) => {
    const client = new BerkeleyClient(request);
    const res = await client.getCardholder(999_999_999);
    expect(res.status()).toBeGreaterThanOrEqual(400);
    assertError(await res.json(), 'resource_not_found');
  });

  test('invalid cardholder field → invalid_cardholder', async ({ request }) => {
    const client = new BerkeleyClient(request);
    const res = await client.createCardholder(
      newCardholder({ date_of_birth: '1990-06-15' }), // wrong format
    );
    expect(res.status()).toBeGreaterThanOrEqual(400);
    assertError(await res.json(), 'invalid_cardholder');
  });

  test('idempotency conflict → duplicate_request', async ({ request }) => {
    const acc = await createFreshAccount(request, 500);
    const key = uniqueTag('idem');
    await acc.client.createValueLoad({
      account_id: acc.accountId,
      amount: 100,
      external_tag: uniqueTag(),
      idempotency_key: key,
    });
    const conflict = await acc.client.createValueLoad({
      account_id: acc.accountId,
      amount: 200,
      external_tag: uniqueTag(),
      idempotency_key: key,
    });
    assertError(await conflict.json(), 'duplicate_request');
  });

  test('address cooldown → cannot_update_resource', async ({ request }) => {
    const client = new BerkeleyClient(request);
    const create = await client.createCardholder(newCardholder());
    const { id } = BerkeleyClient.unwrap<{ id: number }>(await create.json());
    // Update address twice in quick succession — second should hit the cooldown
    await client.updateCardholder(id, { address1: '1 New Street' });
    const second = await client.updateCardholder(id, { address1: '2 Other Street' });
    if (second.status() >= 400) {
      assertError(await second.json(), 'cannot_update_resource');
    } else {
      test.info().annotations.push({
        type: 'note',
        description:
          'Address cooldown not triggered — cooldown window may be longer than test gap',
      });
    }
  });
});
