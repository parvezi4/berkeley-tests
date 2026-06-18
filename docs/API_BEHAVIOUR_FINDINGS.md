# Berkeley API — Observed Behaviour, Assumptions & Open Questions

**Purpose**: This document records what we know empirically from exploratory testing,
what we are assuming where docs are silent or inconsistent, and what questions remain
for clarification with the Berkeley engineering team. It is a living document updated
as the exploration suite (`tests/exploration/`) produces results.

**Approach**: Where documentation is ambiguous or silent, we test empirically and
document what we observe. Read-back-after-write (create → GET → assert) is used to
verify what the API actually persisted vs. what it accepted. Assumptions are tagged
`[ASSUMED]` until confirmed by test or by Berkeley.

---

## Section 1 — Documented Inconsistencies (Bug Candidates)

These are cases where the official documentation contradicts itself. Cited with
source URLs for reference during the Berkeley interview.

### BUG-1: `date_of_birth` format inconsistency across two pages

| Source | URL | Format stated | Example |
|---|---|---|---|
| Create Cardholder — Field Validation table | [/reference/createcardholder-1.md](https://developers.berkeleypayment.com/reference/createcardholder-1.md) | `dd-MM-yyyy` | `13-01-1990` |
| Update Cardholder — docs text | [/reference/updatecardholder-1.md](https://developers.berkeleypayment.com/reference/updatecardholder-1.md) | `YYYY-MM-DD` | `1980-01-01` |
| Update Cardholder — embedded OpenAPI JSON example | Same page (OpenAPI schema block) | ISO 8601 timestamp | `1980-01-01T00:00:00.000Z` |

Three formats, two pages, zero consistency. Our testing found `YYYY-MM-DD` is
rejected on Update. The correct format is an open exploration task (see Section 3).

### BUG-2: `external_tag` required/optional conflict on Value Load and Unload

| Source | URL | What it says |
|---|---|---|
| Create Value Load — markdown table | [/reference/createvalueload.md](https://developers.berkeleypayment.com/reference/createvalueload.md) | `external_tag` = **Yes** (required) |
| Create Value Load — embedded OpenAPI JSON schema | Same page | No `required` array — `external_tag` is a plain optional property |
| Create Value Unload — markdown table | [/reference/createvalueunload.md](https://developers.berkeleypayment.com/reference/createvalueunload.md) | `external_tag` = **Yes** (required) |
| Create Value Unload — embedded OpenAPI JSON schema | Same page | No `required` array |
| Live API behaviour | Staging (`api.staging.pungle.co`) | Accepts and returns 201 without `external_tag` |

The machine-readable spec (OpenAPI JSON) and the live API agree with each other.
The human-readable table is wrong. Our OpenAPI doc has been corrected to reflect
the actual behaviour.

---

## Section 2 — Assumptions Table

Assumptions we are making based on: observed API behaviour, analogous payments
industry standards, or logical inference. All marked `[ASSUMED]` until validated
by the exploration suite or confirmed by Berkeley.

| # | Area | Assumption | Basis | Confidence | Exploration task |
|---|---|---|---|---|---|
| A1 | Negative balance | Unloading more than available balance returns a 4xx (insufficient funds). The API does **not** allow negative balances on prepaid cards. | Industry standard for prepaid cards; docs silent on negative balances | Medium | EXPLORE-1 |
| A2 | Negative balance | The error code for insufficient funds is distinct from a generic 422 (e.g., `insufficient_funds` or similar). | Inferred from the `cannot_update_resource` pattern we've seen | Low | EXPLORE-1 |
| A3 | Negative balance | If a negative balance somehow exists, GET balance returns it as a negative string e.g. `"-50.00"` | Consistent with how positive balances are returned as strings | Low | EXPLORE-1 |
| A4 | Idempotency | Replaying the same `idempotency_key` with the same `account_id` and `amount` returns 2xx and does **not** create a second load (balance moves once). | Tier 1 test passes, confirmed empirically | High ✓ | EXPLORE-2 |
| A5 | Idempotency | Replaying with the same key but a **different amount** is rejected (conflict) rather than silently duplicated. | Standard idempotency semantics | Medium | EXPLORE-2 |
| A6 | Idempotency | Idempotency key TTL is at least 24 hours (sufficient for a test session). | Industry standard; Stripe uses 24h | Medium | EXPLORE-2 |
| A7 | Idempotency | `idempotency_key` is scoped per account — the same key string can be used safely on different accounts. | Most common implementation pattern | Medium | EXPLORE-2 |
| A8 | Status transitions | `suspend` can only be called on an `active` card; `unsuspend` only on a `suspended` card. Calling either on the wrong source state returns a 4xx. | Docs imply reversible pair; terminal states explicitly noted | Medium | EXPLORE-3 |
| A9 | Status transitions | `mark_card_lost` and `mark_card_stolen` can be called from any non-terminal state. | Fraud response should always be available | Medium | EXPLORE-3 |
| A10 | Status transitions | A GET on a `lost` or `stolen` account still returns balance and transaction history. The status blocks operations, not reads. | Standard banking behaviour | Medium | EXPLORE-3 |
| A11 | Field lengths | `maxLength` constraints on name fields (30–50 chars) are **soft** — the API accepts longer values without error. | Observed in Tier 1 testing | High ✓ | EXPLORE-4 |
| A12 | Field lengths | After a write with an over-length value, a subsequent GET returns the value as submitted (not silently truncated). | If truncation occurred, it would cause data loss without warning | Medium | EXPLORE-4 |
| A13 | Amount limits | There is no hard maximum amount enforced. Very large amounts (e.g., 99,999,999) are accepted. | Observed in Tier 1 testing | High ✓ | EXPLORE-1 |
| A14 | Amount limits | Amount = 0 is accepted without error (no-op load). | Observed in Tier 1 testing | High ✓ | EXPLORE-1 |
| A15 | Type coercion | The API accepts string values for integer `amount` fields (`"100"` coerced to `100`). | Observed in Tier 1 testing | High ✓ | EXPLORE-4 |
| A16 | external_tag | Duplicate `external_tag` values are permitted across multiple loads on the same account (not a uniqueness key). | Confirmed in Tier 1 testing | High ✓ | — |
| A17 | date_of_birth | The correct accepted format for Update Cardholder `date_of_birth` is the full ISO timestamp `YYYY-MM-DDTHH:mm:ss.sssZ` (matching the embedded OpenAPI example). | OpenAPI JSON example on the page uses this format; plain `YYYY-MM-DD` rejected | Low | EXPLORE-4 |

---

## Section 3 — Open Exploration Tasks

Each task maps to a test file in `tests/exploration/`. Results feed back into
Section 2 to confirm or update assumptions.

### EXPLORE-1: Negative balance and amount boundary behaviour
**Goal**: Determine what happens when unload amount ≥ available balance.
**Method**:
1. Record balance before (GET `/accounts/{id}/balance`)
2. Attempt unload for exactly `available_balance` amount → expect 201
3. Record balance after → expect 0 (or near-zero)
4. Attempt unload for 1 unit on zero-balance account → observe response
5. Attempt unload for 100 units on zero-balance account → observe response
6. If any unload succeeds below zero → record balance via GET, capture exact value
7. Attempt a subsequent load on a zero/negative account → observe response
8. Attempt amount = 0 load → observe response
9. Attempt amount = -1 load → observe response

**Expected finding**: Steps 4/5 return 4xx with a specific error code. Record it.

---

### EXPLORE-2: Idempotency key semantics
**Goal**: Characterise the full idempotency contract.
**Method**:
1. Load with key K, amount 100 → expect 201, balance +100
2. Replay exactly (same key K, same amount 100) → record status code and body
3. Check balance → must still be +100 only (not +200)
4. Load with key K, amount 200 (different amount, same key) → record status and error
5. Load with key K2 on a **different account** → expect 201 (key not globally unique)
6. Record the time; come back after 1+ hours; replay key K → observe if still idempotent
7. If step 6 is impractical: note that TTL is unconfirmed, document assumption A6

**Expected finding**: Step 2 returns 2xx (original result echoed). Step 4 returns
4xx (conflict). Step 5 returns 201 (key is per-account scoped).

---

### EXPLORE-3: Status transition matrix
**Goal**: Map every valid and invalid transition empirically.
**Method** (use a freshly created cardholder for each path to avoid state contamination):

For each source state, attempt each action and record HTTP status + error code:

| From state | Action to try | Expected | Record actual |
|---|---|---|---|
| active | suspend | 200/201 ✓ | |
| active | unsuspend | 4xx (not suspended) | |
| active | mark_card_active | 200/201 or 4xx? | |
| active | mark_card_lost | 200/201 ✓ | |
| active | mark_card_stolen | 200/201 ✓ | |
| suspended | unsuspend | 200/201 ✓ | |
| suspended | suspend | 4xx (already suspended)? | |
| suspended | mark_card_lost | 200/201 ✓? | |
| lost | mark_card_active | 4xx (terminal) | |
| lost | suspend | 4xx (terminal) | |
| lost | mark_card_lost | 4xx or no-op? | |
| lost | GET balance | 200 (reads allowed?) | |
| lost | GET transactions | 200 (reads allowed?) | |

**After each invalid transition**: capture the exact HTTP status, error `code`,
and error `message`. Build the real error-code table.

---

### EXPLORE-4: Field validation — formats, lengths, and type coercion
**Goal**: Establish what the API actually enforces vs. what the docs say.

**date_of_birth on Update Cardholder**:
1. Try `dd-MM-yyyy` (same as Create) → record result
2. Try `YYYY-MM-DD` (docs text format) → record result
3. Try `YYYY-MM-DDTHH:mm:ss.sssZ` (OpenAPI example format) → record result
4. For whichever succeeds: do a GET cardholder and check what was persisted

**Field length enforcement**:
1. Create cardholder with `first_name` of exactly 30 chars → GET, check persisted value
2. Create cardholder with `first_name` of 51 chars → GET, check what was persisted
   (was it accepted as-is? silently truncated? rejected?)
3. Create cardholder with `first_name` of 200 chars → observe response

**Type coercion**:
1. Send `amount` as string `"100"` → record HTTP status
2. Send `amount` as float `100.5` → record HTTP status and what amount was stored
3. Send `amount` as `null` → record HTTP status

**Phone field**:
1. Create cardholder without `phone` (omit entirely) for program 137 → observe result
   (Is phone required for Canadian programs? Does the API enforce it?)

---

## Section 4 — Questions for the Berkeley VP Session

These are the questions that empirical testing alone cannot answer and require
Berkeley engineering input. They are ordered by importance and framed as
discussion points, not blockers.

1. **Negative balance floor**: Is there a configured minimum balance floor per
   program, or is the behaviour purely "reject any unload that would go negative"?
   This affects whether we need to test partial unloads or just expect hard rejection.

2. **Idempotency key TTL**: What is the retention window for idempotency keys?
   This determines whether retry-safety can be relied on across sessions or only
   within a single API call window.

3. **State transition error codes**: Are invalid status transitions currently
   expected to return a specific error code, or is the staging behaviour (silent
   200 with empty body) intentional for staging vs. production?

4. **`date_of_birth` on Update**: Is the format inconsistency between Create
   (`dd-MM-yyyy`), Update docs text (`YYYY-MM-DD`), and the OpenAPI example
   (`ISO timestamp`) a known defect? What is the canonical correct format?

5. **`external_tag` on Value Load/Unload**: The markdown docs table says required
   (`Yes`) but the API accepts requests without it. Is the docs table wrong, or
   is the enforcement conditional on program configuration?

---

*Last updated: exploration in progress*
*Related test files: `tests/exploration/`*
*Related issues: #8 (date format), #9 (lenient validation), #14–#17 (blocking questions)*
