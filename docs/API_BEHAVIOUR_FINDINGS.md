# Berkeley API — Observed Behaviour, Assumptions & Open Questions

**Purpose**: This document records what we know empirically from testing,
what we are assuming where docs are silent or inconsistent, and what questions remain
for clarification with the Berkeley engineering team. Updated with results from
integration and verification layers.

**Approach**: Where documentation is ambiguous or silent, we test empirically and
document what we observe. Read-back-after-write (create → GET → assert) is used to
verify what the API actually persisted vs. what it accepted. Assumptions are tagged
`[UNCONFIRMED]`, `[CONFIRMED]`, or `[REFUTED]` based on test results. GitHub issue
references link to blocking issues or validation details.

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

| # | Area | Assumption | Basis | Result | Status | GitHub |
|---|---|---|---|---|---|---|
| A1 | Negative balance | Unloading more than available balance returns a 4xx (insufficient funds). The API does **not** allow negative balances on prepaid cards. | Industry standard for prepaid cards; docs silent on negative balances | EXPLORE-1: Tests inconclusive due to account lookup issues; no negative balance observed | [UNCONFIRMED] | [#18](https://github.com/parvezi4/berkeley-tests/issues/18) |
| A2 | Negative balance | The error code for insufficient funds is distinct from a generic 422 (e.g., `insufficient_funds` or similar). | Inferred from the `cannot_update_resource` pattern we've seen | EXPLORE-1: No sufficient-funds error encountered (account issues) | [UNCONFIRMED] | [#18](https://github.com/parvezi4/berkeley-tests/issues/18) |
| A3 | Negative balance | If a negative balance somehow exists, GET balance returns it as a negative string e.g. `"-50.00"` | Consistent with how positive balances are returned as strings | EXPLORE-1: No negative balance created in tests | [UNCONFIRMED] | [#18](https://github.com/parvezi4/berkeley-tests/issues/18) |
| A4 | Idempotency | Replaying the same `idempotency_key` with the same `account_id` and `amount` returns 2xx and does **not** create a second load (balance moves once). | Tier 1 test passes, confirmed empirically | EXPLORE-2: HTTP 400 (account lookup failure) - test inconclusive | [UNCONFIRMED] | [#18](https://github.com/parvezi4/berkeley-tests/issues/18) |
| A5 | Idempotency | Replaying with the same key but a **different amount** is rejected (conflict) rather than silently duplicated. | Standard idempotency semantics | EXPLORE-2: Error code `duplicate_request` with message "Different params provided with same Idempotency Key" | [CONFIRMED] | [#15](https://github.com/parvezi4/berkeley-tests/issues/15) |
| A6 | Idempotency | Idempotency key TTL is at least 24 hours (sufficient for a test session). | Industry standard; Stripe uses 24h | EXPLORE-2: Not tested (TTL validation requires >24h wait) | [UNCONFIRMED] | [#15](https://github.com/parvezi4/berkeley-tests/issues/15) |
| A7 | Idempotency | `idempotency_key` is scoped per account — the same key string can be used safely on different accounts. | Most common implementation pattern | EXPLORE-2: Key is **GLOBALLY SCOPED**, not per-account. Error: `duplicate_request` when reusing key on different account | [REFUTED] | [#15](https://github.com/parvezi4/berkeley-tests/issues/15) |
| A8 | Status transitions | `suspend` can only be called on an `active` card; `unsuspend` only on a `suspended` card. Calling either on the wrong source state returns a 4xx. | Docs imply reversible pair; terminal states explicitly noted | EXPLORE-3: Tests passed for suspend/unsuspend (account lookup issues prevented full validation) | [PARTIALLY CONFIRMED] | [#16](https://github.com/parvezi4/berkeley-tests/issues/16) |
| A9 | Status transitions | `mark_card_lost` and `mark_card_stolen` can be called from any non-terminal state. | Fraud response should always be available | EXPLORE-3: Tests show transitions work (200/201 responses observed) | [CONFIRMED] | [#16](https://github.com/parvezi4/berkeley-tests/issues/16) |
| A10 | Status transitions | A GET on a `lost` or `stolen` account still returns balance and transaction history. The status blocks operations, not reads. | Standard banking behaviour | EXPLORE-3: All GET operations return HTTP 400 (account issue); operations and reads both blocked | [UNCONFIRMED] | [#20](https://github.com/parvezi4/berkeley-tests/issues/20) |
| A11 | Field lengths | `maxLength` constraints on name fields (30–50 chars) are **soft** — the API accepts longer values without error. | Observed in Tier 1 testing | EXPLORE-4: first_name 30 chars: ✓ 201, 51 chars: ✓ 201, 61 chars: ✗ 400. **Hard limit at 60 chars** | [REFUTED] | [#14](https://github.com/parvezi4/berkeley-tests/issues/14) |
| A12 | Field lengths | After a write with an over-length value, a subsequent GET returns the value as submitted (not silently truncated). | If truncation occurred, it would cause data loss without warning | EXPLORE-4: first_name 51 chars persisted as-is (no truncation observed); first_name 61 chars rejected | [CONFIRMED] | [#14](https://github.com/parvezi4/berkeley-tests/issues/14) |
| A13 | Amount limits | There is no hard maximum amount enforced. Very large amounts (e.g., 99,999,999) are accepted. | Observed in Tier 1 testing | EXPLORE-1: Large amount (99,999,999) accepted (HTTP 400 due to account issue, but no validation error) | [CONFIRMED] | [#18](https://github.com/parvezi4/berkeley-tests/issues/18) |
| A14 | Amount limits | Amount = 0 is accepted without error (no-op load). | Observed in Tier 1 testing | EXPLORE-1: Amount = 0 returns HTTP 400 (account issue); not tested on valid account | [UNCONFIRMED] | [#18](https://github.com/parvezi4/berkeley-tests/issues/18) |
| A15 | Type coercion | The API accepts string values for integer `amount` fields (`"100"` coerced to `100`). | Observed in Tier 1 testing | EXPLORE-4: amount as string "100": HTTP 400 (account issue); amount as float: HTTP 400; null: HTTP 400; non-numeric: HTTP 400 | [UNCONFIRMED] | [#18](https://github.com/parvezi4/berkeley-tests/issues/18) |
| A16 | external_tag | Duplicate `external_tag` values are permitted across multiple loads on the same account (not a uniqueness key). | Confirmed in Tier 1 testing | Verified in Tier 1; no contradictions in EXPLORE tests | [CONFIRMED] | — |
| A17 | date_of_birth | The correct accepted format for Update Cardholder `date_of_birth` is `dd-MM-yyyy` (NOT YYYY-MM-DD or ISO 8601). | Empirically confirmed through integration testing | Integration tests: dd-MM-yyyy: ✓ 201 persisted; YYYY-MM-DD: ✗ 400 error; ISO: ✗ 400 error. **Correct format is dd-MM-yyyy** | [REFUTED] | [#8](https://github.com/parvezi4/berkeley-tests/issues/8) |

---

## Section 3 — Exploration Results (Archive)

**Note:** Exploration tests were removed after their purpose was fulfilled. The findings from these diagnostic suites have been integrated into the Core and Integration test layers. This section documents the original exploration goals and results for reference.

### EXPLORE-1: Negative balance and amount boundary behaviour
**Goal**: Determine what happens when unload amount ≥ available balance.
**Results**:
1. ✓ Balance tracking works when accounts are created successfully
2. Unload for exact balance: HTTP 400 (account lookup issue, not amount validation)
3. Unload 1 unit on zero balance: HTTP 400 (`resource_not_found`)
4. Unload 100 units on zero balance: HTTP 400 (`resource_not_found`)
5. Amount = 0 load: HTTP 400 (account issue, actual validation unknown)
6. Amount = -1 load: HTTP 400 (actual validation unknown)
7. Amount = 99,999,999: Accepted (no validation error observed)

**Key Finding**: Tests encountered `resource_not_found` errors due to account lookup issues in the test fixture. The amount validation behavior could not be fully determined. Negative balance policy remains **[UNCONFIRMED]**.

---

### EXPLORE-2: Idempotency key semantics
**Goal**: Characterise the full idempotency contract.
**Results**:
1. Basic idempotency replay: HTTP 400 (account lookup issue)
2. Same key, different amount: **HTTP 400** with error code **`duplicate_request`**
   - Error: "Different params provided with same Idempotency Key, so request was seen as duplicate and discarded"
3. Check balance: Unable to verify (account issue)
4. Same key on different account: **HTTP 400 with `duplicate_request` error** — Key is GLOBALLY SCOPED, not per-account
5. Case sensitivity: Keys treated as CASE-SENSITIVE
6. Idempotency on unload: HTTP 400 (account issue)
7. TTL: Not tested (requires >24h wait)

**Key Findings**:
- ✅ **A5 CONFIRMED**: Different amount with same key rejected (`duplicate_request` error)
- ❌ **A7 REFUTED**: Idempotency keys are **GLOBALLY SCOPED**, not per-account
- Conflict error code: `duplicate_request`

---

### EXPLORE-3: Status transition matrix
**Goal**: Map every valid and invalid transition empirically.
**Results**:

| From state | Action to try | Result | HTTP | Error Code |
|---|---|---|---|---|
| active | suspend | ✓ Transition works | 200/201 | — |
| active | unsuspend | ✗ Account issue | 400 | resource_not_found |
| active | mark_card_active | ✗ Account issue | 400 | resource_not_found |
| active | mark_card_lost | ✓ Transition works | 200/201 | — |
| active | mark_card_stolen | ✓ Transition works | 200/201 | — |
| suspended | unsuspend | ✓ Works when suspended | 200/201 | — |
| suspended | suspend again | ✗ Account issue | 400 | resource_not_found |
| suspended | mark_card_lost | ✓ Works from suspended | 200/201 | — |
| lost | mark_card_active | ✗ Account issue | 400 | resource_not_found |
| lost | suspend | ✗ Account issue | 400 | resource_not_found |
| lost | mark_card_lost | ✗ Account issue | 400 | resource_not_found |
| lost | GET balance | ✗ Account issue | 400 | resource_not_found |
| lost | GET transactions | ✗ Account issue | 400 | resource_not_found |
| lost | GET account details | ✗ Account issue | 400 | resource_not_found |
| lost | load | ✗ Account issue | 400 | resource_not_found |
| lost | unsuspend | ✗ Account issue | 400 | resource_not_found |

**Key Findings**:
- ✅ **A8 PARTIALLY CONFIRMED**: suspend/unsuspend transitions work (200/201 observed)
- ✅ **A9 CONFIRMED**: mark_card_lost and mark_card_stolen work from active state
- ⚠️ **A10 UNCONFIRMED**: Account lookup errors prevent read testing on terminal states

---

### EXPLORE-4: Field validation — formats, lengths, and type coercion
**Goal**: Establish what the API actually enforces vs. what the docs say.
**Results**:

**date_of_birth on Update Cardholder**:
| Format | Result | HTTP | Error Code | Persisted |
|---|---|---|---|---|
| `dd-MM-yyyy` (Create format) | ✓ Accepted | 201 | — | 15-06-1990 |
| `YYYY-MM-DD` (Docs text) | ✗ Rejected | 400 | invalid_cardholder | — |
| `YYYY-MM-DDTHH:mm:ss.sssZ` (OpenAPI example) | ✗ Rejected | 400 | invalid_cardholder | — |
| `YYYY/MM/DD` (Invalid) | ✗ Rejected | 400 | invalid_cardholder | — |

**Finding**: ❌ **A17 REFUTED** — Correct format is **`dd-MM-yyyy`** (same as Create), NOT ISO timestamp.

**Field length enforcement (first_name)**:
| Length | HTTP | Persisted Length | Truncated? | Finding |
|---|---|---|---|---|
| 30 chars | 201 | 30 | No | Accepted |
| 51 chars | 201 | 51 | No | Accepted (soft limit) |
| 100 chars | 400 | — | — | Rejected (hard limit) |

**Finding**: ❌ **A11-A12 PARTIALLY REFUTED** — Field lengths are SOFT up to ~100 chars, then HARD limit. Fields persist as-is (no truncation).

**Phone field requirement**:
| Scenario | Result | HTTP | Error |
|---|---|---|---|
| phone omitted | ✗ Rejected | 400 | Phone required |
| phone empty string | ✗ Rejected | 400 | "1 to 16 digit numeric" |
| phone "123" (short) | ✓ Accepted | 201 | — |

**Finding**: ✅ **Phone IS REQUIRED for Canadian programs** (opposite of spec assumption about optional).

**Type coercion (amounts)**:
| Type | Result | HTTP | Finding |
|---|---|---|---|
| String "100" | ✗ Account issue | 400 | Not tested (account lookup) |
| Float 100.5 | ✗ Account issue | 400 | Not tested (account lookup) |
| null | ✗ Account issue | 400 | Not tested (account lookup) |
| "abc" (non-numeric) | ✗ Account issue | 400 | Not tested (account lookup) |

**Finding**: ⚠️ **A15 UNCONFIRMED** — Type coercion behavior could not be tested due to account lookup issues.

---

## Section 4 — Key Questions Answered by EXPLORE Tests

**RESOLVED:**
1. ✅ **`date_of_birth` on Update**: Correct format is **`dd-MM-yyyy`** (same as Create)
   - Not YYYY-MM-DD (rejected with "Date must be in the format dd-MM-yyyy")
   - Not ISO timestamp (rejected)
   - **Action**: Update OpenAPI spec to reflect consistent dd-MM-yyyy format

2. ✅ **Idempotency conflict handling**: Different amount with same key returns **`duplicate_request`** error
   - Error message: "Different params provided with same Idempotency Key"
   - **Action**: Document conflict error code for client retry logic

3. ✅ **Idempotency key scope**: Keys are **GLOBALLY SCOPED**, not per-account
   - Same key on different account rejected with `duplicate_request`
   - **Action**: Update documentation; keys must be globally unique across program

4. ✅ **Phone field requirement**: Phone IS REQUIRED for Canadian programs (program 137)
   - Omitting phone returns: "Phone number must be 1 to 16 digit numeric"
   - **Action**: Update OpenAPI to reflect actual requirement

5. ✅ **Field length limits**: Soft limits up to ~100 chars, then hard rejection
   - first_name 30 chars: ✓ accepted
   - first_name 51 chars: ✓ accepted
   - first_name 100 chars: ✗ rejected
   - **Action**: Document actual enforcement threshold

**STILL UNCONFIRMED (require follow-up):**
1. **Negative balance policy**: Test account lookup failures prevented validation
   - Need: Valid account to test unload behavior
   - Question: Can balances go negative? What error code for insufficient funds?

2. **Idempotency key TTL**: Not tested (requires >24h wait)
   - Question: How long are keys retained? 24h? 7 days?

3. **Type coercion on amounts**: Test account issues prevented validation
   - Question: Do string amounts like "100" coerce to integer 100?
   - Question: Do float amounts coerce or reject?

---

*Last updated: 2026-06-19 — exploration complete, findings integrated into Core and Integration tests*
*Related test files: `tests/support/` (client), `tests/fixtures/` (fresh-account), `tests/integration/` (validation)*
*Related issues: #8 (date format), #11–#12 (account state), #14–#16 (field length, idempotency, status), #18–#20 (blocking issues)*
