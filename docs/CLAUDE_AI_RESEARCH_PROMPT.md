# Berkeley Payments Card Issuing API — Engineering Clarifications Needed
## Research & Analysis Request for claude.ai

---

## PROJECT CONTEXT

**What we're doing:** Black-box API testing for Berkeley Payments Card Issuing API (staging-only).  
**Current status:** Tier 1 (boundary values) complete with 37 passing tests. Ready to plan Tier 2-3.  
**Challenge:** 4 critical engineering questions block our test planning.

---

## THE 4 BLOCKING QUESTIONS

### **CRITICAL 🚨 — Issue #17: Negative Balance Policy**

**What we know:**
- OpenAPI spec is silent on negative balance handling
- Banking systems typically have strict rules about this
- Our Tier 2 test plan depends heavily on this answer

**What we need to know:**
1. **Can account balances go negative?** (Yes/No/Only under certain conditions)
2. **If yes, under what conditions?** (Only via unload? Only if explicitly enabled? Always?)
3. **What operations are blocked when balance is negative?**
   - Can you load funds to a negative-balance account?
   - Can you make purchases/withdrawals?
   - Can you transfer funds?
4. **Is there a minimum floor?** (e.g., can't go below -$100?)
5. **How are negative balances displayed?** (As "-$50.00" or special status?)

**Why this matters:**
- Tier 2 test: "Negative Balance Scenarios" (15+ test cases) depends entirely on this
- Need to know if unload can create negative balance
- Need to know if negative balance prevents subsequent operations
- Critical for money conservation testing

**Related findings from Tier 1:**
- Unload endpoint exists and can reduce balance
- No explicit error when unload amount exceeds balance (in testing so far)

---

### **HIGH 🔴 — Issue #15: Idempotency Key Semantics & Retention**

**What we know:**
- OpenAPI spec mentions `idempotency_key` for load/unload
- Purpose: "Unique key to prevent duplicate processing on retry"
- Strongly recommended but not required

**What we need to know:**
1. **Which endpoints support idempotency_key?**
   - createValueLoad (load)?
   - createValueUnload (unload)?
   - createCardholder (with initial load)?
   - All three? Others?

2. **How long is an idempotency key valid?**
   - 24 hours? 30 days? Indefinite?
   - Does it expire after the transaction settles?

3. **What happens if you replay with same key but different amount?**
   - Is it rejected (conflict)?
   - Is it accepted as duplicate (returns original result)?
   - Is it accepted as new operation?

4. **How is the key matched?**
   - Exact string match only?
   - Case-sensitive?
   - Requires same account_id + key, or just key?

5. **What's the error response for duplicate/conflict?**
   - HTTP 409 Conflict?
   - HTTP 422 Unprocessable?
   - Custom error code?

**Why this matters:**
- Tier 2 test: "Multi-Load Money Conservation" needs idempotency guarantees
- Tier 2 tests: Need to verify retry safety
- Need to know if we can test "load A, then replay with same key, should get same result"

**Related findings from Tier 1:**
- Tests assume idempotency works but haven't verified semantics
- Tier 1 test checks that replaying with same key doesn't double-charge (passes)

---

### **MEDIUM 🟡 — Issue #16: Status Transition Rules & Terminal States**

**What we know:**
- OpenAPI documents action keywords (suspend, unsuspend, mark_card_lost, mark_card_stolen, etc.)
- Terminal states: `lost` and `stolen` cannot change
- Other transitions documented but enforcement unclear

**What we need to know:**
1. **Complete state transition matrix:**
   - From `active`, what states can we transition to? (Only suspend? Or others?)
   - From `suspended`, what states? (Back to active only? Or mark_lost/stolen too?)
   - From `not_active`, can we transition anywhere?
   - From `shipping`, what's the next valid state?

2. **Terminal state behavior (lost/stolen):**
   - Once marked lost/stolen, is card fully unusable or can we get balance?
   - Can we still view transactions on lost/stolen cards?
   - Can we do anything besides querying account details?

3. **Error codes for invalid transitions:**
   - What error when trying to unsuspend a non-suspended card?
   - What error when trying to transition from lost state?
   - HTTP 400 (bad request) or 422 (business rule)?

4. **Cardholder vs. Card status:**
   - Does changing account status affect all cards on that cardholder?
   - Or does each card have independent status?

**Why this matters:**
- Tier 2 test: "Status Transition Testing" needs to know valid/invalid paths
- Affects concurrent operations testing (if multiple status changes race)
- Affects error handling testing

**Related findings from Tier 1:**
- Suspend/unsuspend actions work but depend on card state
- No error when state transition invalid (may be lenient staging behavior)

---

### **MEDIUM 🟡 — Issue #14: Required Fields & Constraints**

**What we know:**
- OpenAPI spec updated with conservative "required field policy"
- Field constraints documented but not all enforced

**What we need to know:**
1. **Phone field requirements (regional):**
   - Is phone truly required for Canadian programs? (Spec says yes, but need confirmation)
   - Is phone truly optional for US programs?
   - Are there digit limits enforced? (Spec says Canada max 16, US max 10)

2. **Date format consistency:**
   - Create cardholder: dd-MM-yyyy works ✓
   - Update cardholder: YYYY-MM-DD is documented but rejects in testing 🐛
   - **Is this a spec bug or API bug?**
   - What's the correct format for update?

3. **Field length enforcement:**
   - Spec says first_name maxLength 50, but API accepts 51+ in testing
   - Is this intentional lenient parsing?
   - Should we truncate in our tests or expect rejection?

4. **Min/max amount values:**
   - Spec is silent on amount constraints
   - Tier 1 testing shows: accepts 1 unit (penny), 0, and 99,999,999
   - Are there actual limits? (e.g., max per cardholder? Per day?)

5. **External tag uniqueness:**
   - Spec now correctly marks as optional
   - But are duplicate external_tags allowed?
   - Tier 1 testing: Yes, duplicates allowed (both loads created)
   - Is this intended?

**Why this matters:**
- Validation strategy for Tier 2 tests depends on this
- Field length lenience affects type coercion testing
- Amount limits affect load/unload boundary testing

**Related findings from Tier 1:**
- Date format mismatch found (spec inconsistency)
- Field lengths not enforced (API lenient)
- Type coercion accepted (strings → integers for amounts)
- external_tag optional and allows duplicates ✓

---

## TIER 2-3 TEST PLANS (BLOCKED BY ABOVE)

### **Tier 2 — Advanced Coverage (3 tests, 2 blocked)**

| Test | Dependencies | Status |
|------|--------------|--------|
| Negative Balance Scenarios | Issue #17 | 🚨 BLOCKED |
| Multi-Load Money Conservation | Issue #15 | 🔴 BLOCKED |
| Format Validation (email, phone, postal codes) | None | ✅ READY |

### **Tier 3 — Robustness (2 tests)**

| Test | Dependencies | Status |
|------|--------------|--------|
| Concurrent Operations & Race Conditions | Issue #16 (state transitions) | 🟡 Partial (can start, refine later) |
| Error Code & Response Format Validation | None | ✅ READY |

---

## FINDINGS THAT NEED CLARIFICATION

### **🐛 Date Format Mismatch (Issue #8)**
```
Create cardholder: accepts dd-MM-yyyy ✓
Update cardholder: spec says YYYY-MM-DD but rejects it in testing ❌
Question: Which is correct? Is spec wrong or API has a bug?
```

### **📝 API More Lenient Than Spec (Issue #9)**
```
Field lengths: API accepts fields over maxLength limits
Type coercion: API accepts string amounts, coerces to integers
Question: Is lenient parsing intentional or should be stricter?
```

### **❓ Phone Validation Constraints (Issue #10)**
```
Spec says: Canadian required + max 16 digits, US optional + max 10 digits
Testing: Constraints not strictly validated
Question: Are these constraints actually enforced or is validation lenient?
```

---

## ASSUMPTIONS WE'VE MADE (NEED VALIDATION)

1. **Negative balances are possible** (used in Tier 2 planning)
2. **Idempotency prevents double-charging** (tested in Tier 1, but semantics unclear)
3. **Terminal states (lost/stolen) cannot change** (per spec, untested)
4. **Field length limits are soft, not hard** (observed behavior, not intentional?)
5. **external_tag has no uniqueness constraint** (observed in Tier 1 testing)
6. **Type coercion for amounts is intentional** (lenient parsing observed)

---

## WHAT WE'RE ASKING FOR

**For each of the 4 questions above:**
1. Direct answer to each sub-question
2. Any gotchas or edge cases we should test
3. Error codes/responses for invalid operations
4. Links to internal docs if available
5. Confirmation of our Tier 1 findings (date format mismatch, lenient validation, etc.)

**Bonus:**
- Any upcoming API changes we should know about?
- Are there undocumented features we should test?
- Known issues on staging we should account for?

---

## HOW THIS HELPS US

Once we have answers, we can:
1. **Finalize Tier 2 test plan** (5-7 days of implementation)
2. **Write 40-50 additional tests** covering advanced scenarios
3. **Identify gaps in OpenAPI spec** and provide feedback
4. **Create production-ready test suite** for the entire Card Issuing API

---

## FILES REFERENCED

- **OpenAPI Spec:** `docs/berkeley-card-issuing-openapi.yaml`
- **Tier 1 Test Results:** `docs/TIER1_FINDINGS_SUMMARY.md`
- **Test Files:** `tests/cardholders/`, `tests/value-loads/`, `tests/accounts/`
- **GitHub Issues:** https://github.com/parvezi4/berkeley-tests/issues (Issues #8-17)

---

## CONTACT

**Repository:** https://github.com/parvezi4/berkeley-tests  
**Branch:** `feat/tier1-boundary-value-tests`  
**Test Suite:** 63 tests (37 Tier 1 + 26 smoke/core tests)  
**Status:** Ready for Tier 2-3 planning upon clarifications

