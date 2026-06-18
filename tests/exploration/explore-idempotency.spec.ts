import { test, expect } from '../fixtures/api-fixtures.js';
import { BerkeleyClient } from '../support/api/berkeley-client.js';
import { newCardholder, createCardholderWithRetry } from '../support/utils/test-data.js';
import type { AccountBalance, ValueLoad } from '../support/api/types.js';

/**
 * EXPLORE-2: Idempotency key semantics
 *
 * This exploration suite characterises the full idempotency contract for value loads
 * and unloads, including key scope, conflict handling, and TTL.
 *
 * Goal: Understand how idempotency keys work, their scope, and what happens on conflicts.
 */

test.describe('EXPLORE-2: Idempotency Key Semantics', () => {
  test('Test: Basic idempotency — replay same load returns same result', async ({
    client,
  }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          load_amount: 0, // Start with zero to isolate the test load
        })
      )
    );

    const chData = BerkeleyClient.unwrap<{ id: number }>(
      await cardholder.json()
    );
    const accountId = chData.id;

    const idemKey = `idem-base-${Date.now()}`;

    // First load
    const load1 = await client.createValueLoad({
      account_id: accountId,
      amount: 100,
      external_tag: `tag-1-${Date.now()}`,
      idempotency_key: idemKey,
    });

    const load1Data = BerkeleyClient.unwrap<ValueLoad>(await load1.json());
    const firstLoadId = load1Data.id;
    console.log('[EXPLORE-2] First load: HTTP', load1.status(), 'ID:', firstLoadId);

    // Get balance after first load
    const balance1 = await client.getAccountBalance(accountId);
    const balance1Data = BerkeleyClient.unwrap<AccountBalance>(
      await balance1.json()
    );
    const balanceAfter1 = parseInt(balance1Data.available_balance);
    console.log('[EXPLORE-2] Balance after first load:', balanceAfter1);

    // Replay with same key
    const load2 = await client.createValueLoad({
      account_id: accountId,
      amount: 100,
      external_tag: `tag-1-${Date.now()}`, // Same tag
      idempotency_key: idemKey,
    });

    const load2Data = BerkeleyClient.unwrap<ValueLoad>(await load2.json());
    const secondLoadId = load2Data.id;
    console.log('[EXPLORE-2] Replay load: HTTP', load2.status(), 'ID:', secondLoadId);
    console.log('[EXPLORE-2] Same ID on replay?', firstLoadId === secondLoadId);

    // Get balance after replay
    const balance2 = await client.getAccountBalance(accountId);
    const balance2Data = BerkeleyClient.unwrap<AccountBalance>(
      await balance2.json()
    );
    const balanceAfter2 = parseInt(balance2Data.available_balance);
    console.log('[EXPLORE-2] Balance after replay:', balanceAfter2);
    console.log('[EXPLORE-2] Balance moved twice?', balanceAfter2 > balanceAfter1 + 100);

    expect.soft(load2.status()).toBe(201);
    expect.soft(balanceAfter2).toBe(balanceAfter1); // Should not have moved again
  });

  test('Test: Replay with different amount, same key (should conflict)', async ({
    client,
  }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          load_amount: 0,
        })
      )
    );

    const chData = BerkeleyClient.unwrap<{ id: number }>(
      await cardholder.json()
    );
    const accountId = chData.id;

    const idemKey = `idem-conflict-${Date.now()}`;

    // First load with amount 200
    const load1 = await client.createValueLoad({
      account_id: accountId,
      amount: 200,
      external_tag: `tag-conflict-${Date.now()}`,
      idempotency_key: idemKey,
    });

    console.log('[EXPLORE-2] First load (200): HTTP', load1.status());
    expect.soft(load1.status()).toBe(201);

    // Try to load with different amount (500) but same key
    const load2 = await client.createValueLoad({
      account_id: accountId,
      amount: 500,
      external_tag: `tag-conflict-diff-${Date.now()}`,
      idempotency_key: idemKey,
    });

    console.log('[EXPLORE-2] Replay with different amount (500): HTTP', load2.status());
    const responseBody = await load2.text();
    if (load2.status() >= 400) {
      console.log('[EXPLORE-2] Conflict error:', responseBody);
    }

    // Balance should only reflect first load (200)
    const balance = await client.getAccountBalance(accountId);
    const balanceData = BerkeleyClient.unwrap<AccountBalance>(
      await balance.json()
    );
    console.log('[EXPLORE-2] Final balance (expect 200):', balanceData.available_balance);
    expect.soft(parseInt(balanceData.available_balance)).toBe(200);
  });

  test('Test: Same key on different account (key scope)', async ({ client }) => {
    // Create two accounts
    const ch1 = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder())
    );
    const ch1Data = BerkeleyClient.unwrap<{ id: number }>(await ch1.json());
    const account1 = ch1Data.id;

    const ch2 = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder())
    );
    const ch2Data = BerkeleyClient.unwrap<{ id: number }>(await ch2.json());
    const account2 = ch2Data.id;

    const sharedKey = `idem-shared-${Date.now()}`;

    // Load on account 1
    const load1 = await client.createValueLoad({
      account_id: account1,
      amount: 150,
      external_tag: `tag-acct1-${Date.now()}`,
      idempotency_key: sharedKey,
    });

    console.log('[EXPLORE-2] Load on account 1: HTTP', load1.status());
    expect.soft(load1.status()).toBe(201);

    // Try same key on account 2
    const load2 = await client.createValueLoad({
      account_id: account2,
      amount: 150,
      external_tag: `tag-acct2-${Date.now()}`,
      idempotency_key: sharedKey,
    });

    console.log('[EXPLORE-2] Load on account 2 with same key: HTTP', load2.status());
    const responseBody = await load2.text();
    if (load2.status() >= 400) {
      console.log('[EXPLORE-2] Error (if globally scoped):', responseBody);
    }

    // Check both balances
    const bal1 = await client.getAccountBalance(account1);
    const bal1Data = BerkeleyClient.unwrap<AccountBalance>(await bal1.json());

    const bal2 = await client.getAccountBalance(account2);
    const bal2Data = BerkeleyClient.unwrap<AccountBalance>(await bal2.json());

    console.log('[EXPLORE-2] Account 1 balance:', bal1Data.available_balance);
    console.log('[EXPLORE-2] Account 2 balance:', bal2Data.available_balance);
    console.log(
      '[EXPLORE-2] Key is per-account scoped?',
      load2.status() === 201 ? 'YES' : 'NO (globally scoped)'
    );

    if (load2.status() === 201) {
      expect.soft(parseInt(bal1Data.available_balance)).toBe(150);
      expect.soft(parseInt(bal2Data.available_balance)).toBe(150);
    }
  });

  test('Test: Case sensitivity of idempotency key', async ({ client }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder())
    );

    const chData = BerkeleyClient.unwrap<{ id: number }>(
      await cardholder.json()
    );
    const accountId = chData.id;

    const keyUppercase = `IDEM-CASE-${Date.now()}`;
    const keyLowercase = keyUppercase.toLowerCase();

    // Load with uppercase key
    const load1 = await client.createValueLoad({
      account_id: accountId,
      amount: 175,
      external_tag: `tag-case-upper-${Date.now()}`,
      idempotency_key: keyUppercase,
    });

    console.log('[EXPLORE-2] Load with uppercase key: HTTP', load1.status());
    expect.soft(load1.status()).toBe(201);

    const balance1 = await client.getAccountBalance(accountId);
    const balance1Data = BerkeleyClient.unwrap<AccountBalance>(
      await balance1.json()
    );
    const bal1 = parseInt(balance1Data.available_balance);

    // Replay with lowercase key
    const load2 = await client.createValueLoad({
      account_id: accountId,
      amount: 175,
      external_tag: `tag-case-lower-${Date.now()}`,
      idempotency_key: keyLowercase,
    });

    console.log('[EXPLORE-2] Replay with lowercase key: HTTP', load2.status());

    const balance2 = await client.getAccountBalance(accountId);
    const balance2Data = BerkeleyClient.unwrap<AccountBalance>(
      await balance2.json()
    );
    const bal2 = parseInt(balance2Data.available_balance);

    console.log('[EXPLORE-2] Balance after uppercase:', bal1);
    console.log('[EXPLORE-2] Balance after lowercase:', bal2);
    console.log('[EXPLORE-2] Case-sensitive?', bal2 > bal1 ? 'NO (case-insensitive)' : 'YES (case-sensitive)');

    if (bal2 > bal1) {
      console.log('[EXPLORE-2] Keys treated as different (case-insensitive)');
    }
  });

  test('Test: Idempotency on unload', async ({ client }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          load_amount: 500,
        })
      )
    );

    const chData = BerkeleyClient.unwrap<{ id: number }>(
      await cardholder.json()
    );
    const accountId = chData.id;

    const idemKey = `idem-unload-${Date.now()}`;

    // First unload
    const unload1 = await client.createValueUnload({
      account_id: accountId,
      amount: 100,
      external_tag: `tag-unload-${Date.now()}`,
      idempotency_key: idemKey,
    });

    console.log('[EXPLORE-2] First unload: HTTP', unload1.status());

    const balance1 = await client.getAccountBalance(accountId);
    const balance1Data = BerkeleyClient.unwrap<AccountBalance>(
      await balance1.json()
    );
    const bal1 = parseInt(balance1Data.available_balance);

    // Replay unload
    const unload2 = await client.createValueUnload({
      account_id: accountId,
      amount: 100,
      external_tag: `tag-unload-replay-${Date.now()}`,
      idempotency_key: idemKey,
    });

    console.log('[EXPLORE-2] Replay unload: HTTP', unload2.status());

    const balance2 = await client.getAccountBalance(accountId);
    const balance2Data = BerkeleyClient.unwrap<AccountBalance>(
      await balance2.json()
    );
    const bal2 = parseInt(balance2Data.available_balance);

    console.log('[EXPLORE-2] Balance after first unload:', bal1);
    console.log('[EXPLORE-2] Balance after replay:', bal2);
    console.log('[EXPLORE-2] Balance moved twice?', bal1 !== bal2 || bal2 !== 400);

    expect.soft(bal1).toBe(400);
    expect.soft(bal2).toBe(400);
  });

  test('Summary: EXPLORE-2 Results', async ({ client }) => {
    console.log(`
=== EXPLORE-2 RESULTS SUMMARY ===
Check the logs above for:
- Basic replay returns same id? (YES/NO)
- Basic replay status code
- Different amount same key: status + error code
- Same key different account: status (201 = per-account, 4xx = global)
- Case sensitivity: balance doubled or not?
- Unload idempotency: balance moved once or twice?

Key findings to record in API_BEHAVIOUR_FINDINGS.md:
- A4 (replay no double-charge): [CONFIRMED/REFUTED]
- A5 (different amount rejected): [CONFIRMED/REFUTED]
- A6 (TTL at least 24h): [unconfirmed in this session]
- A7 (per-account scope): [CONFIRMED/REFUTED]
=== END EXPLORE-2 ===
    `);
  });
});
