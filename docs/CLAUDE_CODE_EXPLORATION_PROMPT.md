# Claude Code — API Behaviour Exploration Prompt

## Context

You are working on a black-box API test suite for the Berkeley Payments Card Issuing
API (staging). The project is at `berkeley-card-issuing-tests/`. Tier 1 tests (63
passing) are complete. This session builds an **exploration suite** in
`tests/exploration/` to empirically answer open questions about API behaviour where
the official docs are silent or inconsistent.

The findings document is at `docs/API_BEHAVIOUR_FINDINGS.md`. Read it first —
it defines the four exploration tasks (EXPLORE-1 through EXPLORE-4), the assumptions
table, and the specific test matrix for status transitions. Every result you produce
should update that document.

Environment:
- Base URL: `https://api.staging.pungle.co`
- Auth: Bearer token from `.env` → `BP_API_KEY`
- Program ID: 137 (Canadian, CAD)
- Use the existing `BerkeleyClient` in `src/api/berkeley-client.ts` and the
  `newCardholder()` factory from `src/utils/test-data.ts`

---

## What to build

Create `tests/exploration/` with four spec files, one per exploration task. These
are **diagnostic tests, not regression tests** — they should:
- Always run to completion even when the API returns unexpected status codes
- Log every response body, status code, and error detail using `console.log`
- Record observations directly in comments or console output that Claude Code can
  summarise back into `docs/API_BEHAVIOUR_FINDINGS.md`
- Use `test.info().annotations.push(...)` to attach findings to the Playwright
  HTML report
- Never hard-fail on ambiguous or unknown behaviour — use soft assertions
  (`expect.soft()`) so all steps run regardless

---

## EXPLORE-1: Negative balance and amount boundaries

**File**: `tests/exploration/explore-negative-balance.spec.ts`

Build a suite that explores what happens when unload amount meets or exceeds
available balance, and tests amount boundary values. The suite must:

1. **Setup**: create a fresh cardholder with `load_amount: 1000` (so we start with
   a known balance of 1000 units). Resolve the account_id. Verify starting balance.

2. **Test: exact balance unload** — unload exactly the available balance. Expect
   201. Verify balance is 0 (or near-zero if fees apply).

3. **Test: unload 1 unit on zero balance** — attempt to unload 1 unit when balance
   is 0. Record HTTP status and full response body. Is it 4xx? What is the error
   `code` field?

4. **Test: unload 100 units on zero balance** — same as above, larger amount.

5. **Test: if any unload succeeded below zero** — do a GET balance and capture
   what the balance field looks like (negative string? special status?).

6. **Test: load onto zero-balance account** — attempt a load of 100 units after
   the account is at 0. Record whether it succeeds (it should — loads come from
   program pool, not account balance).

7. **Test: amount = 0** — attempt `load` with `amount: 0`. Record status.

8. **Test: amount = -1** — attempt `load` with `amount: -1`. Record status
   and error code.

9. **Test: very large amount** — attempt `load` with `amount: 99999999`. Record
   status. If 201, verify balance increased correctly.

After all tests run, log a summary table:

```
=== EXPLORE-1 RESULTS ===
Unload exact balance:        [status] [error_code if any]
Unload 1 on zero:            [status] [error_code]
Unload 100 on zero:          [status] [error_code]
Balance after over-unload:   [value or N/A]
Load on zero-balance acct:   [status]
Amount = 0 load:             [status]
Amount = -1 load:            [status] [error_code]
Amount = 99999999 load:      [status]
=== ASSUMPTION A1 VALIDATION: [CONFIRMED/REFUTED/PARTIAL] ===
```

---

## EXPLORE-2: Idempotency key semantics

**File**: `tests/exploration/explore-idempotency.spec.ts`

Build a suite that characterises the full idempotency contract for value loads.

1. **Setup**: create a fresh cardholder + account, note starting balance.

2. **Test: basic idempotency (confirmed)** — load 100 with key `idem-base-{stamp}`.
   Record the returned `id`. Replay the identical request. Record second status code
   and returned `id`. Check balance — must be +100 only.
   Log: did second call return same `id` as first, or a new one?

3. **Test: replay with different amount, same key** — load 200 with the same key
   used in step 2. Record HTTP status and error body. Expected: 4xx conflict.
   Log the exact HTTP status, error `code`, error `message`.

4. **Test: same key on different account** — create a second fresh account. Send
   load with the *same key string* used in step 2 on the new account. Record result.
   This tests whether keys are account-scoped or globally unique.

5. **Test: key uniqueness is case-sensitive** — load with key `IDEM-CASE-{stamp}`.
   Replay with `idem-case-{stamp}` (lowercased). Record whether it's treated as
   same key or different. Check if balance moved once or twice.

6. **Test: idempotency on unload** — confirm `idempotency_key` works on unload
   too. Unload 50 with a key. Replay. Verify balance moved once.

After all tests, log summary:

```
=== EXPLORE-2 RESULTS ===
Basic replay returns same id:      [YES/NO]
Basic replay status:               [status code]
Different amount same key:         [status] [error_code]
Same key different account:        [status - 201=per-account, 4xx=global]
Case sensitivity:                  [CASE-SENSITIVE/INSENSITIVE]
Unload idempotency:                [works/does not work]
=== ASSUMPTIONS A4-A7 VALIDATION ===
A4 (replay no double-charge):      [CONFIRMED/REFUTED]
A5 (different amount rejected):    [CONFIRMED/REFUTED]
A7 (per-account scope):            [CONFIRMED/REFUTED]
```

---

## EXPLORE-3: Status transition matrix

**File**: `tests/exploration/explore-status-transitions.spec.ts`

Build a suite that empirically maps every valid and invalid status transition.
Use a separate fresh cardholder for each transition path to avoid state contamination.

For each test: call `modifyAccountStatus`, record HTTP status + response body.
Where the transition succeeds, verify the new status via GET account details.
Where it fails, capture the exact error `code` and `message`.

Build the tests in this order (do NOT use the same account across different paths):

**Path A — from active**:
- `active` → `suspend` (expect success)
- `active` → `unsuspend` (expect 4xx — not suspended)
- `active` → `mark_card_active` (no-op or error?)
- `active` → `mark_card_lost` (expect success, terminal)
- `active` → `mark_card_stolen` (fresh account, expect success, terminal)

**Path B — from suspended**:
- Create account → suspend (setup) → verify suspended
- `suspended` → `unsuspend` (expect success)
- `suspended` → `suspend` (fresh account: suspend → try suspend again → expect 4xx)
- `suspended` → `mark_card_lost` (fresh account: suspend → mark_lost → expect success)

**Path C — terminal state reads**:
- Create account → `mark_card_lost` → then:
  - Attempt GET balance (record: does it return 200 or error?)
  - Attempt GET transactions (record: does it return 200 or error?)
  - Attempt GET account details (record: status_code in response)
  - Attempt a load of 100 (record: does a lost card block loads?)
  - Attempt another status change — `unsuspend` (expect terminal 4xx)

After all paths, log the complete empirical transition table:

```
=== EXPLORE-3 RESULTS: STATUS TRANSITION MATRIX ===

From       | Action           | HTTP  | Error code (if any)
-----------|------------------|-------|--------------------
active     | suspend          |       |
active     | unsuspend        |       |
active     | mark_card_active |       |
active     | mark_card_lost   |       |
active     | mark_card_stolen |       |
suspended  | unsuspend        |       |
suspended  | suspend again    |       |
suspended  | mark_card_lost   |       |
lost       | mark_card_active |       |
lost       | unsuspend        |       |
lost       | GET balance      |       |
lost       | GET transactions |       |
lost       | value load       |       |

=== ASSUMPTION A8-A10 VALIDATION ===
A8 (wrong-state suspend/unsuspend returns 4xx): [CONFIRMED/REFUTED]
A9 (mark_lost available from any state):         [CONFIRMED/REFUTED]
A10 (GET reads work on terminal accounts):       [CONFIRMED/REFUTED]
```

---

## EXPLORE-4: Field validation — formats, lengths, type coercion

**File**: `tests/exploration/explore-field-validation.spec.ts`

Build a suite to empirically characterise what the API enforces vs. what it accepts
leniently. Use read-back (create → GET → compare) to verify what was actually
persisted.

**Section A — date_of_birth on Update Cardholder**

For each format: create a fresh cardholder, then call Update Cardholder with that
`date_of_birth`, then GET the cardholder and capture the `date_of_birth` in the
response.

1. Try `"02-10-1985"` (dd-MM-yyyy — same as Create) → record HTTP status, GET back and log persisted value
2. Try `"1985-10-02"` (YYYY-MM-DD — docs text) → record status, GET back
3. Try `"1985-10-02T00:00:00.000Z"` (ISO timestamp — OpenAPI example) → record status, GET back
4. Try `"1985/10/02"` (wrong separator) → record status (should fail)

Log:

```
=== date_of_birth on Update Cardholder ===
dd-MM-yyyy:                 [status] persisted as: [value]
YYYY-MM-DD:                 [status] persisted as: [value or REJECTED]
YYYY-MM-DDTHH:mm:ss.sssZ:  [status] persisted as: [value]
YYYY/MM/DD (wrong format):  [status]
Correct format is: [ANSWER based on results]
=== ASSUMPTION A17 VALIDATION: [CONFIRMED/REFUTED] ===
```

**Section B — field length enforcement**

Create cardholders with the following `first_name` values, then GET back and
compare the persisted value to the submitted value:

1. 30-character name (at the documented US limit)
2. 31-character name (1 over US limit)
3. 50-character name (at the documented CA limit)
4. 51-character name (1 over CA limit)
5. 100-character name (well over any limit)

For each: log `submitted_length`, `HTTP_status`, `persisted_length`, and
`persisted_value[0:30]` (first 30 chars to check for truncation).

```
=== Field length enforcement (first_name) ===
Len  | HTTP | Persisted len | Truncated?
-----|------|---------------|----------
30   |      |               |
31   |      |               |
50   |      |               |
51   |      |               |
100  |      |               |
Enforcement: [HARD (4xx) / SOFT-TRUNCATE / SOFT-ACCEPT]
=== ASSUMPTION A11-A12 VALIDATION ===
```

**Section C — phone field requirement**

1. Create cardholder for program 137 **without** `phone` field (omit entirely)
   → record HTTP status and error body
2. Create cardholder with `phone: ""` (empty string) → record status
3. Create cardholder with `phone: "123"` (too short) → record status

```
=== phone field requirement (Program 137 / CA) ===
phone omitted:          [status] [error_code if any]
phone = "":             [status]
phone = "123" (short):  [status]
Phone required for CA:  [YES/NO based on results]
```

**Section D — amount type coercion**

Using a fresh account for each:

1. Load with `amount: "100"` (string, not integer) → record status, check balance
2. Load with `amount: 100.5` (float) → record status; if 201, check what amount was stored
3. Load with `amount: null` → record status and error
4. Load with `amount: "abc"` (non-numeric string) → record status

```
=== Amount type coercion ===
amount as string "100":  [status] balance change: [value]
amount as float 100.5:   [status] stored as: [value]
amount as null:          [status] [error]
amount as "abc":         [status] [error]
Coercion: [INTENTIONAL (all pass) / PARTIAL / STRICT (all fail)]
=== ASSUMPTION A15 VALIDATION ===
```

---

## After all four exploration specs are written and run

1. Run the suite: `npx playwright test tests/exploration/ --reporter=list`

2. Capture the console output from each spec (the summary tables above).

3. Update `docs/API_BEHAVIOUR_FINDINGS.md`:
   - In Section 2 (Assumptions Table), change `[ASSUMED]` to `[CONFIRMED]` or
     `[REFUTED]` based on results, and add the observed value in a "Result" column
   - In Section 3 (Exploration Tasks), fill in the "Record actual" column of the
     status transition matrix table
   - Add any new unexpected findings as new rows

4. Create `docs/EXPLORATION_SUMMARY.md` with:
   - One paragraph per exploration task summarising what was found
   - The final empirical answers to the 5 VP questions in Section 4 of
     `API_BEHAVIOUR_FINDINGS.md` (where test results provide the answer)
   - Remaining genuinely unanswered questions (what tests couldn't determine)

---

## Notes for implementation

- Use `expect.soft()` throughout so all steps run even when assertions fail.
- Wrap every client call in try/catch and log on failure — network errors on
  staging should not abort the exploration.
- Prefix every `console.log` with the spec name for easy grepping:
  `console.log('[EXPLORE-1]', ...)`.
- Use separate fresh cardholders per test where state matters (especially
  EXPLORE-3). The `newCardholder()` factory with a timestamp suffix ensures
  uniqueness.
- These specs do NOT need to be added to the main CI workflow — they are
  one-off diagnostic runs. Add a separate script in `package.json`:
  `"explore": "playwright test tests/exploration/ --reporter=list"`.
