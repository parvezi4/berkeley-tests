# OpenAPI Spec Review — Critical Findings & Updated Test Plan
## Berkeley Payments Card Issuing API v1.0

**Date:** 2026-06-17  
**Based On:** `berkeley-card-issuing-openapi.yaml`  
**Status:** Analysis updated with definitive answers

---

## 🎯 EXECUTIVE SUMMARY

The OpenAPI spec **answers ~70% of our deferred questions** and reveals several critical details:

### What Changed (vs. Earlier Analysis)
- ✅ **Amount format is INTEGER** (smallest currency unit), not decimal
- ✅ **Address cooldown confirmed** with specific error code
- ✅ **Unload has separate endpoint** (not negative amount on load)
- ✅ **Date format mismatch found** (dd-MM-yyyy on create, YYYY-MM-DD on update)
- ✅ **Status actions are keywords**, not just status names
- ✅ **Terminal states confirmed** (lost + stolen can't change)
- ✅ **Phone constraints by region** (Canadian: required; US: optional)
- ✅ **Field length limits specified**
- ✅ **Default pagination values** documented

### Still Missing (10% of questions)
- ❌ Error codes for most scenarios (only "cannot_update_resource" shown)
- ❌ Negative balance policy (not addressed)
- ❌ Idempotency behavior details (prevent duplicate, but exact semantics?)
- ❌ Decimal precision on balance responses (always 2 decimals?)
- ❌ Concurrent operation guarantees
- ❌ Rate limiting details
- ❌ Unload restrictions (min/max amounts? Can unload suspended account?)

---

## 📋 FIELD SPECIFICATIONS — DEFINITIVE (From OpenAPI)

### Cardholders: Create Request

#### Required Fields
```
program_id (integer)
first_name (string, maxLength 50)
last_name (string, maxLength 50)
email (string, maxLength 50, format: email)
city (string, maxLength 100)
state (string, 2-character abbreviation)
postal_code (string)
country (string, "three-digit ISO numeric UN M49 code: USA=840, Canada=124")
```

#### Optional Fields with Constraints
```
middle_name (maxLength 50)
date_of_birth (string, format: "dd-MM-yyyy", required for Canadian programs)
address1 (maxLength 40)
address2 (maxLength 30)
phone (string, Canadian: required + max 16 digits; US: optional + max 10)
emboss_line2 (string, not yet supported on update)
sin (string, SSN or SIN; required for US KYC programs, optional for Canadian)
external_tag (string, user-defined)
load_amount (integer, smallest currency unit; e.g., $10.00 = 1000)
shipping_method (string, region-specific: "US: 1/2/3/4, Canada: 4/8/9")
locale (enum: "en_US", "en_CA", "fr_CA")
subprogram_code (string, may be "virtual" or "physical")
package_code (string, card art + carrier code for physical)
parent_cardholder_id (integer, nullable, feature-dependent)
linked_account_id (integer, nullable)
shipping_address (object, with same address fields)
kyc_additional_client_info (object, for KYC workflows)
```

---

### Cardholders: Update Request

**CRITICAL FINDING:** Date format differs from create!

```
first_name (string)
middle_name (string)
last_name (string)
date_of_birth (string, format: "YYYY-MM-DD") ⚠️ DIFFERENT FROM CREATE
address1, address2, city, state, postal_code, country (strings)
phone (string)
email (string, format: email)
sin (string)
shipping_method (string)
```

**Address Cooldown:**
- Endpoint returns HTTP 422
- Error code: `cannot_update_resource`
- Error message: "Cardholder address was updated recently. Please wait and try again at a later date."

**Note:** All fields optional; only include fields to modify.

---

### Accounts: Status Actions (Not Values)

**Modify Account Status** uses **action keywords**, not status names:

```
mark_card_active       → Activate card
mark_card_lost         → Mark lost (TERMINAL ⚠️)
mark_card_stolen       → Mark stolen (TERMINAL ⚠️)
initiate_card_lost     → Mark lost + trigger card replacement
initiate_card_stolen   → Mark stolen + trigger card replacement
suspend                → Suspend card (reversible)
unsuspend              → Unsuspend card
```

**Terminal Statuses (Cannot Change):**
- `lost` — Cannot transition to any other status
- `stolen` — Cannot transition to any other status

**Example:**
```json
POST /accounts/12345/
{
  "status": "suspend",
  "last_four_digits": "1234"
}
```

---

### Accounts: Status Code Values

These are the **actual status_code values** returned in account responses:

```
active         — Normal, card active
not_active     — Card not yet activated
suspended      — Suspended (reversible via unsuspend)
expired        — Card expired
canceled       — Card canceled
cancelled      — Card cancelled (variant spelling)
lost           — Card lost (TERMINAL ⚠️)
stolen         — Card stolen (TERMINAL ⚠️)
shipping       — Card in shipping
delinquent     — Account delinquent
shipped        — Card shipped
```

---

### Value Loads: Create Request

**CRITICAL FINDING:** external_tag is REQUIRED, not optional!

```
account_id (integer, required)
external_tag (string, required) ⚠️ NOT OPTIONAL
amount (integer, required, smallest currency unit)
   Example: $10.00 = 1000 (not 10.00)
   Min/max NOT documented
message (string, optional, "alphanumeric message")
idempotency_key (string, optional but recommended)
   Purpose: "Unique key to prevent duplicate processing on retry"
transaction_code (string, optional, Canadian programs only)
   Controls transaction message; defaults to "value_load"
```

**Separate Endpoints:**
- `POST /api/v1/card_issuing/value_loads/load` — Load funds
- `POST /api/v1/card_issuing/value_loads/unload` — Unload funds (must be enabled per program)

---

### Value Loads: Response & List

**ValueLoadDetail** (from GET value load or list):
```
id (integer)
account_id (integer)
program_id (integer)
cardholder_id (integer)
external_tag (string)
amount (integer, smallest currency unit)
load_type (enum: "load", "unload") ⚠️ Can be either
message (string)
processor_reference (string, UUID format)
```

**List Value Loads** pagination defaults:
```
Default limit: 50
Default offset: 0
Filters: program_id (required!), external_tag (optional)
```

⚠️ **FINDING:** `program_id` is **required as query parameter** in list value loads.

---

### Programs

```
id (integer)
name (string)
program_type (string)
status (string, example: "active")
currency (string, example: "CAD") ⚠️ 3-letter code, not numeric
```

**Note:** Very few fields; most program configuration is opaque.

---

### Account Balance

```
settled_balance (string)
   "Balance not including pending transactions"
available_balance (string)
   "Amount available for purchases as reported by the processor"
balance (string)
   "Deprecated. Always equals available_balance"
```

**Note:** All returned as **strings** (not integers). Format not specified (always 2 decimals? Pennies only?).

---

## 🚨 CRITICAL FINDINGS

### 1. Date Format Mismatch (Bug Risk)
**Issue:** Create cardholder expects `dd-MM-yyyy`, but update expects `YYYY-MM-DD`

**Test Case:**
```typescript
// Create: correct format
test('create cardholder with dd-MM-yyyy date', async () => {
  const res = await client.createCardholder({
    date_of_birth: "01-01-1980",  // dd-MM-yyyy
    ...
  });
  expect(res.status()).toBe(201);
});

// Update: different format required?
test('update cardholder with YYYY-MM-DD date', async () => {
  const res = await client.updateCardholder(ch.id, {
    date_of_birth: "1980-01-01",  // YYYY-MM-DD
  });
  expect(res.status()).toBe(200);
});

// Edge case: wrong format
test('[negative] update with dd-MM-yyyy format rejected', async () => {
  const res = await client.updateCardholder(ch.id, {
    date_of_birth: "01-01-1980",  // Wrong format for update
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
});
```

**Action:** Add explicit format tests in Tier 1.

---

### 2. Amount is Integer, Not Decimal
**Issue:** Amounts in smallest currency unit (1000 = $10.00), no decimals

**Impact:**
- Load requests must use integers
- Balance responses are strings (need to parse)
- Money conservation math is exact (integer, not float)

**Test Case:**
```typescript
test('load amount must be integer (smallest currency unit)', async () => {
  // Correct: integer
  const res1 = await client.createValueLoad({
    account_id,
    amount: 1000,  // $10.00
    external_tag: 'test'
  });
  expect(res1.status()).toBe(201);

  // Boundary: 1 unit = $0.01 CAD
  const res2 = await client.createValueLoad({
    account_id,
    amount: 1,  // $0.01
    external_tag: 'test'
  });
  expect(res2.status()).toBe(201);

  // Negative: decimal not allowed
  const res3 = await client.createValueLoad({
    account_id,
    amount: 10.50,  // decimal - will this be rejected or truncated?
    external_tag: 'test'
  });
  expect([400, 422].includes(res3.status())).toBe(true);
});
```

---

### 3. External Tag is Required (Not Optional)
**Issue:** My earlier analysis assumed optional; OpenAPI says required

**Impact:**
- Every value load MUST have external_tag
- Tests must always provide it
- Uniqueness/filtering behavior should be verified

**Test Case:**
```typescript
test('[negative] value load without external_tag is rejected', async () => {
  const res = await client.createValueLoad({
    account_id,
    amount: 1000,
    // external_tag: omitted
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
});
```

---

### 4. Unload Has Separate Endpoint
**Issue:** Not just `amount: -1000` on load; distinct `/unload` endpoint

**Impact:**
- Unload feature has separate code path
- Must be explicitly enabled per program
- Different error handling may apply

**Test Case:**
```typescript
test('unload to account succeeds if enabled', async () => {
  const res = await client.createValueUnload({
    account_id,
    amount: 500,  // $5.00 unload
    external_tag: 'unload-test'
  });
  
  if (res.status() === 201) {
    // Unload enabled; verify balance decreased
    const balance = await getBalance(account);
    expect(balance).toBeLessThan(previousBalance);
  } else if (res.status() === 422) {
    // Unload not enabled on this program
    expect(res.status()).toBe(422);
  } else {
    fail('Unexpected status ' + res.status());
  }
});

test('[negative] unload when not enabled returns 4xx', async () => {
  const res = await client.createValueUnload({
    account_id,
    amount: 500,
    external_tag: 'unload-test'
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
  // Or 201 if enabled; depends on program config
});
```

---

### 5. Phone Constraints by Region
**Issue:** Required for Canadian, optional for US; different max lengths

**Test Cases:**
```typescript
test('canadian cardholder phone is required', async () => {
  // locale: en_CA, country: 124 (Canada)
  const res = await client.createCardholder({
    country: '124',
    phone: undefined,  // Required for Canada
    ...
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
});

test('canadian cardholder phone max 16 digits', async () => {
  const res = await client.createCardholder({
    country: '124',
    phone: '1' + '2'.repeat(16),  // 17 chars total
    ...
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
});

test('us cardholder phone optional', async () => {
  const res = await client.createCardholder({
    country: '840',
    phone: undefined,  // Optional for US
    ...
  });
  expect(res.status()).toBe(201);
});

test('us cardholder phone max 10 digits', async () => {
  const res = await client.createCardholder({
    country: '840',
    phone: '12345678901',  // 11 digits, over limit
    ...
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
});
```

---

### 6. Locale Enum Constraint
**Issue:** Only 3 locales allowed: en_US, en_CA, fr_CA

**Test Case:**
```typescript
test('[negative] invalid locale is rejected', async () => {
  const res = await client.createCardholder({
    locale: 'es_ES',  // Spanish, not supported
    ...
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
});

test('valid locales accepted', async () => {
  for (const locale of ['en_US', 'en_CA', 'fr_CA']) {
    const res = await client.createCardholder({
      locale,
      ...
    });
    expect([200, 201]).toContain(res.status());
  }
});
```

---

### 7. Program Currency is 3-Letter Code
**Issue:** Currency is "CAD", not numeric code

**Test Case:**
```typescript
test('program currency is 3-letter ISO code', async () => {
  const res = await client.getProgram();
  const program = BerkeleyClient.unwrap(await res.json());
  expect(program.currency).toMatch(/^[A-Z]{3}$/);  // e.g., CAD, USD
  expect(['CAD', 'USD']).toContain(program.currency);
});
```

---

### 8. List Value Loads Requires program_id Parameter
**Issue:** program_id is REQUIRED in query params (not optional)

**Test Case:**
```typescript
test('[negative] list value loads without program_id fails', async () => {
  const res = await client.listValueLoads({
    // program_id: omitted
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
});

test('list value loads with program_id succeeds', async () => {
  const res = await client.listValueLoads({
    program_id: config.programId
  });
  expect(res.status()).toBe(200);
});
```

---

### 9. List Pagination Defaults
**Finding:** Default limits specified

```
List Cardholders:
  - Default limit: 25
  - Default offset: 0

List Value Loads:
  - Default limit: 50
  - Default offset: 0

List Accounts Transactions:
  - Default page: 1
  - Default limit: 100
```

**Impact:** Tests using defaults will fetch different amounts; affects response size expectations.

---

## 🗺️ UPDATED TEST PLAN

### Tier 1: Now Can Implement (Definitive Specs)

#### 1.1 Date Format Mismatch Test
```
Effort: Low
Depends on: Nothing (spec is clear)
Implementable: NOW

- Create with dd-MM-yyyy: expect 201
- Update with YYYY-MM-DD: expect 200
- Update with dd-MM-yyyy: expect 4xx (wrong format)
- Create with YYYY-MM-DD: expect 4xx (wrong format)
```

#### 1.2 Amount Integer Validation
```
Effort: Low
Depends on: Nothing (spec is clear)
Implementable: NOW

- Load with amount: 1000 → 201
- Load with amount: 1 (penny) → 201
- Load with amount: 10.50 (decimal) → 4xx
- Load with amount: "1000" (string) → 4xx
```

#### 1.3 External Tag Required
```
Effort: Low
Depends on: Nothing (spec is clear)
Implementable: NOW

- Load without external_tag → 4xx
- Load with external_tag: "" (empty) → 4xx or 201?
- Load with external_tag: "tag" → 201
```

#### 1.4 Phone Constraints by Region
```
Effort: Medium
Depends on: Nothing (spec is clear)
Implementable: NOW

- Canadian + no phone → 4xx
- Canadian + 17-digit phone → 4xx
- US + no phone → 201 (optional)
- US + 11-digit phone → 4xx
```

#### 1.5 Address Cooldown Error
```
Effort: Low
Depends on: Nothing (error code documented)
Implementable: NOW

- Update address → 200
- Update address again immediately → 422 with code "cannot_update_resource"
- Wait (duration unknown) → retry should succeed?
```

#### 1.6 Status Actions (Not Names)
```
Effort: Low
Depends on: Nothing (spec is clear)
Implementable: NOW

- status: "suspend" → 200/201
- status: "unsuspend" → 200/201
- status: "suspended" (state name, not action) → 4xx?
- status: "mark_card_lost" → 200/201 + terminal
- Attempt to change from lost → 4xx
```

#### 1.7 Unload Endpoint Exists
```
Effort: Medium
Depends on: Program config (unload enabled?)
Implementable: NOW (with lenient checks)

- POST /unload with amount: 500 → 201 or 422 (if not enabled)
- If 201: balance decreased by 500
- If 422: program doesn't support unload
```

### Tier 2: Refine Boundary Tests (Now Have Limits)

#### 2.1 Field Length Validation
```
first_name: maxLength 50
middle_name: maxLength 50
last_name: maxLength 50
address1: maxLength 40
address2: maxLength 30
city: maxLength 100
email: maxLength 50

Test cases for each:
- At limit (e.g., first_name: "a"*50) → 201
- Over limit (e.g., first_name: "a"*51) → 4xx
```

#### 2.2 Email Format Validation
```
Schema says: format: email, maxLength 50

Test cases:
- "user@example.com" → 201
- "user+tag@example.com" → 201
- "a"*40 + "@example.com" (57 chars, over 50) → 4xx?
- "invalid-email" (no @) → 4xx
- "user@" (no domain) → 4xx
```

#### 2.3 Country Code Validation
```
Schema says: "ISO numeric UN M49 country code"
Examples: USA=840, Canada=124

Test cases:
- country: "840" (US) → 201
- country: "124" (Canada) → 201
- country: "999" (invalid) → 4xx
- country: "US" (alpha-2) → 4xx?
- country: "USA" (alpha-3) → 4xx?
```

#### 2.4 Locale Enum Validation
```
Allowed: en_US, en_CA, fr_CA

Test cases:
- locale: "en_US" → 201
- locale: "en_CA" → 201
- locale: "fr_CA" → 201
- locale: "es_ES" → 4xx
- locale: "" → 4xx
```

---

## ❓ REMAINING QUESTIONS FOR BERKELEY

Based on OpenAPI spec, still need clarification on:

### High Priority

1. **Negative Balance Policy**
   - Can account balance go negative?
   - When can it occur (unload, refund, penalty)?
   - Which operations blocked if negative?

2. **Unload Restrictions**
   - Min/max unload amounts?
   - Can unload to suspended account?
   - Can unload to lost/stolen account?
   - What if unload exceeds balance (insufficient funds)?

3. **Idempotency Semantics**
   - If replay value load with same idempotency_key but different amount: error or ignore amount?
   - How long is key retained? (24h? 30d? Forever?)
   - Does idempotency work for cardholder create? (email acts as key?)

4. **Balance Format**
   - Always 2 decimals (pennies)? Or variable precision?
   - Example: "500.00" or "500" or "500.5"?
   - Negative balance format: "-50.00"?

5. **Error Codes**
   - Comprehensive list of error.code values? (Only "cannot_update_resource" shown)
   - When to expect 400 vs 422 vs 409?

6. **Address Cooldown Duration**
   - How long must we wait before retrying address update?
   - Is it 24 hours? Per-program config?
   - Can we query the cooldown remaining?

### Medium Priority

7. **Email Uniqueness**
   - Unique per program or globally?
   - Case-sensitive match or normalized?
   - Duplicate attempt: error code?

8. **Phone Formatting**
   - Stored as-is or normalized? ("+1-555-0100" → "15550100"?)
   - Validation: strict E.164 or lenient?

9. **Value Load Processor Reference**
   - Is processor_reference always a UUID?
   - Can it be used to query the load later? (Besides by load ID)

10. **Concurrent Load Behavior**
    - Are balance updates atomic?
    - Can two simultaneous $50 loads race to only apply one?
    - Ordering: first-write-wins or last-write-wins?

### Low Priority (Can Infer)

11. **Status Transition Rules**
    - Are all action→state transitions valid?
    - Example: Can we go from "canceled" → "active"?
    - Or only documented transitions allowed?

12. **Card Array Structure**
    - Empty on new account or missing field?
    - Multiple cards possible?
    - Primary card indicator?

13. **Parent Cardholder Feature**
    - When is parent_cardholder_id relevant?
    - Cascading deletes if parent deleted?

---

## 📊 UPDATED IMPLEMENTATION ROADMAP

### Week 1: Tier 1 (Now Implementable) — 5-7 days

```
Day 1: Date format mismatch
  ✓ Create dd-MM-yyyy, update YYYY-MM-DD
  ✓ Wrong format in each → 4xx

Day 2: Amount integer validation
  ✓ Integer accepted, decimal rejected
  ✓ Boundary: 1 (penny), large amounts

Day 3: External tag required
  ✓ Missing → 4xx
  ✓ Empty → behavior?

Day 4: Phone constraints by region
  ✓ Canadian required, US optional
  ✓ Length limits enforced

Day 5: Address cooldown + Status actions
  ✓ Cooldown error code
  ✓ Action keywords work, state names don't

Day 6-7: Unload endpoint + field lengths
  ✓ Separate /unload endpoint works
  ✓ Field maxLength boundaries
```

### Week 2: Tier 2 (Boundary Tests) — 5 days

```
Day 1-2: Field constraint matrix
  ✓ Email maxLength 50, format validation
  ✓ Name maxLength 50
  ✓ Address1/2, city maxLength tests
  ✓ Country code validation

Day 3: Locale enum + currency format
  ✓ Only 3 locales allowed
  ✓ Currency is 3-letter code

Day 4: Pagination defaults + filters
  ✓ Verify default limits (25, 50, 100)
  ✓ program_id required on value loads
  ✓ Filter by external_tag

Day 5: Buffer + refinement
```

### Week 3: Tier 3 (Robustness) — 5 days

```
Day 1: Multi-load conservation
  ✓ Sum of loads = balance increase
  ✓ Integer math (no float errors)

Day 2: Processor reference consistency
  ✓ Same ref = same account ID
  ✓ UUID format validation

Day 3: Type validation
  ✓ Balance strings
  ✓ ID integers
  ✓ Timestamp ISO 8601

Day 4: Concurrent operations
  ✓ Simultaneous loads to same account
  ✓ Race on status changes

Day 5: Documentation + integration
```

---

## 🎬 QUESTIONS FOR YOU

### Q1: Date Format Handling
The spec shows **different date formats for create vs update** (dd-MM-yyyy vs YYYY-MM-DD). Is this intentional, or a doc error?

**Recommendation:** Add test to verify behavior; may be a bug in the API.

### Q2: Amount Min/Max
OpenAPI doesn't specify min/max load amounts. Should we ask Berkeley?

**Options:**
- A) Add to BERKELEY_API_CLARIFICATIONS.md
- B) Infer from tests (e.g., try 1, 100, 1_000_000 and see)
- C) Assume reasonable: 1 ($0.01) to 999_999_999 ($9,999,999.99)

### Q3: Unload Testing
Unload may not be enabled on your staging program. How should we handle?

**Options:**
- A) Lenient test (201 success if enabled, 422 ok if disabled)
- B) Skip unload tests until confirmed enabled
- C) Ask Berkeley if it's enabled on your program

### Q4: External Tag Uniqueness
Spec says external_tag required, but doesn't say if unique. Test behavior?

**Options:**
- A) Assume not unique (duplicates allowed)
- B) Test: create two loads with same external_tag → what happens?
- C) Ask Berkeley for clarification

### Q5: Priority of Remaining Questions
Should I revise BERKELEY_API_CLARIFICATIONS.md to:
- A) **Remove answered questions** (most are now known)
- B) **Keep as-is** for completeness
- C) **Create new doc** with only remaining ~10 questions?

---

## ✅ NEXT STEPS

### Immediate (Today)
1. Answer the 5 questions above ⬆️
2. Review which Tier 1 tests look highest-value

### This Week
3. Update client code if needed (e.g., handle date format mismatch)
4. Implement Tier 1 tests (date format, amount integer, phone constraints)
5. Run tests against staging; document unexpected behavior

### Next Week
6. Implement Tier 2 boundary tests (field lengths, enum validation)
7. Clarify remaining questions with Berkeley (async)
8. Add Tier 3 tests as answers arrive

---

## 📝 SUMMARY TABLE: What We Know Now

| Question | Status | Answer |
|----------|--------|--------|
| Amount format? | ✅ KNOWN | Integer (smallest unit) |
| External tag required? | ✅ KNOWN | Yes |
| Date format? | ✅ KNOWN | dd-MM-yyyy (create), YYYY-MM-DD (update) |
| Phone required? | ✅ KNOWN | Canadian yes, US no |
| Field lengths? | ✅ KNOWN | Specified: 50, 40, 30, 100, etc. |
| Status actions? | ✅ KNOWN | Keywords: suspend, unsuspend, mark_card_lost, etc. |
| Unload endpoint? | ✅ KNOWN | Separate POST /unload |
| Locale enum? | ✅ KNOWN | en_US, en_CA, fr_CA only |
| Address cooldown? | ✅ KNOWN | Error: cannot_update_resource |
| Negative balance? | ❌ UNKNOWN | Need Berkeley answer |
| Idempotency exact semantics? | ⚠️ PARTIAL | "Prevent duplicate" but details unclear |
| Error codes comprehensive list? | ❌ UNKNOWN | Need Berkeley answer |
| Concurrent atomicity? | ❌ UNKNOWN | Need Berkeley answer |
| Balance format (decimals)? | ⚠️ PARTIAL | Returned as string, precision unclear |

