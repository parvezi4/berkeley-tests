import { test as base, expect, type APIResponse } from '@playwright/test';
import { setTimeout as delay } from 'timers/promises';
import { BerkeleyClient } from '../support/api/berkeley-client.js';
import { newCardholder } from '../support/utils/test-data.js';
import type { Account, CreateCardholderResponse } from '../support/api/types.js';

/**
 * Shared fixtures.
 *
 *  - `client`     : a typed BerkeleyClient bound to Playwright's request context.
 *  - `seededAccount`: a freshly created cardholder + resolved account, for tests
 *                     that need an existing account (accounts, value-loads).
 *
 * `seededAccount` chains three real calls — create cardholder, resolve the
 * account by processor reference, read the account — exactly as a consumer
 * integration would, so the fixture itself exercises the happy path.
 */
interface Fixtures {
  client: BerkeleyClient;
  seededAccount: {
    cardholderId: number;
    processorReference: string;
    accountId: number;
    lastFourDigits?: string;
  };
}

export const test = base.extend<Fixtures>({
  client: async ({ request }, use) => {
    await use(new BerkeleyClient(request));
  },

  seededAccount: async ({ client }, use) => {
    // 1. Create a cardholder (also creates the primary account + initial load).
    // Retry with exponential backoff on server errors (500s) to handle:
    // - Temporary server overload (parallel test projects)
    // - Rate limiting on cardholder creation
    // - Staging environment flakiness
    let createRes = await client.createCardholder(newCardholder());
    let lastError: string = '';

    for (let attempt = 1; attempt <= 3; attempt++) {
      if (createRes.status() === 201) break;

      // If 5xx error, retry with exponential backoff
      if (createRes.status() >= 500 && attempt < 3) {
        const waitMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
        lastError = `Attempt ${attempt}: ${createRes.status()} — retrying in ${waitMs}ms`;
        await delay(waitMs);
        createRes = await client.createCardholder(newCardholder());
        continue;
      }

      // Non-5xx error: fail immediately (client error)
      lastError = `Attempt ${attempt}: ${createRes.status()} ${await safeText(createRes)}`;
      break;
    }

    expect(
      createRes.status(),
      `Cardholder creation failed (all retries exhausted): ${lastError}`,
    ).toBe(201);
    const created = BerkeleyClient.unwrap<CreateCardholderResponse>(await createRes.json());

    // 2. Resolve the numeric account id from the processor reference.
    const acctRes = await client.getAccountByProcessorReference(created.primary_processor_reference);
    expect(acctRes.ok(), `Account lookup failed: ${acctRes.status()}`).toBeTruthy();
    const account = BerkeleyClient.unwrap<Account>(await acctRes.json());

    // 3. Read the account to pick up a card's last four (best-effort).
    let lastFour: string | undefined;
    const detailRes = await client.getAccount(account.id);
    if (detailRes.ok()) {
      const detail = BerkeleyClient.unwrap<Account>(await detailRes.json());
      lastFour = detail.cards?.[0]?.last_four_digits;
    }

    await use({
      cardholderId: created.id,
      processorReference: created.primary_processor_reference,
      accountId: account.id,
      lastFourDigits: lastFour,
    });
  },
});

async function safeText(res: APIResponse): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '<no body>';
  }
}

export { expect };
