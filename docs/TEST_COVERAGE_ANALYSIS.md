# Berkeley API Test Coverage Analysis
## Boundary Values, Business Logic, and Negative Test Matrix

**Date:** 2026-06-17  
**Scope:** Black-box testing strategy for Card Issuing API (Staging)  
**Priority Order:** Value Loads > Accounts/Cards > Cardholders > Programs  
**Critical Concern:** Negative balance handling (banking system constraint)

---

## EXECUTIVE SUMMARY

### Current Coverage
- ✅ Core happy paths for all 4 resource groups
- ✅ Money conservation (single load)
- ✅ Idempotency (single load replay)
- ✅ Auth isolation (invalid token → 401/403)
- ✅ State transitions (suspend/unsuspend)
- ✅ Basic negative paths (non-existent IDs, missing fields)

### Critical Gaps
1. **No boundary value testing** for string lengths, numeric ranges, formats
2. **No negative balance scenario tests** (critical for banking)
3. **No multi-load conservation tests** (verify sums, not just single)
4. **No type coercion tests** (wrong type for amount, email, etc.)
5. **No field constraint validation** (min/max length, enum values)
6. **No pagination edge cases** (limit=0, offset > total)
7. **No concurrent operation tests** (race conditions on balance updates)
8. **No business logic invariants** (cardholder ↔ account linking, processor_ref consistency)

---

## TIER 1: VALUE LOADS (HIGHEST PRIORITY)

**Why:** Direct financial impact; defects = money lost or created.

### Field Specifications & Boundary Values

#### `account_id` (numeric, required)
```
Valid Range:     1 to 2,147,483,647 (int32)
Test Cases:
  ✓ Valid existing account → 201
  ✓ account_id: 0 → 4xx (invalid)
  ✓ account_id: -1 → 4xx (invalid)
  ✓ account_id: 999_999_999 (non-existent) → 4xx/404
  ✓ account_id: 2_147_483_648 (overflow) → behavior?
  ✓ account_id: null → 4xx (required)
```

#### `amount` (decimal, required)
**Critical: Banking system constraint — negative amounts are a high-risk vector**
```
Valid Range:     Must clarify from docs: 0.01 to ???
                 Sign handling: only positive allowed?
                 Precision: cents or smaller?

Test Cases:
  ✓ amount: 100 → 201 (standard)
  ✓ amount: 0.01 → 201 (minimum, likely)
  ✓ amount: 0.001 → behavior? (precision limit)
  ✓ amount: 0 → 4xx or 201? (invalid or allowed?)
  ✓ amount: -100 → MUST REJECT (critical)
  ✓ amount: -0.01 → MUST REJECT
  ✓ amount: 999_999_999.99 → 201 or 400? (max?)
  ✓ amount: "100" (string) → 4xx (type mismatch)
  ✓ amount: 100.123 (3 decimals) → truncate to 2 or reject?
  ✓ amount: 1.999999999 (float precision artifact) → ?
```

#### `external_tag` (string, optional but recommended)
```
Valid Range:     Max length? Format? Uniqueness?
Constraints:     Likely max 100-255 chars

Test Cases:
  ✓ external_tag: "qa-unique-tag" → 201
  ✓ external_tag: "a" * 255 → 201 or 4xx at limit?
  ✓ external_tag: "a" * 256 → behavior?
  ✓ external_tag: "" (empty) → allowed or 4xx?
  ✓ external_tag: duplicate (same as previous load) → allowed or rejected?
  ✓ external_tag: "tag with spaces" → 201
  ✓ external_tag: "tag/with/slashes" → 201
  ✓ external_tag: "tag\nwith\nnewlines" → 201 or 4xx?
  ✓ external_tag: unicode "тег" → accepted?
```

#### `idempotency_key` (string, optional but CRITICAL)
```
Valid Range:     Must be unique per request; replayed key = same result
Constraints:     Max length? Format?

Test Cases:
  ✓ idempotency_key: "idem-key-123" + amount: 100 → 201
  ✓ [Replay] idempotency_key: "idem-key-123" + amount: 100 → 200 or 201 (same result)
  ✓ [Replay] idempotency_key: "idem-key-123" + amount: 50 (different amount) → error?
  ✓ idempotency_key: null → allowed without idempotency?
  ✓ idempotency_key: "" (empty) → valid or invalid?
  ✓ idempotency_key: same key, different account → separate loads or error?
  ✓ idempotency_key: "a" * 256+ → behavior at length limit?
```

#### `message` (string, optional)
```
Valid Range:     Max 255-512 chars?
Test Cases:
  ✓ message: "QA load test" → 201
  ✓ message: "" → 201
  ✓ message: "a" * 1000 → truncated or 4xx?
  ✓ message: null vs omitted → both allowed?
```

---

### Business Logic Tests (Value Loads)

#### **Test 1: Money Conservation — Single Load**
```typescript
Before Balance:    B₀
Create Load:       +100
Expected After:    B₀ + 100
Assertion:         actual == expected (exact, not ±1)
```

#### **Test 2: Money Conservation — Multiple Loads (NEW)**
```typescript
Before:            B₀ = 500
Load 1:            +100 → B₁ = 600
Load 2:            +50.25 → B₂ = 650.25
Load 3:            +33.33 → B₃ = 683.58

Verification:
  - Each load applied in order
  - Final balance = B₀ + sum(all loads)
  - No gaps or duplicates
```

#### **Test 3: Negative Balance Handling (CRITICAL)**
```
Scenario 1: Load to suspended account
  - Prerequisite: Create account, suspend it
  - Attempt: Load 100 to suspended account
  - Expected: Either (a) 4xx rejection, or (b) 201 but balance tracking updated
  - Risk: If balance increases on suspended account, consumer can't trust balance

Scenario 2: Negative balance check
  - Prerequisite: Account has -$50 balance (if allowed)
  - Attempt: Load 100 to negative-balance account
  - Expected: Balance becomes -50 + 100 = 50
  - Assertion: No double-charging or skip due to negative state
```

#### **Test 4: Idempotency — Exact Replay (CRITICAL)**
```
Request 1:         POST /value_loads/load with idempotency_key=K₁, amount=100
                   Response: 201, load_id=L₁

Request 2 (Replay): POST /value_loads/load with idempotency_key=K₁, amount=100
                   Expected: 200 or 201, load_id=L₁ (same load)
                   Balance:  +100 total, NOT +200

Assertion:         
  - Replay returns same load ID
  - Balance moved only once
  - No error thrown (idempotency ≠ rejection)
```

#### **Test 5: Decimal Precision & Rounding (CRITICAL)**
```
Loads:  
  - 0.01 + 0.02 + 0.03 = 0.06 (exact)
  - 1/3 + 1/3 + 1/3 = 1.00 (rounding artifact risk)
  - 0.1 + 0.2 = 0.3 (float math risk)

Assertion:
  - Final balance = expected (no floating-point surprises)
  - If precision limited to cents, verify no sub-cent loss
```

#### **Test 6: Concurrent Loads (Load Test Extension)**
```
Parallel Loads:    3 simultaneous requests to same account
Request 1:         amount: 50
Request 2:         amount: 30
Request 3:         amount: 20

Expected:
  - All 3 succeed (201)
  - Final balance = B₀ + 100 (all applied)
  - No double-charging
  - No lost updates

Risk: If provider has serialization issues, concurrent loads may:
  - Only apply 2 of 3 (lost update)
  - Apply same load twice (race on read-modify-write)
```

#### **Test 7: Load to Deleted Account (If Supported)**
```
Scenario:  Cardholder deleted, account still queryable
Attempt:   Load to deleted account
Expected:  4xx (can't load to deleted) or 201 (historical loads allowed)
Risk:      If 201 allowed, balance should still update correctly
```

---

## TIER 2: ACCOUNTS & CARDS

### Field Specifications & Boundary Values

#### Lookup: `processor_reference` (string, unique identifier)
```
Valid Range:     Format unknown from code; assume alphanumeric + "-"
                 Typical length: 20-36 chars

Test Cases:
  ✓ processor_reference: "proc-ref-abc123" → 200 (valid)
  ✓ processor_reference: "" (empty) → 4xx
  ✓ processor_reference: "nonexistent" → 4xx/404
  ✓ processor_reference: "proc-ref-abc123" (case variation) → same account or error?
  ✓ processor_reference: "a" * 256 → overflow or 4xx?
  ✓ processor_reference: "proc-ref-abc123 " (trailing space) → trimmed or rejected?
  ✓ processor_reference: "proc/ref/abc123" (special chars) → allowed?
```

#### Lookup: `account_id` (numeric)
```
Test Cases:
  ✓ account_id: valid → 200
  ✓ account_id: 0 or negative → 4xx
  ✓ account_id: 999_999_999 → 4xx/404
```

#### Balance Response Fields
```
Fields to Validate:
  - settled_balance: string, matches /^-?\d+(\.\d{2})?$/
  - available_balance: string, matches /^-?\d+(\.\d{2})?$/
  - balance: string, matches /^-?\d+(\.\d{2})?$/

Test Cases:
  ✓ All fields present
  ✓ All are valid decimal strings (parseFloat works)
  ✓ settled_balance ≤ available_balance ≤ balance (if this ordering assumed)
  ✓ No negative balances (or handle negatives correctly if allowed)
  ✓ Precision is exactly 2 decimals (no 123.4500000001)
```

#### Status Modifications: `status` (enum)
```
Valid Values:    'suspend', 'unsuspend', ??? (deduce from docs)

Test Cases:
  ✓ status: "suspend" → 200/201
  ✓ status: "unsuspend" → 200/201
  ✓ status: "SUSPEND" (case mismatch) → error?
  ✓ status: "invalid_status" → 4xx
  ✓ status: "" (empty) → 4xx
  ✓ status: null → 4xx

State Transitions:
  ✓ active → suspend → active (reversible)
  ✓ suspend → suspend (idempotent or error?)
  ✓ suspended → other_status (e.g., "expire") → allowed?
  ✓ Suspended account balance: can still read? load? (should yes for both)
```

---

### Business Logic Tests (Accounts & Cards)

#### **Test 1: Processor Reference Consistency (NEW)**
```
Create Cardholder:        CH₁ with processor_ref = "proc-abc123"
Resolve by Processor Ref: GET /accounts?processor_reference=proc-abc123
                          → account_id = A₁

Get Account Direct:       GET /accounts/A₁
                          → processor_reference = "proc-abc123"

Second Resolution:        GET /accounts?processor_reference=proc-abc123
                          → account_id must = A₁ (not changed)

Assertion: Same processor_ref always resolves to same account_id
```

#### **Test 2: Cardholder ↔ Account Linking (NEW)**
```
Create Cardholder:        CH₁
Extract:                  cardholder_id = 123, processor_ref = "proc-abc"

Resolve Account:          GET /accounts?processor_reference=proc-abc
Extract:                  account_id = 456

Get Account:              GET /accounts/456
Verify:                   account.cardholder_id == 123
                          account.processor_reference == "proc-abc"

Assertion:
  - Cardholder creates exactly 1 account
  - Linking is bidirectional and consistent
  - IDs match across calls
```

#### **Test 3: Card Array Presence (NEW)**
```
Get Account:              GET /accounts/{account_id}
Verify:
  - cards array present (even if empty)
  - cards[0] is primary (first card)
  - cards[i].last_four_digits present (if card physical/active)

Edge Case:
  - Newly created cardholder: cards array empty or omitted?
  - After load: cards array unchanged?
```

#### **Test 4: Balance Read Consistency (NEW)**
```
Get Balance:              B₁ at time T₁
Wait:                     T = 100ms
Get Balance Again:        B₂ at time T₂

Expectation:
  - B₁ == B₂ (no in-flight loads between reads)
  - If loads happened: B₂ = B₁ + load_amount

Assertion: Balance doesn't drift without cause
```

#### **Test 5: Status Transition Matrix (NEW)**
```
Current Status    →  Attempt         →  Expected
─────────────────────────────────────────────────
active            →  suspend         →  200/201
active            →  unsuspend       →  4xx (not suspended)
suspended         →  unsuspend       →  200/201
suspended         →  suspend         →  200/201 (idempotent?) or 4xx?
active            →  invalid_status  →  4xx

Assertion:
  - Transitions follow business rules
  - Idempotency: suspend → suspend → no error (or lenient 200)
```

---

## TIER 3: CARDHOLDERS

### Field Specifications & Boundary Values

#### `first_name`, `last_name` (string, required)
```
Valid Range:     Likely 1-50 chars, alphanumeric + spaces/hyphens
Constraints:     Required, no special chars?

Test Cases:
  ✓ first_name: "John" → 201
  ✓ first_name: "J" (single char) → 201
  ✓ first_name: "a" * 100 (over limit) → 4xx?
  ✓ first_name: "" (empty) → 4xx (required)
  ✓ first_name: "Jean-Pierre" (hyphen) → 201
  ✓ first_name: "José" (accent) → 201 or 4xx?
  ✓ first_name: "李" (CJK) → 201 or 4xx?
  ✓ first_name: "123" (numbers only) → 201
  ✓ first_name: "john@example.com" (email-like) → 201
  ✓ first_name: "John\nSmith" (newline) → 4xx
```

#### `email` (string, required, unique-per-program)
```
Valid Range:     RFC 5322 format, max 255 chars
Constraints:     Required, unique per program

Test Cases:
  ✓ email: "user@example.com" → 201
  ✓ email: "user+tag@example.com" (plus addressing) → 201
  ✓ email: "user@subdomain.example.com" → 201
  ✓ email: "user.name@example.com" (dots) → 201
  ✓ email: "user_name@example.com" (underscore) → 201
  ✓ email: "" (empty) → 4xx (required)
  ✓ email: "user" (no @) → 4xx (invalid)
  ✓ email: "@example.com" (no local part) → 4xx
  ✓ email: "user@" (no domain) → 4xx
  ✓ email: "a" * 240 + "@example.com" (over 255) → 4xx?
  ✓ email: "USER@EXAMPLE.COM" (uppercase) → accepted (normalize to lowercase?)
  ✓ email: "user@example.com " (trailing space) → trimmed or rejected?
  ✓ email: same as previous cardholder (duplicate) → 4xx (uniqueness)
  ✓ email: "user@example.com", then retry with unique stamp → 201 (idempotency via stamp)
```

#### `phone` (string, optional but typical)
```
Valid Range:     Format unknown; assume E.164 or 10-digit US
Constraints:     Optional or required?

Test Cases:
  ✓ phone: "1231231234" (10-digit) → 201
  ✓ phone: "+1-555-0123" (formatted) → 201 or normalized?
  ✓ phone: "" (empty) → 201 (optional)
  ✓ phone: "123" (too short) → 4xx or accepted?
  ✓ phone: "a" * 20 (very long) → 4xx?
  ✓ phone: "ext.123" (with text) → 4xx or parsed?
  ✓ phone: "+1-555-0123 ext. 456" → behavior?
```

#### `address1`, `address2` (string, required/optional)
```
Valid Range:     Likely 1-100 chars
Constraints:     Required? Updated with cooldown?

Test Cases:
  ✓ address1: "123 Main Street" → 201
  ✓ address1: "123 Main Street, Apt 2" (with apt) → 201
  ✓ address1: "" (empty) → 4xx if required, 201 if optional
  ✓ address1: "a" * 256 → 4xx?
  ✓ address2: "Suite 100" → 201
  ✓ address2: "" or omitted → 201

Address Update Cooldown (NEW):
  ✓ Create CH with address1 = "123 Old St"
  ✓ Update CH immediately with address1 = "456 New St" → 201 or 4xx?
  ✓ If 4xx: try again after delay (e.g., 24h) → 201?
```

#### `postal_code` (string, required)
```
Valid Range:     Format varies by country:
                 US: 5-digit or 9-digit (XXXXX or XXXXX-XXXX)
                 Canada: Alphanumeric (A1A 1A1)

Test Cases:
  ✓ postal_code: "84121" (US 5-digit) → 201
  ✓ postal_code: "84121-1234" (US 9-digit) → 201
  ✓ postal_code: "A1A 1A1" (Canada) → 201
  ✓ postal_code: "A1A1A1" (Canada no space) → accepted or normalized?
  ✓ postal_code: "" (empty) → 4xx
  ✓ postal_code: "12345678" (8-digit, invalid) → 4xx?
  ✓ postal_code: "ABC" (too short) → 4xx?
```

#### `country`, `state` (enum-like)
```
Valid Range:     ISO 3166-1 numeric (e.g., "840" = US)
                 State: 2-letter (e.g., "UT", "CA")

Test Cases (country):
  ✓ country: "840" (US) → 201
  ✓ country: "124" (Canada) → 201
  ✓ country: "USA" (ISO alpha-3, if allowed) → 201 or 4xx?
  ✓ country: "US" (ISO alpha-2) → 201 or 4xx?
  ✓ country: "1" (invalid) → 4xx
  ✓ country: "999999" (non-existent) → 4xx

Test Cases (state):
  ✓ state: "UT" (valid US) → 201
  ✓ state: "CA" (valid US) → 201
  ✓ state: "ZZ" (invalid US) → 4xx?
  ✓ state: "ut" (lowercase) → normalized to "UT" or rejected?
  ✓ state: "Utah" (full name) → 4xx (expect 2-letter)
  ✓ state: "" (empty for US) → 4xx (required for US?)
```

#### `city` (string, required)
```
Valid Range:     Likely 1-50 chars

Test Cases:
  ✓ city: "Moonbase One" → 201
  ✓ city: "New York" (two words) → 201
  ✓ city: "São Paulo" (accent) → 201
  ✓ city: "" (empty) → 4xx
  ✓ city: "a" * 256 → 4xx?
```

#### `date_of_birth` (date, optional)
```
Valid Range:     Format: "MM-DD-YYYY" or ISO 8601?
                 Age: adult (18+) required?

Test Cases:
  ✓ date_of_birth: "01-01-1980" → 201
  ✓ date_of_birth: "1980-01-01" (ISO format) → 201 or 4xx?
  ✓ date_of_birth: "" (empty, optional) → 201
  ✓ date_of_birth: "13-01-1980" (invalid month) → 4xx
  ✓ date_of_birth: "01-32-1980" (invalid day) → 4xx
  ✓ date_of_birth: "01-01-2010" (minor, if 18+ required) → 4xx?
  ✓ date_of_birth: "01-01-1900" (very old) → 201 or warning?
```

#### `program_id` (numeric, required)
```
Valid Range:     Must be your assigned program

Test Cases:
  ✓ program_id: 137 (your program) → 201
  ✓ program_id: 999 (not your program) → 4xx/403 (auth error)
  ✓ program_id: 0 or negative → 4xx
```

#### `load_amount` (decimal, optional)
```
Valid Range:     Positive, likely 0 to $999,999.99

Test Cases:
  ✓ load_amount: 1000 → 201 (standard)
  ✓ load_amount: 0.01 (penny) → 201
  ✓ load_amount: 0 → 201 or 4xx? (no load?)
  ✓ load_amount: -100 (negative) → MUST REJECT 4xx
  ✓ load_amount: 999999.99 → 201
  ✓ load_amount: 1000000 (over limit) → 4xx?
  ✓ load_amount: omitted → 201 (no initial load)
```

#### `external_tag` (string, optional)
```
Valid Range:     Max 100-255 chars, uniqueness?

Test Cases:
  ✓ external_tag: "qa-ch-12345" → 201
  ✓ external_tag: "a" * 255 → 201 or 4xx at limit?
  ✓ external_tag: duplicate (same as previous CH) → allowed or error?
  ✓ external_tag: "" → 201 (optional)
```

---

### Business Logic Tests (Cardholders)

#### **Test 1: Cardholder Create Idempotency (NEW)**
```
Request 1:  POST /cardholders with email=E, external_tag=T
            → 201, cardholder_id = CH₁

Request 2:  POST /cardholders with email=E, external_tag=T
            → Expected: 201 or 4xx? (duplicate detection)
            
If 201:     cardholder_id must == CH₁ (same cardholder, not new)
If 4xx:     Duplicate error (each email unique per program)

Assertion:  Same email doesn't create two cardholders
```

#### **Test 2: Account Creation on Cardholder Create (NEW)**
```
Before:     No account for this cardholder
Create CH:  POST /cardholders → 201
Extract:    primary_processor_reference = P

Check:      GET /accounts?processor_reference=P
            → 200, account found
            → account.cardholder_id = CH id

Assertion:  Creating cardholder auto-creates 1 primary account
```

#### **Test 3: Initial Load Amount Applied (NEW)**
```
Before:     Account A has balance B₀
Create CH:  load_amount = 1000
After:      Account balance = B₀ + 1000

Assertion:  load_amount applied at creation, counted in balance
```

#### **Test 4: Update Doesn't Wipe Other Fields (NEW)**
```
Create CH:  first_name="John", phone="5550100", address1="Main St"
Update:     PATCH /cardholders/{id} with { first_name="Jane" }
Verify:     phone == "5550100" (unchanged)
            address1 == "Main St" (unchanged)

Assertion:  Partial updates don't delete unspecified fields
```

#### **Test 5: Immutable Field Detection (NEW)**
```
Create CH:  email="user@example.com"
Attempt:    Update with email="different@example.com"
Expected:   4xx (email immutable) or silently ignored (201, email unchanged)

Assertion:  Identify which fields can't be updated
```

---

## TIER 4: PROGRAMS

### Field Specifications & Boundary Values

#### `program_id` (numeric)
```
Valid Range:     Your assigned program (e.g., 137)

Test Cases:
  ✓ program_id: 137 (yours) → 200
  ✓ program_id: 999 (not yours) → 4xx/403
  ✓ program_id: 0 or negative → 4xx
```

#### Response Fields
```
Expected Fields:
  - id: number
  - name: string
  - program_type: string (enum?)
  - status: string (enum: "active", others?)
  - currency: string (ISO 4217, e.g., "USD", "CAD")

Test Cases:
  ✓ All fields present
  ✓ status == "active"
  ✓ currency in ["USD", "CAD", ...] (known values)
  ✓ name is non-empty string
  ✓ program_type is known value
```

### Business Logic Tests (Programs)

#### **Test 1: Program Isolation (NEW)**
```
Create CH:      program_id = 137 (your program)
Attempt:        Create CH with program_id = 138 (different program)
                Using same API key

Expected:       4xx/403 (forbidden)
                OR 201 but cardholder not visible in your program

Assertion:      API key scope limited to assigned program(s)
```

#### **Test 2: Program Balance Consistency (NEW)**
```
Get Balance:    GET /programs/137/balance → B_prog
Sum Accounts:   Get all accounts in program, sum balances → B_sum

Expected:       B_prog == B_sum (or B_prog >= B_sum if platform holds reserve)

Assertion:      Program balance = sum of all account balances
```

---

## NEGATIVE BALANCE: DETAILED ANALYSIS

### Banking System Constraint
Negative balances are a **critical risk vector** in payment systems. Testing must clarify:

1. **Is negative balance allowed?** (Some systems allow overdraft; others don't)
2. **When can negative occur?** (Refund/unload? Fraud reversal? Penalty?)
3. **What operations are blocked when negative?** (Can't load? Can't spend?)

### Test Cases

```typescript
// Scenario 1: Query non-existent account → balance = 0 or error?
test('balance for new account without loads', async () => {
  const ch = await createCardholder();
  const bal = await getBalance(ch.account_id);
  expect(bal).toBe('0.00'); // or '0'?
});

// Scenario 2: Attempt load resulting in very small balance
test('load to account with 0 balance', async () => {
  const bal = await getBalance(account);
  expect(bal).toBe('0.00');
  const res = await load(account, 0.01);
  expect(res.status()).toBe(201);
  const newBal = await getBalance(account);
  expect(newBal).toBe('0.01');
});

// Scenario 3: CRITICAL — Negative load attempt
test('[negative] load with negative amount is rejected', async () => {
  const res = await client.createValueLoad({
    account_id,
    amount: -100  // This MUST fail
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
  expect(res.status()).toBeLessThan(500);
});

// Scenario 4: If unload/withdrawal is supported
test('withdraw results in potential negative balance', async () => {
  const bal = await getBalance(account); // assume 50.00
  const unload = await unloadFunds(account, 100); // withdraw more than balance
  
  // Expected: either
  // (a) 4xx rejection (insufficient funds), or
  // (b) 201 success, balance = -50.00
  
  if (unload.status() === 201) {
    const newBal = await getBalance(account);
    expect(newBal).toBe('-50.00');
    
    // Can we still load to negative account?
    const reload = await load(account, 100);
    expect(reload.status()).toBe(201);
    expect(await getBalance(account)).toBe('50.00');
  } else {
    expect([400, 402, 409]).toContain(unload.status());
  }
});

// Scenario 5: Suspended account behavior with negative balance
test('load to suspended account with negative balance', async () => {
  await loadFunds(account, 100);
  await withdrawFunds(account, 150); // balance = -50
  await suspendAccount(account);
  
  const load = await client.createValueLoad({ account_id, amount: 100 });
  // Expected: either (a) 4xx (can't load to suspended), or (b) 201 (load still applied)
  
  if (load.status() === 201) {
    const bal = await getBalance(account);
    expect(bal).toBe('50.00'); // -50 + 100
  }
});
```

---

## PAGINATION & LIST ENDPOINTS

### Test Cases (All List Endpoints)

```typescript
test('list with default params returns paginated data', async () => {
  const res = await client.listCardholders();
  expect(res.status()).toBe(200);
  const body = BerkeleyClient.unwrap(await res.json());
  expect(Array.isArray(body.data || body)).toBe(true);
});

test('[boundary] list with limit=0', async () => {
  const res = await client.listCardholders({ limit: 0 });
  // Expected: 400 (invalid), or 200 with empty data
  expect([200, 400]).toContain(res.status());
});

test('[boundary] list with limit=-1', async () => {
  const res = await client.listCardholders({ limit: -1 });
  expect([200, 400]).toContain(res.status());
});

test('[boundary] list with offset > total', async () => {
  const res = await client.listCardholders({ offset: 999999 });
  expect(res.status()).toBe(200);
  const body = BerkeleyClient.unwrap(await res.json());
  expect((body.data || body).length).toBe(0); // empty, not error
});

test('[boundary] list with limit=1, offset=0,1,2,...', async () => {
  // Iterate through all pages one-by-one
  for (let offset = 0; offset < 10; offset++) {
    const res = await client.listCardholders({ limit: 1, offset });
    expect(res.status()).toBe(200);
    const body = BerkeleyClient.unwrap(await res.json());
    // Verify each page has ≤1 item, no duplicates
  }
});
```

---

## CONCURRENCY & RACE CONDITION TESTS

### Implementation Approach
These tests require parallel Playwright fixtures or extended load tests.

```typescript
test('[concurrent] simultaneous status changes on same account', async ({ client }) => {
  const [r1, r2] = await Promise.all([
    client.modifyAccountStatus(accountId, 'suspend'),
    client.modifyAccountStatus(accountId, 'suspend')
  ]);
  
  expect([200, 201, 400].includes(r1.status())).toBe(true);
  expect([200, 201, 400].includes(r2.status())).toBe(true);
  
  // Verify account is suspended exactly once
  const final = await client.getAccount(accountId);
  const status = (await final.json()).status_code;
  expect(status).toBe('suspended');
});

test('[concurrent] 10 simultaneous loads to same account', async ({ client }) => {
  const startBal = await getBalance(accountId);
  const loadAmt = 10;
  const count = 10;
  
  const results = await Promise.all(
    Array(count).fill(null).map(() =>
      client.createValueLoad({ account_id: accountId, amount: loadAmt })
    )
  );
  
  expect(results.every(r => [200, 201].includes(r.status()))).toBe(true);
  expect(await getBalance(accountId)).toBe(startBal + (loadAmt * count));
});
```

---

## RECOMMENDED IMPLEMENTATION PRIORITY

### Phase 1: Quick Wins (1 week)
- [ ] Boundary value matrix for Value Loads (amount, account_id, idempotency_key)
- [ ] Boundary value matrix for Cardholders (email, phone, postal_code, country, state)
- [ ] Negative balance scenario tests (critical for banking)
- [ ] Multi-load conservation tests
- [ ] Pagination edge cases (limit=0, offset > total)

### Phase 2: Business Logic (1-2 weeks)
- [ ] Processor reference consistency tests
- [ ] Cardholder ↔ Account linking verification
- [ ] Status transition matrix
- [ ] Address update cooldown detection
- [ ] Program isolation test

### Phase 3: Type & Precision (1 week)
- [ ] Balance field type validation (decimal strings, precision)
- [ ] ID type consistency (numeric, non-zero, positive)
- [ ] Timestamp format validation (ISO 8601)
- [ ] Enum value validation (status_code, load_type)

### Phase 4: Concurrency & Robustness (2 weeks, may require design)
- [ ] Concurrent load tests
- [ ] Race condition on status changes
- [ ] Historical data queries (if supported)
- [ ] Error recovery scenarios

---

## TEST SUITE RECOMMENDATION

### Playwright (Stateful Flows)
**Best for:**
- Money conservation (requires state: create → load → verify)
- Processor reference consistency (state chaining)
- Multi-load conservation
- Concurrent operations (parallel fixtures)
- Cardholder ↔ Account linking

**Add:**
- Boundary value parametrization (helpers to reduce code duplication)
- Type coercion tests
- Business logic invariants

### Newman (Request/Response Contracts)
**Best for:**
- Boundary value matrix (100 variants of cardholders create)
- Negative test cases (10x rejection paths)
- Status code assertions
- Response schema validation (JSON Schema in Postman)
- Parameter combination testing

**Add:**
- Pre/post scripts for decimal precision validation
- Folder structure: `/Positive`, `/Boundary`, `/Negative` for clarity
- Data file iteration (Postman collection runner)

---

## API DOCUMENTATION FINDINGS

### What the Docs Specify ✅

**List Cardholders:**
- Pagination: limit (string), offset (string)
- Filter: external_tag
- Returns: count, limit, offset, data array
- Fields returned: id, created_at, external_tag, primary_processor_reference, username (nullable), company_id, parent_cardholder_id

**Get Account Details:**
- Path param: id (string)
- Query param: include_value_loads (boolean, optional)
- Status codes: active, not_active, suspended, expired, canceled, lost, stolen, shipping, delinquent, shipped
- **CRITICAL:** Lost and stolen are terminal states (can't change)
- Returns: id, program_id, cardholder_id, processor_reference, status_code, balance, cards, bank_details, start_date, end_date, authorizations, transactions, created_at, updated_at

**List Value Loads:**
- Pagination: limit (string), offset (string)
- Filters: program_id, external_tag
- load_type enum: "load" or "unload" (confirms unload/withdrawal exists!)
- Returns: count, limit, offset, data array
- Fields: id, account_id, program_id, cardholder_id, external_tag, amount, load_type, message, processor_reference (UUID)

**Get Program:**
- Path param: id (string)
- Returns: id, name, program_type, status, currency, master_funding_account_number, created_at, updated_at

### Critical Gaps in Documentation ❌

1. **No Error Codes Documented**
   - What 4xx codes returned for invalid input?
   - Are specific codes used (400 vs 422 vs 409)?
   - What about 5xx scenarios?

2. **No Field Constraints**
   - Email: max length? Format validation?
   - Name fields: max length? Alphanumeric only?
   - Phone: format? Optional or required?
   - Address: format? Optional or required?
   - Postal code: format per country? Required?
   - Country/State: ISO codes? Required?

3. **No Numeric Constraints**
   - Amount: min? max? Decimal precision?
   - ID fields: numeric ranges?

4. **Negative Balance Behavior Undocumented**
   - Can account.balance go negative? (critical!)
   - What triggers negative balance?
   - Operations blocked on negative?

5. **Idempotency Undocumented**
   - Is idempotency_key supported on any endpoint?
   - Cardholder create: unique per email + program?
   - Retention period?

6. **Status Transitions Undocumented**
   - Which transitions allowed? (active → suspended → active?)
   - Terminal states: only "lost" and "stolen"?
   - Others: suspend ⇄ unsuspend? Can we transition to/from shipping?

7. **Cardholder Update Undocumented**
   - Which fields immutable?
   - Address cooldown duration?
   - Partial updates allowed?

8. **Pagination Edge Cases**
   - Default limit?
   - Max limit?
   - Behavior: limit=0? offset > total?

9. **Concurrency Guarantees Missing**
   - Are balance updates atomic?
   - Can concurrent loads race?
   - Are status changes serialized?

10. **Create Endpoints Not in Extracted Docs**
    - Create Cardholder specification
    - Create Value Load specification
    - Modify Account Status specification
    - These need to be reviewed separately

### Recommendations Based on Docs

**Confirmed Test Cases:**

1. **Value Load Type Enum:**
   ```
   ✓ load_type must be "load" or "unload"
   ✓ Test: create value load, verify load_type in response
   ✓ Test: [negative] load_type: "reload" → 4xx
   ```

2. **Account Status Terminal States:**
   ```
   ✓ lost and stolen are TERMINAL (can't change)
   ✓ Test: set status to "lost" → verify can't change
   ✓ Test: attempt "unsuspend" on "lost" → expect 4xx
   ```

3. **Pagination Filtering:**
   ```
   ✓ List Cardholders: filter by external_tag
   ✓ List Value Loads: filter by program_id, external_tag
   ✓ Test: list with filters returns only matching records
   ```

4. **Processor Reference:**
   ```
   ✓ Value Load response includes processor_reference (UUID format)
   ✓ Test: processor_reference format is valid UUID
   ```

### Next Steps: Deferred Questions for Berkeley

You should ask Berkeley for clarification on these gaps:

1. **Error Codes:** What specific HTTP status codes and error objects for validation failures?
2. **Field Constraints:** For all string/numeric fields, provide min/max, required/optional
3. **Negative Balances:** Can they occur? When? Which operations blocked?
4. **Idempotency:** Which endpoints support idempotency_key? Retention period?
5. **Status Transitions:** Full transition matrix and rules
6. **Cardholder Updates:** Which fields are mutable? Address cooldown?
7. **Pagination:** Default/max limits? Edge case behavior?
8. **Concurrency:** Atomicity guarantees? Race condition safeguards?
9. **Create Endpoints:** Full specs for Create Cardholder, Create Value Load, Modify Account Status
10. **Unload Feature:** When is "unload" available? Restrictions?

---

## NEXT STEPS

1. **Review** this matrix against the official API docs
2. **Confirm** boundary values, constraints, and business logic
3. **Prioritize** phases based on release timeline
4. **Assign** test authorship (Playwright vs. Newman)
5. **Implement** Phase 1 (quick wins) first, gather results
6. **Iterate** based on gaps discovered in Phase 1

