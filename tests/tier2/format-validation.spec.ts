import { test, expect } from '@playwright/test';
import { BerkeleyClient } from '../support/api/berkeley-client.js';
import { newCardholder, uniqueTag } from '../support/utils/test-data.js';

test.describe('Format Validation', () => {
  test.describe('date_of_birth — confirmed format: dd-MM-yyyy', () => {
    test('dd-MM-yyyy accepted on Create Cardholder @smoke', async ({ request }) => {
      const client = new BerkeleyClient(request);
      let res = await client.createCardholder(
        newCardholder({ date_of_birth: '15-06-1990' }),
      );
      // Retry once if we hit a transient 500
      if (res.status() === 500) {
        await new Promise((r) => setTimeout(r, 1000));
        res = await client.createCardholder(
          newCardholder({ date_of_birth: '15-06-1990' }),
        );
      }
      expect(res.status()).toBe(201);
    });

    test('dd-MM-yyyy accepted on Update Cardholder', async ({ request }) => {
      const client = new BerkeleyClient(request);
      const create = await client.createCardholder(newCardholder());
      const { id } = BerkeleyClient.unwrap<{ id: number }>(await create.json());

      const update = await client.updateCardholder(id, { date_of_birth: '15-06-1990' });
      expect([200, 201]).toContain(update.status());
    });

    test.describe('BUG-1: doc says YYYY-MM-DD but API requires dd-MM-yyyy', () => {
      // These tests DOCUMENT the known bug, they are expected to fail on the
      // formats the docs claim are correct.

      test('[negative] YYYY-MM-DD rejected on Update — docs are wrong (BUG-1)', async ({
        request,
      }) => {
        const client = new BerkeleyClient(request);
        const create = await client.createCardholder(newCardholder());
        const { id } = BerkeleyClient.unwrap<{ id: number }>(await create.json());

        const update = await client.updateCardholder(id, { date_of_birth: '1990-06-15' });
        expect(update.status(), 'YYYY-MM-DD must be rejected — this confirms BUG-1').toBeGreaterThanOrEqual(
          400,
        );
      });

      test('[negative] ISO timestamp rejected on Update — OpenAPI example is also wrong (BUG-1)', async ({
        request,
      }) => {
        const client = new BerkeleyClient(request);
        const create = await client.createCardholder(newCardholder());
        const { id } = BerkeleyClient.unwrap<{ id: number }>(await create.json());

        const update = await client.updateCardholder(id, {
          date_of_birth: '1990-06-15T00:00:00.000Z',
        });
        expect(update.status()).toBeGreaterThanOrEqual(400);
      });
    });
  });

  test.describe('Phone — required for Canadian programs', () => {
    test('[negative] phone omitted returns 400', async ({ request }) => {
      const client = new BerkeleyClient(request);
      const body = newCardholder();
      delete (body as Record<string, unknown>)['phone'];

      const res = await client.createCardholder(body);
      // Phone is required for Canadian programs (program 137)
      expect(res.status()).toBeGreaterThanOrEqual(400);
    });

    test('[negative] phone as empty string is rejected', async ({ request }) => {
      const client = new BerkeleyClient(request);
      const res = await client.createCardholder(newCardholder({ phone: '' }));
      expect(res.status()).toBeGreaterThanOrEqual(400);
    });

    test('10-digit phone is accepted', async ({ request }) => {
      const client = new BerkeleyClient(request);
      const res = await client.createCardholder(newCardholder({ phone: '6135550100' }));
      expect(res.status()).toBe(201);
    });

    test('3-digit short phone is accepted (min not enforced)', async ({ request }) => {
      // Observed in EXPLORE-4: "123" was accepted. Documenting the actual behaviour.
      const client = new BerkeleyClient(request);
      const res = await client.createCardholder(newCardholder({ phone: '123' }));
      expect(res.status()).toBe(201);
    });
  });

  test.describe('Field length enforcement', () => {
    // Binary search confirmed: soft up to 60 chars, hard limit at 61 chars.
    // See PART 5 (explore-field-length-limit.spec.ts) for the binary search results.
    const HARD_LIMIT = 61; // accepts up to 60, rejects at 61

    test('30-char first_name is accepted and persisted without truncation', async ({
      request,
    }) => {
      const client = new BerkeleyClient(request);
      const name = 'A'.repeat(30);
      const create = await client.createCardholder(newCardholder({ first_name: name }));
      expect(create.status()).toBe(201);
      const { id } = BerkeleyClient.unwrap<{ id: number }>(await create.json());

      const get = await client.getCardholder(id);
      expect(get.status()).toBe(200);
      const data = BerkeleyClient.unwrap<{ first_name?: string }>(await get.json());
      expect(data.first_name).toBe(name);
    });

    test('51-char first_name accepted and persisted as-is (soft limit is above 50)', async ({
      request,
    }) => {
      const client = new BerkeleyClient(request);
      const name = 'B'.repeat(51);
      const create = await client.createCardholder(newCardholder({ first_name: name }));
      expect(create.status()).toBe(201);
      const { id } = BerkeleyClient.unwrap<{ id: number }>(await create.json());

      const get = await client.getCardholder(id);
      const data = BerkeleyClient.unwrap<{ first_name?: string }>(await get.json());
      expect(data.first_name?.length, 'no silent truncation — full 51-char name must be persisted').toBe(
        51,
      );
    });

    test(`[negative] first_name at hard limit (${HARD_LIMIT} chars) is rejected`, async ({
      request,
    }) => {
      const client = new BerkeleyClient(request);
      const name = 'C'.repeat(HARD_LIMIT);
      const res = await client.createCardholder(newCardholder({ first_name: name }));
      expect(res.status()).toBeGreaterThanOrEqual(400);
    });
  });
});
