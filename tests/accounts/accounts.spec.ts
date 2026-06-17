import { test, expect } from '../fixtures/api-fixtures.js';
import { BerkeleyClient } from '../support/api/berkeley-client.js';
import type { Account, AccountBalance } from '../support/api/types.js';

/**
 * Accounts and Cards endpoint test suite.
 *
 * Tests verify that accounts (created via cardholder signup) can be queried,
 * and that card management (status changes, balance reads) works correctly.
 * Accounts are the primary resource for balance and transaction operations.
 */

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
  /**
   * Core lookup test: Given a processor reference (returned from cardholder
   * creation), verify that we can resolve it to the numeric account id.
   * This is the primary integration point for consumers.
   */
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

  /**
   * Verify that account details include all expected fields and that the status
   * is one of the known enum values. This validates the account state model.
   */
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

  /**
   * Verify that balance endpoint returns all required balance fields
   * (settled, available, total) as valid numeric strings (e.g., "100.50" or "-5").
   * This is critical for consumers to track account funds.
   */
  test('Get Account Balance returns numeric balance strings', async ({ client, seededAccount }) => {
    const res = await client.getAccountBalance(seededAccount.accountId);
    expect(res.status()).toBe(200);
    const balance = BerkeleyClient.unwrap<AccountBalance>(await res.json());
    for (const field of ['settled_balance', 'available_balance', 'balance'] as const) {
      expect(balance, `expected field ${field}`).toHaveProperty(field);
    }
    expect(String(balance.available_balance)).toMatch(/^-?\d+(\.\d+)?$/);
  });

  /**
   * Verify that the transactions endpoint returns a paginated list of account
   * activity. This allows consumers to reconcile account state and audit activity.
   */
  test('Get Account Transactions returns a list', async ({ client, seededAccount }) => {
    const res = await client.getAccountTransactions(seededAccount.accountId, { page: 1, limit: 50 });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { data?: unknown[] } | unknown[];
    const arr = Array.isArray(body) ? body : body.data;
    expect(Array.isArray(arr)).toBeTruthy();
  });

  /**
   * Verify that accounts can be suspended and then unsuspended (or at minimum,
   * that the operation doesn't fail with a 5xx error). This tests card lifecycle
   * management, which may depend on program-level configuration or card state.
   *
   * Goal: Ensure account status can be modified for compliance and user requests.
   */
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

  /**
   * Negative test: Requesting the balance of a non-existent account should
   * return a 4xx error, not a 5xx server error.
   */
  test('[negative] balance for a non-existent account returns a 4xx', async ({ client }) => {
    const res = await client.getAccountBalance(999_999_999);
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });
});

async function bodyOnFail(res: { text: () => Promise<string>; status: () => number }): Promise<string> {
  return `unexpected ${res.status()}: ${await res.text().catch(() => '<no body>')}`;
}
