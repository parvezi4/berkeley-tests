import { type APIRequestContext } from '@playwright/test';
import { setTimeout as delay } from 'timers/promises';
import { BerkeleyClient } from '../support/api/berkeley-client.js';
import { newCardholder } from '../support/utils/test-data.js';
import type { CreateCardholderResponse, Account } from '../support/api/types.js';

/**
 * Creates a brand-new cardholder + resolves account for a single test.
 *
 * Use this instead of the shared `seededAccount` fixture whenever:
 *  - the test will change account status (suspend / mark_lost / mark_stolen)
 *  - the test will consume or drain the full balance
 *  - the test belongs to an exploration, boundary, or transition suite
 *
 * Each call creates an independent cardholder. Terminal state changes on one
 * account cannot affect any other test.
 *
 * Includes retry logic with exponential backoff to handle transient 500 errors
 * from the staging API.
 */
export async function createFreshAccount(
  request: APIRequestContext,
  loadAmount = 5000,
) {
  const client = new BerkeleyClient(request);

  let createRes = await client.createCardholder(
    newCardholder({ load_amount: loadAmount }),
  );
  let lastError = '';

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (createRes.status() === 201) break;

    // If 5xx error, retry with exponential backoff
    if (createRes.status() >= 500 && attempt < 3) {
      const waitMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
      lastError = `Attempt ${attempt}: ${createRes.status()} — retrying in ${waitMs}ms`;
      await delay(waitMs);
      createRes = await client.createCardholder(
        newCardholder({ load_amount: loadAmount }),
      );
      continue;
    }

    // Non-5xx error: fail immediately (client error)
    lastError = `Attempt ${attempt}: ${createRes.status()} ${await createRes.text()}`;
    break;
  }

  if (createRes.status() !== 201) {
    throw new Error(
      `createFreshAccount: cardholder creation failed ` +
      `(all retries exhausted): ${lastError}`,
    );
  }
  const created = BerkeleyClient.unwrap<CreateCardholderResponse>(
    await createRes.json(),
  );

  const acctRes = await client.getAccountByProcessorReference(
    created.primary_processor_reference,
  );
  if (!acctRes.ok()) {
    throw new Error(
      `createFreshAccount: account lookup failed ` +
      `${acctRes.status()}: ${await acctRes.text()}`,
    );
  }
  const account = BerkeleyClient.unwrap<Account>(await acctRes.json());

  let lastFourDigits: string | undefined;
  const detailRes = await client.getAccount(account.id);
  if (detailRes.ok()) {
    const detail = BerkeleyClient.unwrap<Account>(await detailRes.json());
    lastFourDigits = detail.cards?.[0]?.last_four_digits;
  }

  return {
    client,
    cardholderId: created.id,
    processorReference: created.primary_processor_reference,
    accountId: account.id,
    lastFourDigits,
    startingBalance: loadAmount,
  };
}
