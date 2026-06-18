import { test, expect } from '../fixtures/api-fixtures.js';
import { BerkeleyClient } from '../support/api/berkeley-client.js';
import { newCardholder, createCardholderWithRetry } from '../support/utils/test-data.js';
import type { AccountBalance } from '../support/api/types.js';

/**
 * EXPLORE-1: Negative balance and amount boundary behaviour
 *
 * This exploration suite empirically tests what happens when unload amount
 * meets or exceeds available balance, and tests amount boundary values.
 *
 * Goal: Determine if negative balances are allowed and what error codes are returned
 * for invalid operations.
 */

test.describe('EXPLORE-1: Negative Balance & Amount Boundaries', () => {
  test('Setup: Create cardholder with known initial load', async ({ client }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          load_amount: 1000, // Start with 1000 units
        })
      )
    );

    const account = BerkeleyClient.unwrap<{ id: number }>(
      await cardholder.json()
    );

    const balance = await client.getAccountBalance(account.id);
    const balanceData = BerkeleyClient.unwrap<AccountBalance>(
      await balance.json()
    );

    console.log('[EXPLORE-1] Initial setup: account', account.id, 'balance:', balanceData.available_balance);
    expect.soft(parseInt(balanceData.available_balance)).toBe(1000);
  });

  test('Test: Unload exactly the available balance (should succeed)', async ({
    client,
  }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          load_amount: 5000,
        })
      )
    );

    const chData = BerkeleyClient.unwrap<{ id: number }>(
      await cardholder.json()
    );
    const accountId = chData.id;

    // Verify starting balance
    const balanceBefore = await client.getAccountBalance(accountId);
    const balanceBeforeData = BerkeleyClient.unwrap<AccountBalance>(
      await balanceBefore.json()
    );
    const unloadAmount = parseInt(balanceBeforeData.available_balance);

    // Unload exact amount
    const unload = await client.createValueUnload({
      account_id: accountId,
      amount: unloadAmount,
      external_tag: `unload-exact-${Date.now()}`,
      idempotency_key: `idem-exact-${Date.now()}`,
    });

    console.log('[EXPLORE-1] Unload exact balance: HTTP', unload.status());
    expect.soft(unload.status()).toBeLessThan(500);

    if (unload.status() === 201) {
      const balanceAfter = await client.getAccountBalance(accountId);
      const balanceAfterData = BerkeleyClient.unwrap<AccountBalance>(
        await balanceAfter.json()
      );
      console.log('[EXPLORE-1] Balance after exact unload:', balanceAfterData.available_balance);
      expect.soft(parseInt(balanceAfterData.available_balance)).toBe(0);
    }
  });

  test('Test: Unload 1 unit on zero-balance account', async ({ client }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          load_amount: 100,
        })
      )
    );

    const chData = BerkeleyClient.unwrap<{ id: number }>(
      await cardholder.json()
    );
    const accountId = chData.id;

    // Unload all funds first
    const unloadAll = await client.createValueUnload({
      account_id: accountId,
      amount: 100,
      external_tag: `unload-clear-${Date.now()}`,
      idempotency_key: `idem-clear-${Date.now()}`,
    });

    // Now try to unload 1 unit on zero balance
    const unloadOne = await client.createValueUnload({
      account_id: accountId,
      amount: 1,
      external_tag: `unload-1-${Date.now()}`,
      idempotency_key: `idem-1-${Date.now()}`,
    });

    console.log('[EXPLORE-1] Unload 1 unit on zero balance: HTTP', unloadOne.status());
    const responseBody = await unloadOne.text();
    if (unloadOne.status() >= 400) {
      console.log('[EXPLORE-1] Error response:', responseBody);
    }
    expect.soft(unloadOne.status()).toBeLessThan(500);
  });

  test('Test: Unload 100 units on zero-balance account', async ({ client }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          load_amount: 50,
        })
      )
    );

    const chData = BerkeleyClient.unwrap<{ id: number }>(
      await cardholder.json()
    );
    const accountId = chData.id;

    // Unload all funds first
    const unloadAll = await client.createValueUnload({
      account_id: accountId,
      amount: 50,
      external_tag: `unload-clear-100-${Date.now()}`,
      idempotency_key: `idem-clear-100-${Date.now()}`,
    });

    // Now try to unload 100 units on zero balance
    const unload100 = await client.createValueUnload({
      account_id: accountId,
      amount: 100,
      external_tag: `unload-100-${Date.now()}`,
      idempotency_key: `idem-100-${Date.now()}`,
    });

    console.log('[EXPLORE-1] Unload 100 units on zero balance: HTTP', unload100.status());
    const responseBody = await unload100.text();
    if (unload100.status() >= 400) {
      console.log('[EXPLORE-1] Error response:', responseBody);
    }
    expect.soft(unload100.status()).toBeLessThan(500);
  });

  test('Test: Check balance after over-unload attempts', async ({ client }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          load_amount: 200,
        })
      )
    );

    const chData = BerkeleyClient.unwrap<{ id: number }>(
      await cardholder.json()
    );
    const accountId = chData.id;

    // Try to unload more than balance
    const unloadOver = await client.createValueUnload({
      account_id: accountId,
      amount: 500,
      external_tag: `unload-over-${Date.now()}`,
      idempotency_key: `idem-over-${Date.now()}`,
    });

    console.log('[EXPLORE-1] Over-unload attempt: HTTP', unloadOver.status());

    // Check balance regardless of result
    const balance = await client.getAccountBalance(accountId);
    const balanceData = BerkeleyClient.unwrap<AccountBalance>(
      await balance.json()
    );
    console.log('[EXPLORE-1] Balance after over-unload attempt:', balanceData.available_balance);
    expect.soft(balanceData.available_balance).toBeDefined();
  });

  test('Test: Load on zero-balance account (should succeed from pool)', async ({
    client,
  }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          load_amount: 100,
        })
      )
    );

    const chData = BerkeleyClient.unwrap<{ id: number }>(
      await cardholder.json()
    );
    const accountId = chData.id;

    // Unload all
    await client.createValueUnload({
      account_id: accountId,
      amount: 100,
      external_tag: `unload-for-load-test-${Date.now()}`,
      idempotency_key: `idem-for-load-test-${Date.now()}`,
    });

    // Load on zero balance
    const load = await client.createValueLoad({
      account_id: accountId,
      amount: 500,
      external_tag: `load-on-zero-${Date.now()}`,
      idempotency_key: `idem-load-on-zero-${Date.now()}`,
    });

    console.log('[EXPLORE-1] Load on zero-balance account: HTTP', load.status());
    expect.soft(load.status()).toBe(201);

    const balance = await client.getAccountBalance(accountId);
    const balanceData = BerkeleyClient.unwrap<AccountBalance>(
      await balance.json()
    );
    console.log('[EXPLORE-1] Balance after load on zero:', balanceData.available_balance);
  });

  test('Test: Amount = 0 load', async ({ client }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder())
    );

    const chData = BerkeleyClient.unwrap<{ id: number }>(
      await cardholder.json()
    );
    const accountId = chData.id;

    const load = await client.createValueLoad({
      account_id: accountId,
      amount: 0,
      external_tag: `load-zero-${Date.now()}`,
      idempotency_key: `idem-zero-${Date.now()}`,
    });

    console.log('[EXPLORE-1] Load with amount = 0: HTTP', load.status());
    expect.soft(load.status()).toBeLessThan(500);
  });

  test('Test: Amount = -1 load (should fail)', async ({ client }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder())
    );

    const chData = BerkeleyClient.unwrap<{ id: number }>(
      await cardholder.json()
    );
    const accountId = chData.id;

    const load = await client.createValueLoad({
      account_id: accountId,
      amount: -1,
      external_tag: `load-negative-${Date.now()}`,
      idempotency_key: `idem-negative-${Date.now()}`,
    });

    console.log('[EXPLORE-1] Load with amount = -1: HTTP', load.status());
    const responseBody = await load.text();
    if (load.status() >= 400) {
      console.log('[EXPLORE-1] Error response:', responseBody);
    }
    expect.soft(load.status()).toBeGreaterThanOrEqual(400);
  });

  test('Test: Very large amount (99999999)', async ({ client }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder())
    );

    const chData = BerkeleyClient.unwrap<{ id: number }>(
      await cardholder.json()
    );
    const accountId = chData.id;

    const load = await client.createValueLoad({
      account_id: accountId,
      amount: 99999999,
      external_tag: `load-large-${Date.now()}`,
      idempotency_key: `idem-large-${Date.now()}`,
    });

    console.log('[EXPLORE-1] Load with amount = 99999999: HTTP', load.status());
    expect.soft(load.status()).toBeLessThan(500);

    if (load.status() === 201) {
      const balance = await client.getAccountBalance(accountId);
      const balanceData = BerkeleyClient.unwrap<AccountBalance>(
        await balance.json()
      );
      console.log('[EXPLORE-1] Balance after large load:', balanceData.available_balance);
    }
  });

  test('Summary: EXPLORE-1 Results', async ({ client }) => {
    console.log(`
=== EXPLORE-1 RESULTS SUMMARY ===
Check the logs above for:
- Unload exact balance status
- Unload 1 on zero status
- Unload 100 on zero status
- Balance after over-unload (shows if negative balances exist)
- Load on zero-balance account status
- Amount = 0 load status
- Amount = -1 load status + error code
- Amount = 99999999 load status

Key findings to record in API_BEHAVIOUR_FINDINGS.md:
- A1 (negative balance rejection): [CONFIRMED/REFUTED]
- A2 (error code for insufficient funds): [value or N/A]
- A3 (negative balance format): [value or N/A]
- A13 (large amount limits): [CONFIRMED/REFUTED]
- A14 (amount = 0): [CONFIRMED/REFUTED]
=== END EXPLORE-1 ===
    `);
  });
});
