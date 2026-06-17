# Questions for Berkeley — API Specification Clarifications
## To Close Gaps in Test Coverage

**Date:** 2026-06-17  
**Context:** Building comprehensive black-box test suite; API docs lack specific constraints and error handling

---

## SECTION 1: CRITICAL FINANCIAL BEHAVIOR

### 1.1 Negative Balances
**Impact:** HIGH — Direct financial correctness  
**Current:** Undocumented

**Questions:**
1. Can an account balance go negative?
   - If yes: Under what conditions (unload, withdrawal, refund)?
   - If yes: Is there a limit? (e.g., can't go below -$100?)
   - If no: What error code when attempting operation that would go negative?

2. If negative balances are possible:
   - Can we load funds TO a negative-balance account? (e.g., -$50 + load $100 = $50?)
   - Can we query balance of a negative-balance account?
   - Can we perform status changes on negative-balance accounts?

3. What is the relationship between "balance" and "available_balance" in the response?
   - Can one be positive and the other negative?
   - Is one settled and one pending?

4. Does "settled_balance" ever go negative?

---

### 1.2 Unload/Withdrawal Feature
**Impact:** HIGH — Affects money conservation logic  
**Current:** Documented in API (load_type: "unload"), but no spec for creation endpoint

**Questions:**
1. Is there a separate endpoint for unload, or do we pass amount: -100 to POST /value_loads/load?

2. Unload restrictions:
   - Can unload amount exceed available balance? (What happens?)
   - Can unload to suspended account?
   - Can unload to lost/stolen account?

3. Unload idempotency:
   - Is unload request idempotent? (Does idempotency_key work?)
   - What if replay unload request with same key?

4. Unload completeness:
   - Can I unload $0.01? $1.00?
   - Min/max unload amounts?

---

### 1.3 Decimal Precision & Rounding
**Impact:** HIGH — $0.01 matters in banking  
**Current:** Undocumented

**Questions:**
1. Balance always 2 decimals (cents)?
   - Can balance be 123.4? Or always 123.40?
   - Will we ever see 123.456 (extra precision)?

2. Amount field precision:
   - Can we load $0.01? $0.001? $0.0001?
   - What's the minimum load amount?
   - If we POST amount: 100.123 (3 decimals), what happens? (Reject, truncate, round?)

3. Multi-load rounding:
   - If we load $1/3 + $1/3 + $1/3, does balance = $1.00 exactly? (Accounting best practice)
   - Or can we see $0.99 or $1.01 due to rounding artifacts?

4. Float precision:
   - If loads are stored/calculated with float math, do you round at the end?
   - Or do you use fixed-point decimal arithmetic?

---

## SECTION 2: CARDHOLDER CREATION & UPDATES

### 2.1 Email Field Constraints
**Impact:** MEDIUM — Input validation  
**Current:** Undocumented

**Questions:**
1. Email max length? (Assuming RFC 5322 = 254 chars, but confirm)

2. Email uniqueness:
   - Unique per program or globally?
   - Case-sensitive (user@Example.com vs user@example.com treated as same/different)?
   - Trimmed (user@example.com vs "user@example.com " treated as same)?

3. Email validation:
   - What format is accepted? (RFC 5322, simplified, other?)
   - Are special formats like "user+tag@example.com" allowed?
   - International domain names (user@münchen.de) allowed?

4. Duplicate email error:
   - If email already exists in program, what status code? (400, 409, 422?)
   - What error message?

---

### 2.2 Name Fields (first_name, last_name)
**Impact:** LOW — Input validation  
**Current:** Undocumented

**Questions:**
1. Max length?
   - Assuming 50 chars; confirm if different?

2. Allowed characters:
   - Alphanumeric + space only?
   - Or hyphens, apostrophes (Jean-Pierre, O'Connor)?
   - Accented characters (José)?
   - CJK characters (李)?
   - Emoji?

3. Name validation rules:
   - At least 2 chars?
   - Can't be just numbers?
   - Required fields (both first + last)?

---

### 2.3 Phone Field
**Impact:** LOW — Input validation  
**Current:** Undocumented

**Questions:**
1. Required or optional?

2. Format:
   - E.164 format (+1-555-0100)?
   - 10-digit only (US)?
   - International formats allowed?

3. Validation:
   - Min/max length?
   - Only digits + formatting chars?
   - Stored as-is or normalized?

4. Examples of valid/invalid:
   - "1231231234" → valid?
   - "+1-555-0100" → valid?
   - "ext. 123" → valid?
   - "1-555-0100 x123" → valid?

---

### 2.4 Address Fields (address1, address2, city, postal_code)
**Impact:** MEDIUM — Geo-specific validation  
**Current:** Partially documented (postal_code format varies by country)

**Questions:**
1. Required or optional?
   - Are all address fields required for cardholder creation?
   - Can they be empty strings?

2. Max lengths?
   - address1: 100 chars? 255?
   - address2: 50 chars? 100?
   - city: 50 chars? 100?
   - postal_code: varies by country, what are limits?

3. Postal code validation per country:
   - US: Only 5-digit (12345) or 9-digit (12345-6789)?
   - Canada: A1A 1A1 format only, or A1A1A1 (no space) also accepted?
   - Others: Any format allowed?

4. Validation examples:
   - city: "New York" (space) → valid?
   - postal_code: "84121 " (trailing space) → trimmed or rejected?
   - postal_code: "" (empty, if optional) → valid?

---

### 2.5 Country & State Fields
**Impact:** MEDIUM — Enum validation  
**Current:** Documented as ISO numeric (e.g., "840" = US), ISO alpha-2 for state

**Questions:**
1. Country field:
   - Only accept ISO 3166-1 numeric (3-digit)?
   - Or also ISO 3166-1 alpha-2 (2-letter: "US", "CA")?
   - Or ISO 3166-1 alpha-3 (3-letter: "USA", "CAN")?

2. State field for non-US/CA:
   - Required only for US + Canada?
   - Other countries: what format?
   - Can be empty for non-US/CA?

3. Validation examples:
   - country: "840" → valid (US)
   - country: "124" → valid (Canada)
   - country: "999" → invalid, error code?
   - country: "US" → accepted or reject (require numeric)?
   - state: "UT" (uppercase, US) → valid?
   - state: "ut" (lowercase) → normalized to "UT" or rejected?
   - state: "Utah" (full name) → rejected?
   - state: "ZZ" (invalid code) → error code?

---

### 2.6 Date of Birth Field
**Impact:** LOW — Optional field  
**Current:** Undocumented

**Questions:**
1. Format:
   - Only "MM-DD-YYYY"? 
   - Or ISO 8601 (YYYY-MM-DD) also accepted?
   - Or Unix timestamp?

2. Age validation:
   - Must be 18+ (adult)?
   - Or any age allowed?
   - If 18+ required, what error code if minor? (400, 422?)

3. Examples:
   - "01-01-1980" → valid?
   - "1980-01-01" → valid or rejected?
   - "13-01-1980" (invalid month) → 400?
   - "01-01-2010" (minor, if 18+ required) → 422?

---

### 2.7 Cardholder Update Behavior
**Impact:** MEDIUM — Update semantics  
**Current:** Undocumented

**Questions:**
1. Which fields are immutable? (Can't change after creation)
   - Email? (Usually yes in systems)
   - Phone?
   - Date of birth?
   - Country?

2. Which fields have cooldown? (Can change, but not frequently)
   - Address fields have cooldown (mentioned in existing code)
   - Cooldown duration? (24h? 30d?)
   - Error code on cooldown violation? (429, 409?)

3. Partial updates:
   - Can we POST only { first_name: "Jane" } and keep everything else?
   - Or must we provide all fields again?

4. Required vs optional in updates:
   - Do update payloads have same requirements as create?
   - Or are all fields optional in updates?

---

### 2.8 External Tag (Cardholder)
**Impact:** LOW — Optional tag  
**Current:** Undocumented

**Questions:**
1. Uniqueness:
   - Unique per program?
   - Duplicate allowed?
   - Duplicate rejected or silently accepted?

2. Constraints:
   - Max length?
   - Allowed characters?

3. Purpose:
   - Is it searchable via LIST endpoint? (Yes, docs say so)

---

### 2.9 Load Amount (Initial Load on Create)
**Impact:** MEDIUM — Money in system  
**Current:** Undocumented

**Questions:**
1. When providing load_amount on cardholder create:
   - Is it applied immediately?
   - Does it count toward account balance immediately?
   - If load fails, does cardholder creation still succeed?

2. Constraints:
   - Min/max amount?
   - Decimal precision? (see Section 1.3)

3. Response:
   - Does response include value_load_result with status?
   - What codes: "success", "pending", "failed"?

---

## SECTION 3: ACCOUNT & STATUS OPERATIONS

### 3.1 Status Transition Rules
**Impact:** MEDIUM — State management  
**Current:** Partially documented (lost + stolen = terminal)

**Questions:**
1. Valid transitions:
   - active → suspend → active? (reversible?)
   - active → unsuspend? (already active, error?)
   - suspended → suspended? (idempotent or error?)
   - active → lost? (then what?)
   - Any other transitions (expire, cancel, delinquent)?

2. Terminal states:
   - Docs say lost + stolen are terminal
   - Any other terminal states? (expired? canceled?)

3. Error codes:
   - If invalid transition, what status? (400, 409, 422?)
   - What error message?

4. Last four digits:
   - Why required for modify status? (To validate card?)
   - What if account has no cards?
   - What if multiple cards?

---

### 3.2 Card Array Structure
**Impact:** LOW — Response schema  
**Current:** Undocumented

**Questions:**
1. Cards array:
   - Always present in GET /accounts/{id}?
   - Can it be empty (new account)?
   - Can it have multiple cards?

2. Card object fields:
   - What fields are in card object? (Only last_four_digits?)
   - Is there a "primary" flag?
   - Is first card always primary?

3. Physical vs virtual:
   - Is this stored in account.cards or separate?
   - Can same account have both physical + virtual?

---

### 3.3 Account Suspension Behavior
**Impact:** MEDIUM — Access control  
**Current:** Undocumented

**Questions:**
1. If account suspended:
   - Can we load funds? (Yes, no, or depends on config?)
   - Can we query balance? (Yes)
   - Can we get transactions? (Yes, no?)
   - Can cardholder use card to spend? (Probably no, but confirm)

2. If account suspended, then unsuspended:
   - All balance/transaction history preserved?
   - Any state changes?

---

## SECTION 4: PAGINATION & FILTERING

### 4.1 List Endpoints Pagination
**Impact:** LOW — API usability  
**Current:** Partially documented (limit, offset params)

**Questions:**
1. Default values:
   - If no limit specified, what's the default? (10, 50, 100?)
   - If no offset specified, default to 0?

2. Limits:
   - Max limit allowed? (100, 1000?)
   - What if limit > max? (Capped or error?)

3. Edge cases:
   - limit=0: Error 400 or empty data 200?
   - limit=-1: Error or handled as 0?
   - offset > total: Error or empty 200?
   - offset=-1: Error or handled as 0?

4. Ordering:
   - Are results ordered by ID? (Ascending, descending?)
   - Or by created_at? (Newest first, oldest first?)
   - Consistent across pagination?

---

### 4.2 List Cardholders — External Tag Filter
**Impact:** LOW — Filtering  
**Current:** Documented, behavior unclear

**Questions:**
1. If external_tag is provided as filter:
   - Exact match or substring?
   - Case-sensitive?

2. Combine filters:
   - Can we filter by external_tag AND pagination?
   - Multiple external_tags (OR logic)?

---

### 4.3 List Value Loads — program_id + external_tag Filters
**Impact:** LOW — Filtering  
**Current:** Documented, behavior unclear

**Questions:**
1. Filter behavior:
   - Exact match or substring for external_tag?
   - Case-sensitive?
   - Multiple filters combined (AND) or separate (OR)?

2. Pagination + filter:
   - When limit=50 + filter, does count = total in program or total matching filter?
   - Example: Program has 1000 loads, filter returns 10, next offset=50: does it wrap or underflow?

---

## SECTION 5: IDEMPOTENCY & CONCURRENCY

### 5.1 Idempotency Key Support
**Impact:** HIGH — Retry safety  
**Current:** Used in tests but not documented in API specs

**Questions:**
1. Which endpoints support idempotency_key?
   - Create Cardholder? (Hints: your code doesn't retry it, but uniqueness via email/program)
   - Create Value Load? (Yes, evidenced in tests)
   - Others?

2. If idempotency_key not provided:
   - Is idempotency automatic? (Based on params?)
   - Or each call treated as new?

3. Key retention:
   - How long is key valid? (24h? 30d? Forever?)
   - Can we replay key after 30 days?

4. Key format:
   - Any constraints? (Max length? Alphanumeric?)
   - Must be UUID or can be any string?

5. Duplicate key behavior:
   - If replay with exact same params: return 200/same result?
   - If replay with different amount: error 409? Or ignore and process?

---

### 5.2 Concurrent Operations
**Impact:** MEDIUM — Race conditions  
**Current:** Undocumented

**Questions:**
1. Concurrent loads to same account:
   - Are balances updated atomically?
   - Can two concurrent $50 loads both succeed and balance = +$100? (Should yes)
   - Can they race and only $50 count? (Should no)

2. Concurrent status changes:
   - If we suspend + unsuspend simultaneously, what's final state?
   - Are transitions atomic?

3. Load + status change race:
   - If we load while account is being suspended, does load apply?
   - Or is load rejected mid-operation?

---

## SECTION 6: ERROR HANDLING & RESPONSES

### 6.1 Error Response Format
**Impact:** MEDIUM — Test assertions  
**Current:** Undocumented

**Questions:**
1. Error response structure:
   - Is error in root `{ error: {...} }` or nested `{ data: { error: {...} } }`?
   - What fields in error object? (code? message? details?)
   - Example 400 response for invalid email?

2. HTTP status codes:
   - 400 vs 422 vs 409? (When to use which?)
   - 401 vs 403? (Unauthorized vs forbidden?)
   - Are 5xx errors ever expected?

3. Error codes:
   - Do you use standard codes (INVALID_EMAIL, DUPLICATE_ACCOUNT)?
   - Or generic (VALIDATION_ERROR)?
   - Documented anywhere?

---

### 6.2 Success Response Wrapping
**Impact:** LOW — Response parsing  
**Current:** Partially handled (data envelope optional)

**Questions:**
1. GET endpoints:
   - Single resource: always wrapped in `{ data: {...} }` or direct?
   - List endpoints: always `{ data: [...], count, limit, offset }` format?
   - Consistency across all endpoints?

2. POST endpoints:
   - Always wrapped in `{ data: {...} }`?
   - Always status 201? Or sometimes 200?

3. Empty responses:
   - DELETE (if supported): return 204 or 200 with empty body?

---

## SECTION 7: AUTHENTICATION & AUTHORIZATION

### 7.1 Bearer Token Scope
**Impact:** MEDIUM — Security  
**Current:** Tested (invalid token → 401/403), details undocumented

**Questions:**
1. API key scope:
   - Tied to single program or multiple programs?
   - Can API key see other programs? (Should no)
   - Behavior if key is revoked?

2. Authorization examples:
   - Can I create cardholder for program_id=999 if not my program? (Should 403)
   - Can I query another program's value loads? (Should no)
   - Can I query another program's accounts? (Should no)

3. Rate limiting:
   - Is rate limiting per API key or per IP?
   - Limits per endpoint? (Different limits for list vs create?)
   - Burst allowance?

---

## SECTION 8: PROCESSOR INTEGRATION

### 8.1 Processor Reference & Fields
**Impact:** MEDIUM — Integration point  
**Current:** Partially documented (UUID format for value loads)

**Questions:**
1. Cardholder create response:
   - primary_processor_reference: always present?
   - Format: always UUID or sometimes different?
   - Used to resolve account later?

2. Account lookup:
   - Can we always resolve account by processor_reference?
   - Is reference stable (never changes)?
   - Can two accounts have same reference? (Should no)

3. Value load processor_reference:
   - When does it get assigned? (Immediately on 201?)
   - Can it be used to query load later? (Already a unique ID field)

4. Processor communication:
   - If processor is down, does account creation fail? (Probably yes)
   - Can we create account if processor unreachable? (Probably no)
   - Error code when processor unavailable?

---

## SECTION 9: TIMESTAMP & AUDIT FIELDS

### 9.1 Timestamp Fields
**Impact:** LOW — Observability  
**Current:** Partially documented (created_at, updated_at)

**Questions:**
1. Format:
   - Always ISO 8601? (YYYY-MM-DDTHH:mm:ssZ?)
   - Always UTC?
   - Millisecond precision? (...ss.SSSZ or just ...ssZ?)

2. Monotonicity:
   - Are created_at timestamps unique? (Two cardholders can't have same created_at?)
   - Or can there be duplicates?

3. Updated_at:
   - For immutable resources (loads), does updated_at ever change?
   - Or is it same as created_at?

4. Examples:
   - "2026-06-17T14:30:45Z" → valid format?
   - "2026-06-17T14:30:45.123Z" → valid?
   - "2026-06-17T14:30:45+00:00" → accepted (with +00:00 offset)?

---

## SECTION 10: FEATURE FLAGS & CONFIG

### 10.1 Program Configuration
**Impact:** MEDIUM — Feature gating  
**Current:** Undocumented

**Questions:**
1. Which features are program-configurable?
   - Unload enabled/disabled?
   - Physical cards? (Shipping, PIN retrieval)
   - Status transitions? (Can we suspend if not allowed?)
   - Address update cooldown duration?

2. How to check if feature enabled?
   - Is it in program metadata?
   - Or only discovered by trying operation?

3. Conditional operations:
   - If feature disabled, error 400 or 403?
   - What message in error?

---

## SUMMARY: PRIORITY ORDER

**Tier 1 (Before writing many tests):**
- 1.1 Negative balances
- 1.2 Unload/withdrawal
- 1.3 Decimal precision

**Tier 2 (Before boundary tests):**
- 2.1 Email constraints
- 2.4 Address constraints
- 3.1 Status transitions

**Tier 3 (Nice to know, can infer):**
- 2.3 Phone format
- 4.1 Pagination edge cases
- 6.1 Error response format

---

## Next Steps

1. **Send this doc to Berkeley**
2. **Schedule call to discuss** (especially Tier 1)
3. **Update your test matrix** based on responses
4. **Start with Tier 1 tests** while awaiting answers for Tier 2+

