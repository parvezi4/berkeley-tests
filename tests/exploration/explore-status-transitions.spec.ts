import { test, expect } from '../fixtures/api-fixtures.js';
import { BerkeleyClient } from '../support/api/berkeley-client.js';
import { newCardholder, createCardholderWithRetry } from '../support/utils/test-data.js';
import type { AccountDetail, Account } from '../support/api/types.js';

/**
 * EXPLORE-3: Status transition matrix
 *
 * This exploration suite empirically maps every valid and invalid status transition,
 * capturing HTTP status codes and error details for each path.
 *
 * Goal: Build a complete state transition matrix with error codes for invalid transitions.
 */

test.describe('EXPLORE-3: Status Transition Matrix', () => {
  test('Path A.1: active → suspend', async ({ client }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder())
    );

    const chData = BerkeleyClient.unwrap<{ id: number }>(
      await cardholder.json()
    );
    const accountId = chData.id;

    // Get last four digits for status change
    const account = await client.getAccount(accountId);
    const accountData = BerkeleyClient.unwrap<AccountDetail>(
      await account.json()
    );
    const lastFour = accountData.cards?.[0]?.last_four_digits || '0000';

    const suspend = await client.modifyAccountStatus(
      accountId,
      'suspend',
      lastFour
    );

    console.log('[EXPLORE-3] active → suspend: HTTP', suspend.status());
    const body = await suspend.text();
    if (suspend.status() >= 400) {
      console.log('[EXPLORE-3] Error:', body);
    }
    expect.soft(suspend.status()).toBeLessThan(500);
  });

  test('Path A.2: active → unsuspend (expect error)', async ({ client }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder())
    );

    const chData = BerkeleyClient.unwrap<{ id: number }>(
      await cardholder.json()
    );
    const accountId = chData.id;

    const account = await client.getAccount(accountId);
    const accountData = BerkeleyClient.unwrap<AccountDetail>(
      await account.json()
    );
    const lastFour = accountData.cards?.[0]?.last_four_digits || '0000';

    const unsuspend = await client.modifyAccountStatus(
      accountId,
      'unsuspend',
      lastFour
    );

    console.log('[EXPLORE-3] active → unsuspend: HTTP', unsuspend.status());
    const body = await unsuspend.text();
    if (unsuspend.status() >= 400) {
      console.log('[EXPLORE-3] Error:', body);
    }
  });

  test('Path A.3: active → mark_card_active', async ({ client }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder())
    );

    const chData = BerkeleyClient.unwrap<{ id: number }>(
      await cardholder.json()
    );
    const accountId = chData.id;

    const account = await client.getAccount(accountId);
    const accountData = BerkeleyClient.unwrap<AccountDetail>(
      await account.json()
    );
    const lastFour = accountData.cards?.[0]?.last_four_digits || '0000';

    const markActive = await client.modifyAccountStatus(
      accountId,
      'mark_card_active',
      lastFour
    );

    console.log('[EXPLORE-3] active → mark_card_active: HTTP', markActive.status());
    const body = await markActive.text();
    if (markActive.status() >= 400) {
      console.log('[EXPLORE-3] Error:', body);
    }
  });

  test('Path A.4: active → mark_card_lost (terminal)', async ({ client }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder())
    );

    const chData = BerkeleyClient.unwrap<{ id: number }>(
      await cardholder.json()
    );
    const accountId = chData.id;

    const account = await client.getAccount(accountId);
    const accountData = BerkeleyClient.unwrap<AccountDetail>(
      await account.json()
    );
    const lastFour = accountData.cards?.[0]?.last_four_digits || '0000';

    const markLost = await client.modifyAccountStatus(
      accountId,
      'mark_card_lost',
      lastFour
    );

    console.log('[EXPLORE-3] active → mark_card_lost: HTTP', markLost.status());
    expect.soft(markLost.status()).toBeLessThan(500);
  });

  test('Path A.5: active → mark_card_stolen (terminal)', async ({ client }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder())
    );

    const chData = BerkeleyClient.unwrap<{ id: number }>(
      await cardholder.json()
    );
    const accountId = chData.id;

    const account = await client.getAccount(accountId);
    const accountData = BerkeleyClient.unwrap<AccountDetail>(
      await account.json()
    );
    const lastFour = accountData.cards?.[0]?.last_four_digits || '0000';

    const markStolen = await client.modifyAccountStatus(
      accountId,
      'mark_card_stolen',
      lastFour
    );

    console.log('[EXPLORE-3] active → mark_card_stolen: HTTP', markStolen.status());
    expect.soft(markStolen.status()).toBeLessThan(500);
  });

  test('Path B.1: suspended → unsuspend', async ({ client }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder())
    );

    const chData = BerkeleyClient.unwrap<{ id: number }>(
      await cardholder.json()
    );
    const accountId = chData.id;

    const account = await client.getAccount(accountId);
    const accountData = BerkeleyClient.unwrap<AccountDetail>(
      await account.json()
    );
    const lastFour = accountData.cards?.[0]?.last_four_digits || '0000';

    // First suspend
    await client.modifyAccountStatus(accountId, 'suspend', lastFour);

    // Then unsuspend
    const unsuspend = await client.modifyAccountStatus(
      accountId,
      'unsuspend',
      lastFour
    );

    console.log('[EXPLORE-3] suspended → unsuspend: HTTP', unsuspend.status());
    expect.soft(unsuspend.status()).toBeLessThan(500);
  });

  test('Path B.2: suspend → suspend again (idempotent or error?)', async ({
    client,
  }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder())
    );

    const chData = BerkeleyClient.unwrap<{ id: number }>(
      await cardholder.json()
    );
    const accountId = chData.id;

    const account = await client.getAccount(accountId);
    const accountData = BerkeleyClient.unwrap<AccountDetail>(
      await account.json()
    );
    const lastFour = accountData.cards?.[0]?.last_four_digits || '0000';

    // First suspend
    const suspend1 = await client.modifyAccountStatus(
      accountId,
      'suspend',
      lastFour
    );

    // Try to suspend again
    const suspend2 = await client.modifyAccountStatus(
      accountId,
      'suspend',
      lastFour
    );

    console.log('[EXPLORE-3] suspend → suspend again: HTTP', suspend2.status());
    const body = await suspend2.text();
    if (suspend2.status() >= 400) {
      console.log('[EXPLORE-3] Error:', body);
    }
  });

  test('Path B.3: suspended → mark_card_lost', async ({ client }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder())
    );

    const chData = BerkeleyClient.unwrap<{ id: number }>(
      await cardholder.json()
    );
    const accountId = chData.id;

    const account = await client.getAccount(accountId);
    const accountData = BerkeleyClient.unwrap<AccountDetail>(
      await account.json()
    );
    const lastFour = accountData.cards?.[0]?.last_four_digits || '0000';

    // First suspend
    await client.modifyAccountStatus(accountId, 'suspend', lastFour);

    // Then mark lost
    const markLost = await client.modifyAccountStatus(
      accountId,
      'mark_card_lost',
      lastFour
    );

    console.log('[EXPLORE-3] suspended → mark_card_lost: HTTP', markLost.status());
    expect.soft(markLost.status()).toBeLessThan(500);
  });

  test('Path C.1: lost → GET balance (terminal state reads)', async ({
    client,
  }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder())
    );

    const chData = BerkeleyClient.unwrap<{ id: number }>(
      await cardholder.json()
    );
    const accountId = chData.id;

    const account = await client.getAccount(accountId);
    const accountData = BerkeleyClient.unwrap<AccountDetail>(
      await account.json()
    );
    const lastFour = accountData.cards?.[0]?.last_four_digits || '0000';

    // Mark lost
    await client.modifyAccountStatus(accountId, 'mark_card_lost', lastFour);

    // Try to get balance on lost card
    const balance = await client.getAccountBalance(accountId);

    console.log('[EXPLORE-3] lost → GET balance: HTTP', balance.status());
    if (balance.status() === 200) {
      const body = await balance.json();
      console.log('[EXPLORE-3] Balance returned:', body);
    }
    expect.soft(balance.status()).toBeLessThan(500);
  });

  test('Path C.2: lost → GET transactions', async ({ client }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder())
    );

    const chData = BerkeleyClient.unwrap<{ id: number }>(
      await cardholder.json()
    );
    const accountId = chData.id;

    const account = await client.getAccount(accountId);
    const accountData = BerkeleyClient.unwrap<AccountDetail>(
      await account.json()
    );
    const lastFour = accountData.cards?.[0]?.last_four_digits || '0000';

    // Mark lost
    await client.modifyAccountStatus(accountId, 'mark_card_lost', lastFour);

    // Try to get transactions on lost card
    const txns = await client.getAccountTransactions(accountId);

    console.log('[EXPLORE-3] lost → GET transactions: HTTP', txns.status());
    expect.soft(txns.status()).toBeLessThan(500);
  });

  test('Path C.3: lost → GET account details', async ({ client }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder())
    );

    const chData = BerkeleyClient.unwrap<{ id: number }>(
      await cardholder.json()
    );
    const accountId = chData.id;

    const account = await client.getAccount(accountId);
    const accountData = BerkeleyClient.unwrap<AccountDetail>(
      await account.json()
    );
    const lastFour = accountData.cards?.[0]?.last_four_digits || '0000';

    // Mark lost
    await client.modifyAccountStatus(accountId, 'mark_card_lost', lastFour);

    // Get account details
    const details = await client.getAccount(accountId);

    console.log('[EXPLORE-3] lost → GET account details: HTTP', details.status());
    if (details.status() === 200) {
      const data = BerkeleyClient.unwrap<AccountDetail>(await details.json());
      console.log('[EXPLORE-3] Account status_code on lost card:', data.status_code);
    }
    expect.soft(details.status()).toBeLessThan(500);
  });

  test('Path C.4: lost → attempt load (operations blocked?)', async ({
    client,
  }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder())
    );

    const chData = BerkeleyClient.unwrap<{ id: number }>(
      await cardholder.json()
    );
    const accountId = chData.id;

    const account = await client.getAccount(accountId);
    const accountData = BerkeleyClient.unwrap<AccountDetail>(
      await account.json()
    );
    const lastFour = accountData.cards?.[0]?.last_four_digits || '0000';

    // Mark lost
    await client.modifyAccountStatus(accountId, 'mark_card_lost', lastFour);

    // Try to load on lost card
    const load = await client.createValueLoad({
      account_id: accountId,
      amount: 100,
      external_tag: `load-on-lost-${Date.now()}`,
      idempotency_key: `idem-lost-${Date.now()}`,
    });

    console.log('[EXPLORE-3] lost → attempt load: HTTP', load.status());
    const body = await load.text();
    if (load.status() >= 400) {
      console.log('[EXPLORE-3] Error:', body);
    }
  });

  test('Path C.5: lost → unsuspend (terminal block)', async ({ client }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder())
    );

    const chData = BerkeleyClient.unwrap<{ id: number }>(
      await cardholder.json()
    );
    const accountId = chData.id;

    const account = await client.getAccount(accountId);
    const accountData = BerkeleyClient.unwrap<AccountDetail>(
      await account.json()
    );
    const lastFour = accountData.cards?.[0]?.last_four_digits || '0000';

    // Mark lost
    await client.modifyAccountStatus(accountId, 'mark_card_lost', lastFour);

    // Try to unsuspend (should fail — not suspended and terminal)
    const unsuspend = await client.modifyAccountStatus(
      accountId,
      'unsuspend',
      lastFour
    );

    console.log('[EXPLORE-3] lost → unsuspend: HTTP', unsuspend.status());
    const body = await unsuspend.text();
    if (unsuspend.status() >= 400) {
      console.log('[EXPLORE-3] Error:', body);
    }
  });

  test('Summary: EXPLORE-3 Results', async ({ client }) => {
    console.log(`
=== EXPLORE-3 RESULTS SUMMARY ===
Status Transition Matrix (record HTTP status for each):

From       | Action           | HTTP Status
-----------|------------------|-------------
active     | suspend          | [see log]
active     | unsuspend        | [see log]
active     | mark_card_active | [see log]
active     | mark_card_lost   | [see log]
active     | mark_card_stolen | [see log]
suspended  | unsuspend        | [see log]
suspended  | suspend again    | [see log]
suspended  | mark_card_lost   | [see log]
lost       | GET balance      | [see log]
lost       | GET transactions | [see log]
lost       | GET details      | [see log]
lost       | load             | [see log]
lost       | unsuspend        | [see log]

Key findings to record in API_BEHAVIOUR_FINDINGS.md:
- A8 (wrong-state suspend/unsuspend returns 4xx): [CONFIRMED/REFUTED]
- A9 (mark_lost available from any state): [CONFIRMED/REFUTED]
- A10 (GET reads work on terminal accounts): [CONFIRMED/REFUTED]
=== END EXPLORE-3 ===
    `);
  });
});
