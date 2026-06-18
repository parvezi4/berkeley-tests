import { type APIRequestContext } from '@playwright/test';
import { BerkeleyClient } from '../support/api/berkeley-client.js';
import { newCardholder, uniqueTag } from '../support/utils/test-data.js';
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
 */
export async function createFreshAccount(
  request: APIRequestContext,
  loadAmount = 5000,
) {
  const client = new BerkeleyClient(request);

  const createRes = await client.createCardholder(
    newCardholder({ load_amount: loadAmount }),
  );
  if (createRes.status() !== 201) {
    throw new Error(
      `createFreshAccount: cardholder creation failed ` +
      `${createRes.status()}: ${await createRes.text()}`,
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
