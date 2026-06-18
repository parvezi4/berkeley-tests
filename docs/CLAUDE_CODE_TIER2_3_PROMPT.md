# Claude Code — Tier 2 & 3 Test Implementation

## Project structure (current)

```
berkeley-tests/
├── docs/                         # Strategy doc, OpenAPI spec, findings
├── load-tests/                   # k6/Artillery load test scripts
├── newman-results/               # Newman CI run outputs
├── postman/                      # Postman collection + environment
├── scripts/                      # Helper/utility scripts
├── tests/
│   ├── accounts/                 # Core account tests (Tier 1)
│   ├── cardholders/              # Core cardholder tests (Tier 1)
│   ├── exploration/              # Diagnostic one-off tests (not in CI)
│   ├── fixtures/
│   │   └── api-fixtures.ts       # Shared Playwright fixtures (seededAccount etc.)
│   ├── programs/                 # Core program tests (Tier 1)
│   ├── support/
│   │   ├── api/
│   │   │   ├── berkeley-client.ts  # Typed API client
│   │   │   └── types.ts            # Request/response types
│   │   └── utils/
│   │       ├── config.ts           # Env config loader
│   │       └── test-data.ts        # Test data factory
│   └── value-loads/              # Core value load tests (Tier 1)
├── exploration-results.log
└── .env / .env.example
```

Everything under `tests/` is test infrastructure — the support layer exists to
serve the test files, not to represent application source. Do not create anything
outside of `tests/` (or `docs/` for documentation updates).

## Import path reference

Use these paths consistently across all new files:

| What | Import from (relative to tests/tier2/ or tests/tier3/) |
|---|---|
| BerkeleyClient | `'../support/api/berkeley-client.js'` |
| Types | `'../support/api/types.js'` |
| Fixtures (test/expect) | `'../fixtures/api-fixtures.js'` |
| Config | `'../support/utils/config.js'` |
| Test data factory | `'../support/utils/test-data.js'` |

For `tests/fixtures/fresh-account.ts` (new file, lives at same level as `api-fixtures.ts`):

| What | Import |
|---|---|
| BerkeleyClient | `'../support/api/berkeley-client.js'` |
| Types | `'../support/api/types.js'` |
| Test data factory | `'../support/utils/test-data.js'` |

---

## Context

Tier 1 is complete (63 passing tests). The exploration suite ran and produced
results in `docs/API_BEHAVIOUR_FINDINGS.md`. Read that file first.

Key confirmed findings that change test design:
- **Idempotency keys are GLOBALLY scoped** — one key cannot be reused across
  any two accounts in the program. Always generate globally unique keys.
- **`date_of_birth` correct format is `dd-MM-yyyy`** for both Create AND Update
  (docs are wrong on three counts — see BUG-1 in the findings doc).
- **Phone IS required** for program 137 (Canadian). Omit it and you get 400.
- **Field length hard limit** exists somewhere between 51 and 100 chars (exact
  threshold TBD in Part 5 of this prompt).
- **`duplicate_request`** is the confirmed error code for idempotency conflicts.

Most other explorations were blocked by terminal state contamination (explained
in Part 0). Fix that first.

---

## PART 0 — Root cause fix (do this first)

### Why explorations were blocked

Most `resource_not_found` (400) errors during exploration came from tests sharing
accounts across status changes. When one test called `mark_card_lost`, the account
entered a terminal state. Every subsequent test using the same `account_id` then
returned 400 — including GET calls. Because the exploration suite used the shared
`seededAccount` fixture (one account per file), one destructive test broke all the
rest.

### Fix — `createFreshAccount` helper

Create `tests/fixtures/fresh-account.ts`:

```typescript
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
```

Also add a JSDoc warning to the `seededAccount` fixture in
`tests/fixtures/api-fixtures.ts`:

```typescript
// ⚠️  NOTE: Do NOT use seededAccount in tests that change account status
// (suspend / mark_lost / mark_stolen) or drain the full balance.
// Those tests must use createFreshAccount() from ./fresh-account.ts instead.
// Sharing a mutable account across tests causes terminal-state contamination.
```

---

## PART 1 — Re-run blocked explorations with the fix

Update the existing exploration specs to use `createFreshAccount()` directly.
Each test must own its own account.

### 1A: Re-run EXPLORE-1 (negative balance + amount boundaries)

Update `tests/exploration/explore-negative-balance.spec.ts`.

Key tests to get this time:

```typescript
import { test, expect } from '@playwright/test';
import { createFreshAccount } from '../fixtures/fresh-account.js';
import { uniqueTag } from '../support/utils/test-data.js';

test.describe('[EXPLORE-1] Negative balance and amount boundaries', () => {

  test('unload on zero-balance account — observe error code', async ({ request }) => {
    const acc = await createFreshAccount(request, 1000);

    // First drain the balance via unload (if unload is enabled for program 137)
    // If unload is NOT enabled, skip the drain and test directly against the
    // starting balance by attempting to unload more than 1000.
    const drainRes = await acc.client.createValueLoad({
      account_id: acc.accountId,
      amount: 1001, // deliberately over balance
      external_tag: uniqueTag('over'),
    });

    console.log('[EXPLORE-1] Over-unload status:', drainRes.status());
    const body = await drainRes.json().catch(() => ({}));
    console.log('[EXPLORE-1] Over-unload body:', JSON.stringify(body));
    // Capture: is the error code 'insufficient_funds', 'invalid_amount', or other?

    expect.soft(drainRes.status()).toBeGreaterThanOrEqual(400);
    test.info().annotations.push({
      type: 'finding',
      description: `over-unload: HTTP ${drainRes.status()}, error: ${JSON.stringify(body)}`,
    });
  });

  test('amount = 0 load — accepted or rejected?', async ({ request }) => {
    const acc = await createFreshAccount(request, 500);
    const res = await acc.client.createValueLoad({
      account_id: acc.accountId,
      amount: 0,
      external_tag: uniqueTag('zero'),
    });
    console.log('[EXPLORE-1] amount=0 status:', res.status());
    console.log('[EXPLORE-1] amount=0 body:', await res.text());
    test.info().annotations.push({ type: 'finding',
      description: `amount=0: HTTP ${res.status()}` });
  });

  test('amount = -1 load — what validation error?', async ({ request }) => {
    const acc = await createFreshAccount(request, 500);
    const res = await acc.client.createValueLoad({
      account_id: acc.accountId,
      amount: -1,
      external_tag: uniqueTag('neg'),
    });
    console.log('[EXPLORE-1] amount=-1 status:', res.status());
    console.log('[EXPLORE-1] amount=-1 body:', await res.text());
  });

  test('string amount "100" — coerced or rejected?', async ({ request }) => {
    const acc = await createFreshAccount(request, 500);
    // Send raw JSON with string amount — bypass TypeScript typing
    const res = await acc.client['request'].post(
      `/api/v1/card_issuing/value_loads/load`,
      {
        headers: { Authorization: `Bearer ${process.env.BP_API_KEY}`,
                   'Content-Type': 'application/json' },
        data: { account_id: acc.accountId, amount: "100",
                external_tag: uniqueTag('str') },
      }
    );
    const balAfter = await acc.client.getAccountBalance(acc.accountId);
    console.log('[EXPLORE-1] string amount status:', res.status());
    console.log('[EXPLORE-1] balance after string amount:', await balAfter.text());
  });

});
```

### 1B: Re-run EXPLORE-3 invalid transitions

Update `tests/exploration/explore-status-transitions.spec.ts`.
Each test gets its own fresh account. Focus on the rows that returned
`resource_not_found` — those were fixture contamination, not real API behaviour.

```typescript
// Template for each invalid transition test
test('active → unsuspend returns 4xx with specific error code', async ({ request }) => {
  const acc = await createFreshAccount(request, 100);
  // Account is active. Attempt unsuspend without suspending first.
  const res = await acc.client.modifyAccountStatus(
    acc.accountId, 'unsuspend', acc.lastFourDigits
  );
  console.log('[EXPLORE-3] active→unsuspend:', res.status(), await res.text());
  expect.soft(res.status()).toBeGreaterThanOrEqual(400);
});

test('lost → GET balance — are reads permitted on terminal accounts?', async ({ request }) => {
  const acc = await createFreshAccount(request, 100);
  // Mark lost first
  await acc.client.modifyAccountStatus(acc.accountId, 'mark_card_lost', acc.lastFourDigits);
  // Now try to read balance — this is the key question
  const balRes = await acc.client.getAccountBalance(acc.accountId);
  console.log('[EXPLORE-3] lost→GET balance:', balRes.status(), await balRes.text());
  test.info().annotations.push({ type: 'finding',
    description: `GET balance on lost account: HTTP ${balRes.status()}` });
  // Does NOT hard-fail — we want to observe whatever happens
});
```

Repeat the same pattern for: `lost → GET transactions`, `lost → GET account details`,
`lost → value load`, `suspended → suspend again`, `active → mark_card_active`.

### 1C: Re-run type coercion (EXPLORE-4 Section D)

Add a standalone spec `tests/exploration/explore-type-coercion.spec.ts`
using `createFreshAccount()`. Raw HTTP requests via Playwright's `request`
fixture (bypassing BerkeleyClient's TypeScript types) to send the malformed payloads.

---

## PART 2 — Tier 2 test suites

Create `tests/tier2/` with three spec files.

### `tests/tier2/idempotency.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { createFreshAccount } from '../fixtures/fresh-account.js';
import { BerkeleyClient } from '../support/api/berkeley-client.js';
import { uniqueTag } from '../support/utils/test-data.js';
import type { ValueLoad } from '../support/api/types.js';

test.describe('Value Load Idempotency', () => {

  test('identical replay returns 2xx and balance moves exactly once @smoke', async ({ request }) => {
    const acc = await createFreshAccount(request, 2000);
    const key = uniqueTag('idem');
    const AMOUNT = 300;

    const balBefore = await getBalance(acc.client, acc.accountId);

    await acc.client.createValueLoad({ account_id: acc.accountId,
      amount: AMOUNT, external_tag: uniqueTag(), idempotency_key: key });

    const replay = await acc.client.createValueLoad({ account_id: acc.accountId,
      amount: AMOUNT, external_tag: uniqueTag(), idempotency_key: key });
    expect([200, 201]).toContain(replay.status());

    const balAfter = await getBalance(acc.client, acc.accountId);
    expect(balAfter - balBefore,
      'balance must move exactly once despite two calls with same key'
    ).toBe(AMOUNT);
  });

  test('identical replay returns the same load id as the original', async ({ request }) => {
    const acc = await createFreshAccount(request, 2000);
    const key = uniqueTag('idem');
    const AMOUNT = 100;

    const first = await acc.client.createValueLoad({
      account_id: acc.accountId, amount: AMOUNT,
      external_tag: uniqueTag(), idempotency_key: key });
    const firstLoad = BerkeleyClient.unwrap<ValueLoad>(await first.json());

    const second = await acc.client.createValueLoad({
      account_id: acc.accountId, amount: AMOUNT,
      external_tag: uniqueTag(), idempotency_key: key });
    const secondLoad = BerkeleyClient.unwrap<ValueLoad>(await second.json());

    expect(secondLoad.id,
      'replay must return the original load id, not a new one'
    ).toBe(firstLoad.id);
  });

  test('same key with different amount returns duplicate_request error', async ({ request }) => {
    const acc = await createFreshAccount(request, 2000);
    const key = uniqueTag('idem');

    await acc.client.createValueLoad({
      account_id: acc.accountId, amount: 100,
      external_tag: uniqueTag(), idempotency_key: key });

    const conflict = await acc.client.createValueLoad({
      account_id: acc.accountId, amount: 200, // different amount
      external_tag: uniqueTag(), idempotency_key: key });

    expect(conflict.status()).toBeGreaterThanOrEqual(400);
    const body = await conflict.json();
    const errCode = body?.error?.code ?? body?.code;
    expect(errCode, 'conflict must use duplicate_request error code').toBe('duplicate_request');
  });

  test('same key on a different account returns duplicate_request (keys are globally scoped)', async ({ request }) => {
    // This confirms A7 was REFUTED: keys are global, not per-account.
    const acc1 = await createFreshAccount(request, 1000);
    const acc2 = await createFreshAccount(request, 1000);
    const key = uniqueTag('global');

    await acc1.client.createValueLoad({
      account_id: acc1.accountId, amount: 100,
      external_tag: uniqueTag(), idempotency_key: key });

    const crossAccount = await acc2.client.createValueLoad({
      account_id: acc2.accountId, amount: 100,
      external_tag: uniqueTag(), idempotency_key: key }); // same key, different account

    expect(crossAccount.status(),
      'same key on different account must be rejected (global scope)'
    ).toBeGreaterThanOrEqual(400);
    const body = await crossAccount.json();
    expect(body?.error?.code ?? body?.code).toBe('duplicate_request');
  });

  test('idempotency key is case-sensitive', async ({ request }) => {
    const acc = await createFreshAccount(request, 2000);
    const baseKey = `idem-case-${Date.now()}`;
    const AMOUNT = 100;

    const first = await acc.client.createValueLoad({
      account_id: acc.accountId, amount: AMOUNT,
      external_tag: uniqueTag(), idempotency_key: baseKey.toUpperCase() });
    expect(first.status()).toBe(201);

    // Lowercase version — should be treated as a NEW, different key
    const second = await acc.client.createValueLoad({
      account_id: acc.accountId, amount: AMOUNT,
      external_tag: uniqueTag(), idempotency_key: baseKey.toLowerCase() });
    expect(second.status(), 'lowercase key must be accepted as a distinct key').toBe(201);

    const balDelta = await getBalance(acc.client, acc.accountId) - acc.startingBalance;
    expect(balDelta, 'two distinct keys must produce two loads').toBe(AMOUNT * 2);
  });

  test('load without idempotency_key always creates a new load', async ({ request }) => {
    const acc = await createFreshAccount(request, 3000);
    const AMOUNT = 100;

    const first = await acc.client.createValueLoad({
      account_id: acc.accountId, amount: AMOUNT, external_tag: uniqueTag() });
    const second = await acc.client.createValueLoad({
      account_id: acc.accountId, amount: AMOUNT, external_tag: uniqueTag() });

    expect(first.status()).toBe(201);
    expect(second.status()).toBe(201);

    const firstId = BerkeleyClient.unwrap<ValueLoad>(await first.json()).id;
    const secondId = BerkeleyClient.unwrap<ValueLoad>(await second.json()).id;
    expect(secondId, 'no key = no dedup, must create separate load').not.toBe(firstId);

    const balDelta = await getBalance(acc.client, acc.accountId) - acc.startingBalance;
    expect(balDelta).toBe(AMOUNT * 2);
  });

});

async function getBalance(client: BerkeleyClient, accountId: number): Promise<number> {
  const res = await client.getAccountBalance(accountId);
  expect(res.status()).toBe(200);
  const data = BerkeleyClient.unwrap<{ available_balance: string }>(await res.json());
  return Number(data.available_balance);
}
```

### `tests/tier2/money-conservation.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { createFreshAccount } from '../fixtures/fresh-account.js';
import { BerkeleyClient } from '../support/api/berkeley-client.js';
import { uniqueTag } from '../support/utils/test-data.js';
import type { ValueLoad, AccountBalance } from '../support/api/types.js';

test.describe('Money Conservation', () => {

  test('a load increases available_balance by exactly the loaded amount @smoke', async ({ request }) => {
    const acc = await createFreshAccount(request, 1000);
    const LOAD = 500;
    const before = await balance(acc.client, acc.accountId);

    const res = await acc.client.createValueLoad({
      account_id: acc.accountId, amount: LOAD, external_tag: uniqueTag(),
      idempotency_key: uniqueTag('idem') });
    expect(res.status()).toBe(201);

    const after = await balance(acc.client, acc.accountId);
    expect(after - before,
      `balance delta must be exactly ${LOAD}`).toBe(LOAD);
  });

  test('sequential loads accumulate correctly', async ({ request }) => {
    const acc = await createFreshAccount(request, 500);
    const AMOUNTS = [100, 200, 150];
    const before = await balance(acc.client, acc.accountId);

    for (const amt of AMOUNTS) {
      const res = await acc.client.createValueLoad({
        account_id: acc.accountId, amount: amt, external_tag: uniqueTag(),
        idempotency_key: uniqueTag('idem') });
      expect(res.status()).toBe(201);
    }

    const after = await balance(acc.client, acc.accountId);
    const total = AMOUNTS.reduce((s, a) => s + a, 0);
    expect(after - before,
      `three sequential loads must total ${total}`).toBe(total);
  });

  test('balance in GET /accounts/{id} matches GET /accounts/{id}/balance', async ({ request }) => {
    const acc = await createFreshAccount(request, 1000);
    await acc.client.createValueLoad({
      account_id: acc.accountId, amount: 250, external_tag: uniqueTag(),
      idempotency_key: uniqueTag('idem') });

    const balRes = await acc.client.getAccountBalance(acc.accountId);
    const detailRes = await acc.client.getAccount(acc.accountId);

    expect(balRes.status()).toBe(200);
    expect(detailRes.status()).toBe(200);

    const balData = BerkeleyClient.unwrap<AccountBalance>(await balRes.json());
    const detailData = BerkeleyClient.unwrap<{ balance?: string }>(await detailRes.json());

    // Both endpoints must agree on the balance
    expect(String(detailData.balance)).toBe(String(balData.available_balance));
  });

  test('load amount in the value load record matches what was sent', async ({ request }) => {
    const acc = await createFreshAccount(request, 1000);
    const LOAD = 375;

    const res = await acc.client.createValueLoad({
      account_id: acc.accountId, amount: LOAD, external_tag: uniqueTag(),
      idempotency_key: uniqueTag('idem') });
    expect(res.status()).toBe(201);

    const load = BerkeleyClient.unwrap<ValueLoad>(await res.json());
    expect(Number(load.amount),
      'load record must echo the exact amount sent').toBe(LOAD);
  });

  test('list value loads reflects all created loads with correct amounts', async ({ request }) => {
    const acc = await createFreshAccount(request, 2000);
    const AMOUNTS = [100, 200];
    const ids: number[] = [];

    for (const amt of AMOUNTS) {
      const res = await acc.client.createValueLoad({
        account_id: acc.accountId, amount: amt, external_tag: uniqueTag(),
        idempotency_key: uniqueTag('idem') });
      expect(res.status()).toBe(201);
      ids.push(BerkeleyClient.unwrap<ValueLoad>(await res.json()).id);
    }

    const listRes = await acc.client.listValueLoads({ limit: 50 });
    expect(listRes.status()).toBe(200);
    const { data } = await listRes.json() as { data: ValueLoad[] };

    for (const id of ids) {
      const found = data.find(l => l.id === id);
      expect(found, `load id ${id} must appear in list`).toBeDefined();
    }
  });

});

async function balance(client: BerkeleyClient, accountId: number): Promise<number> {
  const res = await client.getAccountBalance(accountId);
  expect(res.status()).toBe(200);
  const data = BerkeleyClient.unwrap<AccountBalance>(await res.json());
  return Number(data.available_balance);
}
```

### `tests/tier2/format-validation.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { test as btest, expect as bexpect } from '../fixtures/api-fixtures.js';
import { BerkeleyClient } from '../support/api/berkeley-client.js';
import { newCardholder, uniqueTag } from '../support/utils/test-data.js';
import { config } from '../support/utils/config.js';

test.describe('Format Validation', () => {

  test.describe('date_of_birth — confirmed format: dd-MM-yyyy', () => {

    test('dd-MM-yyyy accepted on Create Cardholder @smoke', async ({ request }) => {
      const client = new BerkeleyClient(request);
      const res = await client.createCardholder(
        newCardholder({ date_of_birth: '15-06-1990' })
      );
      expect(res.status()).toBe(201);
    });

    test('dd-MM-yyyy accepted on Update Cardholder', async ({ request }) => {
      const client = new BerkeleyClient(request);
      const create = await client.createCardholder(newCardholder());
      const { id } = BerkeleyClient.unwrap<{ id: number }>(await create.json());

      const update = await client.updateCardholder(id, { date_of_birth: '15-06-1990' });
      expect(update.status(), 'dd-MM-yyyy must be accepted on update').toBe(200);
    });

    test.describe('BUG-1: doc says YYYY-MM-DD but API requires dd-MM-yyyy', () => {
      // These tests DOCUMENT the known bug, they are expected to fail on the
      // formats the docs claim are correct.

      test('[negative] YYYY-MM-DD rejected on Update — docs are wrong (BUG-1)', async ({ request }) => {
        const client = new BerkeleyClient(request);
        const create = await client.createCardholder(newCardholder());
        const { id } = BerkeleyClient.unwrap<{ id: number }>(await create.json());

        const update = await client.updateCardholder(id, { date_of_birth: '1990-06-15' });
        expect(update.status(),
          'YYYY-MM-DD must be rejected — this confirms BUG-1'
        ).toBeGreaterThanOrEqual(400);
      });

      test('[negative] ISO timestamp rejected on Update — OpenAPI example is also wrong (BUG-1)', async ({ request }) => {
        const client = new BerkeleyClient(request);
        const create = await client.createCardholder(newCardholder());
        const { id } = BerkeleyClient.unwrap<{ id: number }>(await create.json());

        const update = await client.updateCardholder(id,
          { date_of_birth: '1990-06-15T00:00:00.000Z' });
        expect(update.status()).toBeGreaterThanOrEqual(400);
      });
    });
  });

  test.describe('Phone — required for Canadian programs', () => {

    test('[negative] phone omitted returns 400 with clear message', async ({ request }) => {
      const client = new BerkeleyClient(request);
      const body = newCardholder();
      delete (body as Record<string, unknown>)['phone'];

      const res = await client.createCardholder(body);
      expect(res.status()).toBe(400);
      const err = await res.json();
      const msg = err?.error?.message ?? err?.message ?? JSON.stringify(err);
      expect(msg.toLowerCase()).toMatch(/phone/);
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
    // Confirmed: soft up to ~51 chars, hard limit somewhere between 51 and 100.
    // Run explore-field-length-limit.spec.ts to find the exact threshold,
    // then update HARD_LIMIT below.
    const HARD_LIMIT = 100; // update once binary search confirms exact value

    test('30-char first_name is accepted and persisted without truncation', async ({ request }) => {
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

    test('51-char first_name accepted and persisted as-is (soft limit is above 50)', async ({ request }) => {
      const client = new BerkeleyClient(request);
      const name = 'B'.repeat(51);
      const create = await client.createCardholder(newCardholder({ first_name: name }));
      expect(create.status()).toBe(201);
      const { id } = BerkeleyClient.unwrap<{ id: number }>(await create.json());

      const get = await client.getCardholder(id);
      const data = BerkeleyClient.unwrap<{ first_name?: string }>(await get.json());
      expect(data.first_name?.length,
        'no silent truncation — full 51-char name must be persisted').toBe(51);
    });

    test(`[negative] first_name at hard limit (${HARD_LIMIT} chars) is rejected`, async ({ request }) => {
      const client = new BerkeleyClient(request);
      const name = 'C'.repeat(HARD_LIMIT);
      const res = await client.createCardholder(newCardholder({ first_name: name }));
      expect(res.status()).toBeGreaterThanOrEqual(400);
    });
  });

});
```

---

## PART 3 — Tier 3 test suites

Create `tests/tier3/`.

### `tests/tier3/error-codes.spec.ts`

Catalogue confirmed error codes. Each test asserts HTTP status, error `code`,
and that `message` is a non-empty human-readable string.

```typescript
import { test, expect } from '@playwright/test';
import { BerkeleyClient } from '../support/api/berkeley-client.js';
import { newCardholder, uniqueTag } from '../support/utils/test-data.js';
import { config } from '../support/utils/config.js';
import { createFreshAccount } from '../fixtures/fresh-account.js';

function assertError(body: unknown, expectedCode: string) {
  const err = (body as Record<string, unknown>)?.error as Record<string, unknown>
    ?? body as Record<string, unknown>;
  expect(String(err?.code ?? err?.error_code ?? ''),
    `expected error code "${expectedCode}"`).toBe(expectedCode);
  expect(String(err?.message ?? '')).not.toBe('');
}

test.describe('Error Code Catalogue', () => {

  test('invalid auth token → 401/403', async ({ request }) => {
    const client = new BerkeleyClient(request);
    const res = await client.getProgramWithToken('invalid-token-0000');
    expect([401, 403]).toContain(res.status());
  });

  test('nonexistent cardholder → resource_not_found', async ({ request }) => {
    const client = new BerkeleyClient(request);
    const res = await client.getCardholder(999_999_999);
    expect(res.status()).toBeGreaterThanOrEqual(400);
    assertError(await res.json(), 'resource_not_found');
  });

  test('invalid cardholder field → invalid_cardholder', async ({ request }) => {
    const client = new BerkeleyClient(request);
    const res = await client.createCardholder(
      newCardholder({ date_of_birth: '1990-06-15' }) // wrong format
    );
    expect(res.status()).toBeGreaterThanOrEqual(400);
    assertError(await res.json(), 'invalid_cardholder');
  });

  test('idempotency conflict → duplicate_request', async ({ request }) => {
    const acc = await createFreshAccount(request, 500);
    const key = uniqueTag('idem');
    await acc.client.createValueLoad({
      account_id: acc.accountId, amount: 100,
      external_tag: uniqueTag(), idempotency_key: key });
    const conflict = await acc.client.createValueLoad({
      account_id: acc.accountId, amount: 200,
      external_tag: uniqueTag(), idempotency_key: key });
    assertError(await conflict.json(), 'duplicate_request');
  });

  test('address cooldown → cannot_update_resource', async ({ request }) => {
    const client = new BerkeleyClient(request);
    const create = await client.createCardholder(newCardholder());
    const { id } = BerkeleyClient.unwrap<{ id: number }>(await create.json());
    // Update address twice in quick succession — second should hit the cooldown
    await client.updateCardholder(id, { address1: '1 New Street' });
    const second = await client.updateCardholder(id, { address1: '2 Other Street' });
    if (second.status() >= 400) {
      assertError(await second.json(), 'cannot_update_resource');
    } else {
      test.info().annotations.push({ type: 'note',
        description: 'Address cooldown not triggered — cooldown window may be longer than test gap' });
    }
  });

});
```

### `tests/tier3/status-transitions.spec.ts`

Full verified state machine as regression tests.
Use `createFreshAccount()` for every test — no sharing.

```typescript
import { test, expect } from '@playwright/test';
import { createFreshAccount } from '../fixtures/fresh-account.js';
import { BerkeleyClient } from '../support/api/berkeley-client.js';

async function getStatus(client: BerkeleyClient, accountId: number): Promise<string | undefined> {
  const res = await client.getAccount(accountId);
  if (!res.ok()) return undefined;
  const data = BerkeleyClient.unwrap<{ status_code?: string }>(await res.json());
  return data.status_code;
}

test.describe('Status Transitions — verified state machine', () => {

  // ── Valid transitions (confirmed in exploration) ──────────────────────────

  test('active → suspend: status becomes suspended @smoke', async ({ request }) => {
    const acc = await createFreshAccount(request, 100);
    const res = await acc.client.modifyAccountStatus(acc.accountId, 'suspend', acc.lastFourDigits);
    expect([200, 201]).toContain(res.status());
    expect(await getStatus(acc.client, acc.accountId)).toBe('suspended');
  });

  test('suspended → unsuspend: status returns to active', async ({ request }) => {
    const acc = await createFreshAccount(request, 100);
    await acc.client.modifyAccountStatus(acc.accountId, 'suspend', acc.lastFourDigits);
    const res = await acc.client.modifyAccountStatus(acc.accountId, 'unsuspend', acc.lastFourDigits);
    expect([200, 201]).toContain(res.status());
    expect(await getStatus(acc.client, acc.accountId)).toBe('active');
  });

  test('active → mark_card_lost: status becomes lost (terminal)', async ({ request }) => {
    const acc = await createFreshAccount(request, 100);
    const res = await acc.client.modifyAccountStatus(acc.accountId, 'mark_card_lost', acc.lastFourDigits);
    expect([200, 201]).toContain(res.status());
    // Note: terminal — do NOT reuse this account after this point
  });

  test('active → mark_card_stolen: status becomes stolen (terminal)', async ({ request }) => {
    const acc = await createFreshAccount(request, 100);
    const res = await acc.client.modifyAccountStatus(acc.accountId, 'mark_card_stolen', acc.lastFourDigits);
    expect([200, 201]).toContain(res.status());
  });

  test('suspended → mark_card_lost: terminal state reachable from suspended', async ({ request }) => {
    const acc = await createFreshAccount(request, 100);
    await acc.client.modifyAccountStatus(acc.accountId, 'suspend', acc.lastFourDigits);
    const res = await acc.client.modifyAccountStatus(acc.accountId, 'mark_card_lost', acc.lastFourDigits);
    expect([200, 201]).toContain(res.status());
  });

  // ── Invalid transitions (fill in status/error from EXPLORE-3 re-run) ─────

  test('[negative] unsuspend on active card returns 4xx', async ({ request }) => {
    const acc = await createFreshAccount(request, 100);
    // Card is active, not suspended
    const res = await acc.client.modifyAccountStatus(acc.accountId, 'unsuspend', acc.lastFourDigits);
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test.fixme('[negative] any status change on lost card returns 4xx (terminal)', async ({ request }) => {
    // Blocked: EXPLORE-3 re-run needed to confirm error code for terminal→any transition.
    // Once re-run confirms, remove fixme and assert the exact error code.
  });

  test.fixme('[negative] GET balance on lost/stolen account — behaviour unconfirmed', async ({ request }) => {
    // EXPLORE-3 re-run needed: does GET balance return 200 (reads allowed)
    // or 4xx (terminal blocks all operations including reads)?
  });

});
```

---

## PART 4 — Supporting changes

### 4A: Update `docs/berkeley-card-issuing-openapi.yaml`

Make these targeted corrections (all confirmed from exploration):

1. **`UpdateCardholderRequest.date_of_birth`**: change description to
   `"dd-MM-yyyy — same as Create. IMPORTANT: The official docs incorrectly state YYYY-MM-DD (see BUG-1 in API_BEHAVIOUR_FINDINGS.md). The API requires dd-MM-yyyy."`

2. **`CreateCardholderRequest`**: add `phone` to the `required` array.
   Add note to `phone` description: `"Required for Canadian programs (program 137). The API enforces this even though the docs suggest it is optional."`

3. **`CreateValueLoadRequest` and `CreateValueUnloadRequest`**: add a note to
   `idempotency_key` description: `"IMPORTANT: Keys are GLOBALLY scoped across the entire program — not per-account. A key used on any account cannot be reused on any other. Use a UUID or timestamp+random suffix to guarantee global uniqueness."`

### 4B: Update `package.json` scripts

```json
"explore":     "playwright test tests/exploration/ --reporter=list",
"test:tier2":  "playwright test tests/tier2/",
"test:tier3":  "playwright test tests/tier3/",
"test:all":    "playwright test tests/cardholders tests/accounts tests/value-loads tests/programs tests/tier2 tests/tier3"
```

Note: `explore` is intentionally excluded from `test:all` — exploration tests
are diagnostic and one-off, not part of the regression suite.

### 4C: Update `docs/API_BEHAVIOUR_FINDINGS.md`

After each exploration re-run and tier implementation, update the document:
- Mark resolved assumptions `[CONFIRMED]` or `[REFUTED]` with observed values
- Fill in the `Record actual` column of the EXPLORE-3 transition matrix
- Add a final summary section: "What remains for the VP session"

---

## PART 5 — Binary search for exact field length hard limit

Create `tests/exploration/explore-field-length-limit.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { BerkeleyClient } from '../support/api/berkeley-client.js';
import { newCardholder } from '../support/utils/test-data.js';

test('binary search: find exact first_name hard limit', async ({ request }) => {
  const client = new BerkeleyClient(request);
  let low = 52, high = 99, lastAccepted = 51;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const name = 'X'.repeat(mid);
    const res = await client.createCardholder(newCardholder({ first_name: name }));
    console.log(`[FIELD-LENGTH] length=${mid} → HTTP ${res.status()}`);
    if (res.status() === 201) {
      lastAccepted = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  console.log(`[FIELD-LENGTH] ✅ Hard limit: accepts up to ${lastAccepted}, rejects at ${lastAccepted + 1}`);
  test.info().annotations.push({
    type: 'finding',
    description: `first_name hard limit: ${lastAccepted} chars accepted, ${lastAccepted + 1} rejected`,
  });
  // Once confirmed, update HARD_LIMIT in tests/tier2/format-validation.spec.ts
});
```

---

## Execution order

```bash
# 1. Fix first — no other step works reliably without this
# Create tests/fixtures/fresh-account.ts (Part 0)

# 2. Binary search — needed before Tier 2 format tests
npx playwright test tests/exploration/explore-field-length-limit.spec.ts --reporter=list

# 3. Re-run blocked explorations
npm run explore

# 4. Update docs/API_BEHAVIOUR_FINDINGS.md with new results
# Update HARD_LIMIT in format-validation.spec.ts with binary search result

# 5. Tier 2
npm run test:tier2

# 6. Tier 3
npm run test:tier3

# 7. Full regression — confirm no Tier 1 regressions
npm run test:all
```

Target: ~100+ total tests. Exploration suite stays separate, diagnostic-only.
