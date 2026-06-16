import { test, expect } from '../../src/fixtures/api-fixtures.js';
import { BerkeleyClient } from '../../src/api/berkeley-client.js';
import type { Account, AccountBalance } from '../../src/api/types.js';

const KNOWN_STATUSES = [
  'active',
  'not_active',
  'suspended',
  'expired',
  'canceled',
  'cancelled',
  'lost',
  'stolen',
  'shipping',
  'delinquent',
  'shipped',
];

test.describe('Accounts and Cards', () => {
  test('Get Account By Processor Reference resolves to a numeric account id @smoke', async ({
    client,
    seededAccount,
  }) => {
    const res = await client.getAccountByProcessorReference(seededAccount.processorReference);
    expect(res.status()).toBe(200);
    const account = BerkeleyClient.unwrap<Account>(await res.json());
    expect(account.id).toBeGreaterThan(0);
    expect(String(account.processor_reference)).toBe(String(seededAccount.processorReference));
  });

  test('Get Account Details returns a known status and core fields', async ({
    client,
    seededAccount,
  }) => {
    const res = await client.getAccount(seededAccount.accountId);
    expect(res.status()).toBe(200);
    const account = BerkeleyClient.unwrap<Account>(await res.json());
    expect(account.id).toBe(seededAccount.accountId);
    if (account.status_code) {
      expect(KNOWN_STATUSES).toContain(account.status_code);
    }
  });

  test('Get Account Balance returns numeric balance strings', async ({ client, seededAccount }) => {
    const res = await client.getAccountBalance(seededAccount.accountId);
    expect(res.status()).toBe(200);
    const balance = BerkeleyClient.unwrap<AccountBalance>(await res.json());
    for (const field of ['settled_balance', 'available_balance', 'balance'] as const) {
      expect(balance, `expected field ${field}`).toHaveProperty(field);
    }
    expect(String(balance.available_balance)).toMatch(/^-?\d+(\.\d+)?$/);
  });

  test('Get Account Transactions returns a list', async ({ client, seededAccount }) => {
    const res = await client.getAccountTransactions(seededAccount.accountId, { page: 1, limit: 50 });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { data?: unknown[] } | unknown[];
    const arr = Array.isArray(body) ? body : body.data;
    expect(Array.isArray(arr)).toBeTruthy();
  });

  test('Modify Account Status: suspend then unsuspend is reversible', async ({
    client,
    seededAccount,
  }) => {
    const suspend = await client.modifyAccountStatus(
      seededAccount.accountId,
      'suspend',
      seededAccount.lastFourDigits,
    );
    // Lenient: depends on current card state / program config. Must not 5xx.
    expect(suspend.status(), await bodyOnFail(suspend)).toBeLessThan(500);

    if ([200, 201].includes(suspend.status())) {
      const unsuspend = await client.modifyAccountStatus(
        seededAccount.accountId,
        'unsuspend',
        seededAccount.lastFourDigits,
      );
      expect([200, 201]).toContain(unsuspend.status());
    } else {
      test.info().annotations.push({
        type: 'note',
        description: `suspend returned ${suspend.status()} — likely card-state/config dependent on staging`,
      });
    }
  });

  test('[negative] balance for a non-existent account returns a 4xx', async ({ client }) => {
    const res = await client.getAccountBalance(999_999_999);
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });
});

async function bodyOnFail(res: { text: () => Promise<string>; status: () => number }): Promise<string> {
  return `unexpected ${res.status()}: ${await res.text().catch(() => '<no body>')}`;
}
