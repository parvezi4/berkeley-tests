import { test, expect } from '../fixtures/api-fixtures.js';
import { BerkeleyClient } from '../support/api/berkeley-client.js';
import { newCardholder, createCardholderWithRetry } from '../support/utils/test-data.js';
import type { CreateCardholderResponse } from '../support/api/types.js';

/**
 * EXPLORE-4: Field validation — formats, lengths, and type coercion
 *
 * This exploration suite empirically characterises what the API enforces vs.
 * what it accepts leniently. Uses read-back (create → GET → compare) to verify
 * what was actually persisted.
 *
 * Goal: Establish enforcement rules for date formats, field lengths, and type coercion.
 */

test.describe('EXPLORE-4: Field Validation (Formats, Lengths, Type Coercion)', () => {
  test('Section A.1: date_of_birth dd-MM-yyyy on Update (same as Create)', async ({
    client,
  }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder())
    );

    const chData = BerkeleyClient.unwrap<CreateCardholderResponse>(
      await cardholder.json()
    );
    const chId = chData.id;

    // Try update with dd-MM-yyyy
    const update = await client.updateCardholder(chId, {
      date_of_birth: '15-06-1990', // dd-MM-yyyy
    });

    console.log('[EXPLORE-4] date_of_birth dd-MM-yyyy on Update: HTTP', update.status());
    const body = await update.text();
    if (update.status() >= 400) {
      console.log('[EXPLORE-4] Error:', body);
    }

    // If successful, GET and check persisted value
    if (update.status() < 400) {
      const getCh = await client.getCardholder(chId);
      const getChData = BerkeleyClient.unwrap<CreateCardholderResponse>(
        await getCh.json()
      );
      console.log('[EXPLORE-4] Persisted date_of_birth:', getChData.date_of_birth || 'not returned');
    }
  });

  test('Section A.2: date_of_birth YYYY-MM-DD on Update (docs text format)', async ({
    client,
  }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder())
    );

    const chData = BerkeleyClient.unwrap<CreateCardholderResponse>(
      await cardholder.json()
    );
    const chId = chData.id;

    // Try update with YYYY-MM-DD
    const update = await client.updateCardholder(chId, {
      date_of_birth: '1990-06-15', // YYYY-MM-DD
    });

    console.log('[EXPLORE-4] date_of_birth YYYY-MM-DD on Update: HTTP', update.status());
    const body = await update.text();
    if (update.status() >= 400) {
      console.log('[EXPLORE-4] Error:', body);
    } else {
      const getCh = await client.getCardholder(chId);
      const getChData = BerkeleyClient.unwrap<CreateCardholderResponse>(
        await getCh.json()
      );
      console.log('[EXPLORE-4] Persisted date_of_birth:', getChData.date_of_birth || 'not returned');
    }
  });

  test('Section A.3: date_of_birth ISO timestamp on Update', async ({ client }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder())
    );

    const chData = BerkeleyClient.unwrap<CreateCardholderResponse>(
      await cardholder.json()
    );
    const chId = chData.id;

    // Try update with ISO timestamp
    const update = await client.updateCardholder(chId, {
      date_of_birth: '1990-06-15T00:00:00.000Z', // ISO 8601 timestamp
    });

    console.log('[EXPLORE-4] date_of_birth ISO timestamp on Update: HTTP', update.status());
    const body = await update.text();
    if (update.status() >= 400) {
      console.log('[EXPLORE-4] Error:', body);
    } else {
      const getCh = await client.getCardholder(chId);
      const getChData = BerkeleyClient.unwrap<CreateCardholderResponse>(
        await getCh.json()
      );
      console.log('[EXPLORE-4] Persisted date_of_birth:', getChData.date_of_birth || 'not returned');
    }
  });

  test('Section A.4: date_of_birth invalid format YYYY/MM/DD', async ({
    client,
  }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder())
    );

    const chData = BerkeleyClient.unwrap<CreateCardholderResponse>(
      await cardholder.json()
    );
    const chId = chData.id;

    // Try invalid format
    const update = await client.updateCardholder(chId, {
      date_of_birth: '1990/06/15', // wrong separator
    });

    console.log('[EXPLORE-4] date_of_birth YYYY/MM/DD (invalid): HTTP', update.status());
    const body = await update.text();
    if (update.status() >= 400) {
      console.log('[EXPLORE-4] Error:', body);
    }
  });

  test('Section B.1: first_name with 30 characters (US limit?)', async ({
    client,
  }) => {
    const name30 = 'a'.repeat(30);

    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          first_name: name30,
        })
      )
    );

    console.log('[EXPLORE-4] first_name 30 chars: HTTP', cardholder.status());

    if (cardholder.status() === 201) {
      const chData = BerkeleyClient.unwrap<CreateCardholderResponse>(
        await cardholder.json()
      );
      const chId = chData.id;

      const getCh = await client.getCardholder(chId);
      const getChData = BerkeleyClient.unwrap<CreateCardholderResponse>(
        await getCh.json()
      );
      const persistedName = getChData.first_name || '';
      console.log('[EXPLORE-4] Submitted 30 chars, persisted length:', persistedName.length);
      console.log('[EXPLORE-4] Persisted value:', persistedName.substring(0, 30));
    }
  });

  test('Section B.2: first_name with 51 characters (over limit)', async ({
    client,
  }) => {
    const name51 = 'b'.repeat(51);

    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          first_name: name51,
        })
      )
    );

    console.log('[EXPLORE-4] first_name 51 chars: HTTP', cardholder.status());

    if (cardholder.status() === 201) {
      const chData = BerkeleyClient.unwrap<CreateCardholderResponse>(
        await cardholder.json()
      );
      const chId = chData.id;

      const getCh = await client.getCardholder(chId);
      const getChData = BerkeleyClient.unwrap<CreateCardholderResponse>(
        await getCh.json()
      );
      const persistedName = getChData.first_name || '';
      console.log('[EXPLORE-4] Submitted 51 chars, persisted length:', persistedName.length);
      console.log('[EXPLORE-4] Was truncated?', persistedName.length < 51);
      console.log('[EXPLORE-4] Persisted value:', persistedName.substring(0, 30));
    }
  });

  test('Section B.3: first_name with 100 characters (well over)', async ({
    client,
  }) => {
    const name100 = 'c'.repeat(100);

    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          first_name: name100,
        })
      )
    );

    console.log('[EXPLORE-4] first_name 100 chars: HTTP', cardholder.status());

    if (cardholder.status() === 201) {
      const chData = BerkeleyClient.unwrap<CreateCardholderResponse>(
        await cardholder.json()
      );
      const chId = chData.id;

      const getCh = await client.getCardholder(chId);
      const getChData = BerkeleyClient.unwrap<CreateCardholderResponse>(
        await getCh.json()
      );
      const persistedName = getChData.first_name || '';
      console.log('[EXPLORE-4] Submitted 100 chars, persisted length:', persistedName.length);
      console.log('[EXPLORE-4] Was truncated?', persistedName.length < 100);
    }
  });

  test('Section C.1: phone omitted for Canadian program', async ({ client }) => {
    // Omit phone field entirely
    const payload = newCardholder();
    delete (payload as any).phone;

    const cardholder = await client.createCardholder(payload);

    console.log('[EXPLORE-4] phone omitted (Canada): HTTP', cardholder.status());
    const body = await cardholder.text();
    if (cardholder.status() >= 400) {
      console.log('[EXPLORE-4] Error:', body);
    } else {
      console.log('[EXPLORE-4] Accepted without phone');
    }
  });

  test('Section C.2: phone empty string', async ({ client }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          phone: '', // empty string
        })
      )
    );

    console.log('[EXPLORE-4] phone empty string: HTTP', cardholder.status());
    if (cardholder.status() >= 400) {
      const body = await cardholder.text();
      console.log('[EXPLORE-4] Error:', body);
    }
  });

  test('Section C.3: phone too short', async ({ client }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(
        newCardholder({
          phone: '123', // too short
        })
      )
    );

    console.log('[EXPLORE-4] phone too short (123): HTTP', cardholder.status());
    if (cardholder.status() >= 400) {
      const body = await cardholder.text();
      console.log('[EXPLORE-4] Error:', body);
    }
  });

  test('Section D.1: amount as string "100"', async ({ client }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder())
    );

    const chData = BerkeleyClient.unwrap<CreateCardholderResponse>(
      await cardholder.json()
    );
    const accountId = chData.id;

    const load = await client.createValueLoad({
      account_id: accountId,
      amount: '100' as any, // string instead of integer
      external_tag: `amount-string-${Date.now()}`,
      idempotency_key: `idem-string-${Date.now()}`,
    });

    console.log('[EXPLORE-4] amount as string "100": HTTP', load.status());
    expect.soft(load.status()).toBeLessThan(500);

    if (load.status() === 201) {
      const balance = await client.getAccountBalance(accountId);
      const balanceData = BerkeleyClient.unwrap<any>(await balance.json());
      console.log('[EXPLORE-4] Balance after string amount load:', balanceData.available_balance);
    }
  });

  test('Section D.2: amount as float 100.5', async ({ client }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder())
    );

    const chData = BerkeleyClient.unwrap<CreateCardholderResponse>(
      await cardholder.json()
    );
    const accountId = chData.id;

    const load = await client.createValueLoad({
      account_id: accountId,
      amount: 100.5, // float
      external_tag: `amount-float-${Date.now()}`,
      idempotency_key: `idem-float-${Date.now()}`,
    });

    console.log('[EXPLORE-4] amount as float 100.5: HTTP', load.status());
    const body = await load.text();
    if (load.status() >= 400) {
      console.log('[EXPLORE-4] Error:', body);
    }

    if (load.status() === 201) {
      const balance = await client.getAccountBalance(accountId);
      const balanceData = BerkeleyClient.unwrap<any>(await balance.json());
      console.log('[EXPLORE-4] Balance after float amount (stored as):', balanceData.available_balance);
    }
  });

  test('Section D.3: amount as null', async ({ client }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder())
    );

    const chData = BerkeleyClient.unwrap<CreateCardholderResponse>(
      await cardholder.json()
    );
    const accountId = chData.id;

    const load = await client.createValueLoad({
      account_id: accountId,
      amount: null as any,
      external_tag: `amount-null-${Date.now()}`,
      idempotency_key: `idem-null-${Date.now()}`,
    });

    console.log('[EXPLORE-4] amount as null: HTTP', load.status());
    const body = await load.text();
    if (load.status() >= 400) {
      console.log('[EXPLORE-4] Error:', body);
    }
  });

  test('Section D.4: amount as non-numeric string "abc"', async ({ client }) => {
    const cardholder = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder())
    );

    const chData = BerkeleyClient.unwrap<CreateCardholderResponse>(
      await cardholder.json()
    );
    const accountId = chData.id;

    const load = await client.createValueLoad({
      account_id: accountId,
      amount: 'abc' as any,
      external_tag: `amount-abc-${Date.now()}`,
      idempotency_key: `idem-abc-${Date.now()}`,
    });

    console.log('[EXPLORE-4] amount as "abc": HTTP', load.status());
    const body = await load.text();
    if (load.status() >= 400) {
      console.log('[EXPLORE-4] Error:', body);
    }
  });

  test('Summary: EXPLORE-4 Results', async ({ client }) => {
    console.log(`
=== EXPLORE-4 RESULTS SUMMARY ===
Check the logs above for:

[date_of_birth on Update]
- dd-MM-yyyy format: [status] persisted as: [value]
- YYYY-MM-DD format: [status] persisted as: [value]
- ISO timestamp format: [status] persisted as: [value]
- Invalid format YYYY/MM/DD: [status]
→ Correct format is: [ANSWER]

[Field length enforcement (first_name)]
- 30 chars: [status] persisted length: [value]
- 51 chars: [status] persisted length: [value] (truncated?)
- 100 chars: [status] persisted length: [value]
→ Enforcement: [HARD (4xx) / SOFT-TRUNCATE / SOFT-ACCEPT]

[phone field requirement]
- phone omitted: [status]
- phone empty: [status]
- phone short (123): [status]
→ Phone required for CA: [YES/NO]

[amount type coercion]
- amount "100" (string): [status] balance: [value]
- amount 100.5 (float): [status] balance: [value]
- amount null: [status]
- amount "abc": [status]
→ Coercion: [INTENTIONAL / PARTIAL / STRICT]

Key findings to record in API_BEHAVIOUR_FINDINGS.md:
- A11-A12 (field lengths): [CONFIRMED/REFUTED]
- A15 (type coercion): [CONFIRMED/REFUTED]
- A17 (date_of_birth format): [CONFIRMED/REFUTED]
=== END EXPLORE-4 ===
    `);
  });
});
