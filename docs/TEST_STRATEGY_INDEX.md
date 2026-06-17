# Test Coverage Analysis — Complete Index
## Berkeley Payments Card Issuing API

**Project:** Berkeley-tests  
**Date:** 2026-06-17  
**Status:** Analysis Complete — Ready for Discussion & Planning  
**Scope:** Black-box test coverage for staging environment

---

## 📋 DOCUMENT OVERVIEW

This analysis consists of **three documents** providing layered perspectives on test coverage gaps:

### 1. **TEST_COVERAGE_ANALYSIS.md** (Comprehensive Matrix)
The most detailed reference document.

**Contains:**
- Complete boundary value matrices for all 4 resource groups
- Field specifications with test cases
- Business logic test templates
- Negative balance handling (critical for banking)
- Concurrency & race condition tests
- Current coverage summary
- Deferred questions for Berkeley

**When to use:** 
- Planning new tests
- Reference for field constraints
- Checking all possible edge cases

---

### 2. **TEST_GAPS_AND_RECOMMENDATIONS.md** (Actionable Roadmap)
Prioritized test implementations with code examples.

**Contains:**
- Quick summary of gaps
- **4 Tiers of tests** (sorted by priority):
  - **Tier 1:** Banking-critical (negative balance, multi-load, terminal status)
  - **Tier 2:** High-value gaps (boundary values, pagination)
  - **Tier 3:** Nice-to-have (type validation, consistency)
  - **Tier 4:** Deferred (awaiting API clarification)
- Implementation roadmap (3-week schedule)
- Success criteria
- Testing strategy per suite (Playwright vs Newman)

**When to use:**
- Deciding what to implement first
- Getting code examples
- Planning sprints/timeline

---

### 3. **BERKELEY_API_CLARIFICATIONS.md** (Questions for Vendor)
Detailed questions to ask Berkeley to close spec gaps.

**Contains:**
- 10 sections of specific questions grouped by domain
- Priority ranking (Tier 1-3)
- Rationale for each question
- Examples of what we're testing for

**When to use:**
- Before implementing tests (ask Berkeley first)
- In vendor communication
- To document assumptions

---

## 🎯 EXECUTIVE SUMMARY

### Current Coverage: ~60% ✅
- Core CRUD operations
- Money conservation (single load)
- Idempotency (single replay)
- Auth isolation
- Basic negatives

### Missing Coverage: ~40% ❌
- Boundary value testing (string lengths, numeric ranges, formats)
- Type coercion (wrong types for fields)
- Negative balance scenarios (critical for banking)
- Multi-load conservation (verification only for singles)
- Pagination edge cases
- Terminal state enforcement (lost/stolen can't change)
- Concurrent operations
- Unload/withdrawal feature (API supports, tests don't)
- Filtering (program_id, external_tag)
- Error response validation

---

## 🚨 CRITICAL FINDINGS

### 1. **Negative Balance Testing Gap**
**Risk:** HIGH  
**Current:** No tests exist; API docs silent on behavior  
**Impact:** Can accounts go negative? Which operations blocked?

**Action:** Tier 1 — Implement tests, but ask Berkeley first:
- Can balance go negative?
- When can it occur (unload, refund)?
- Which operations blocked if negative?

---

### 2. **Unload/Withdrawal Feature**
**Risk:** MEDIUM  
**Current:** API supports load_type: "unload", but no tests  
**Impact:** Money conservation logic incomplete without testing unload

**Action:** Clarify endpoint with Berkeley, then test:
- POST /value_loads/load with amount: -100?
- Separate unload endpoint?
- Constraints on unload amounts?

---

### 3. **Decimal Precision Handling**
**Risk:** HIGH  
**Current:** Not validated; critical for banking  
**Impact:** $0.01 discrepancies in test assertions

**Action:** Tier 1 — Test and document:
- Min/max load amounts
- Decimal precision (cents only? Or smaller?)
- Rounding behavior (floating-point math artifacts)

---

### 4. **API Spec Gaps**
**Risk:** MEDIUM  
**Current:** Major constraints undocumented  
**Impact:** Test assertions may be wrong; edge cases unknown

**Action:** Ask Berkeley using BERKELEY_API_CLARIFICATIONS.md
**Priority:** Tier 1-2 questions before implementing tests

---

## 📊 TEST MATRIX SUMMARY

### By Resource Group (Priority Order)

#### Value Loads (Tier 1)
| Test | Status | Effort | Notes |
|------|--------|--------|-------|
| Money conservation (single) | ✅ Done | — | Already implemented |
| Money conservation (multi) | ❌ Missing | Low | Add immediately |
| Negative balance scenario | ❌ Missing | Medium | Blocked on clarification |
| Unload/withdrawal | ❌ Missing | Medium | Blocked on clarification |
| Amount boundary values | ❌ Missing | Low | 0.01, 0, -1, 999_999_999 |
| Idempotency retry | ✅ Done | — | Already implemented |
| Idempotency key collision | ⚠️ Partial | Low | Conflict handling untested |
| Pagination edge cases | ❌ Missing | Low | limit=0, offset > total |
| Filter by external_tag | ❌ Missing | Low | List endpoint filter |
| Filter by program_id | ❌ Missing | Low | List endpoint filter |
| Concurrent loads | ❌ Missing | Medium | Race condition check |

#### Accounts & Cards (Tier 2)
| Test | Status | Effort | Notes |
|------|--------|--------|-------|
| Get account by ID | ✅ Done | — | Basic test exists |
| Processor ref consistency | ❌ Missing | Low | Same ref = same account ID |
| Balance read | ✅ Done | — | Basic test exists |
| Balance format validation | ❌ Missing | Low | Decimal string, 2 decimals |
| Status transitions | ⚠️ Partial | Medium | Suspend/unsuspend only; others untested |
| Terminal status (lost) | ❌ Missing | Low | Can't change from lost/stolen |
| Terminal status (stolen) | ❌ Missing | Low | Can't change from lost/stolen |
| Suspended account loads | ❌ Missing | Medium | Can load? Balance updates? |
| Transaction list | ✅ Done | — | Basic test exists |
| Card array structure | ❌ Missing | Low | Format, primary card detection |

#### Cardholders (Tier 2-3)
| Test | Status | Effort | Notes |
|------|--------|--------|-------|
| Create (happy path) | ✅ Done | — | Already implemented |
| Email boundary values | ❌ Missing | Low | Length, format, duplicates |
| Phone boundary values | ❌ Missing | Low | Format, length |
| Postal code per country | ❌ Missing | Medium | US 5-digit, Canada A1A 1A1 |
| Country enum validation | ❌ Missing | Low | Valid codes: 840, 124, etc. |
| State enum validation | ❌ Missing | Low | Valid 2-letter codes |
| Get cardholder | ✅ Done | — | Basic test exists |
| Update (partial fields) | ✅ Done | — | Already implemented |
| Update (immutable fields) | ❌ Missing | Low | Email, DOB can't change? |
| Address cooldown | ❌ Missing | Medium | Duration? Enforcement? |
| List with pagination | ✅ Done | — | Basic test exists |
| List filter by external_tag | ❌ Missing | Low | Filter behavior |
| Duplicate email handling | ❌ Missing | Low | Error code when duplicate |
| Initial load amount | ⚠️ Partial | Low | Applied on create? Tested? |

#### Programs (Tier 3)
| Test | Status | Effort | Notes |
|------|--------|--------|-------|
| Get program | ✅ Done | — | Already implemented |
| Program isolation | ❌ Missing | Low | Can't access other program |
| Program balance consistency | ❌ Missing | Low | Balance = sum of accounts |
| Auth token scope | ⚠️ Partial | Low | Invalid token tested; scope untested |

---

## 🗂️ IMPLEMENTATION ROADMAP

### Week 1: Tier 1 (Banking Critical)
**Effort:** 5 days | **Tests:** 6-8 | **Blocker:** Clarify negative balance + unload behavior

```
Day 1-2: Negative balance handling tests
  - Can balance go negative?
  - Which operations blocked?
  - Money conservation with negative state
  
Day 3:   Multi-load money conservation
  - Sum of 5 loads = final balance increase
  - No gaps or duplicates
  
Day 4:   Terminal status enforcement
  - Set status to lost/stolen
  - Verify can't change
  - Error code on violation
  
Day 5:   Buffer + Refinement
```

**Dependencies:** Answers to TIER 1 questions from Berkeley

---

### Week 2: Tier 2 (High-Value Coverage)
**Effort:** 5 days | **Tests:** 15-20 | **Blocker:** Field constraint clarifications

```
Day 1-2: Boundary value tests (Newman collection)
  - Cardholders: email, phone, postal_code, country, state
  - Value Loads: amount, external_tag
  - 50+ test cases via Postman data files
  
Day 3:   Pagination edge cases (Playwright)
  - limit=0, limit=-1
  - offset > total
  - Consistent pagination order
  
Day 4:   Filter & consistency tests (Playwright)
  - List filtering (external_tag, program_id)
  - Processor reference consistency
  - Card array structure
  
Day 5:   Buffer + Refinement
```

**Dependencies:** Answers to TIER 2-3 questions from Berkeley

---

### Week 3: Tier 3 (Polish & Concurrency)
**Effort:** 5 days | **Tests:** 10-15

```
Day 1-2: Type & format validation (Playwright)
  - Balance decimal strings
  - ID numeric types
  - Timestamp ISO 8601
  - UUID processor_references
  
Day 3:   Update & immutability (Playwright)
  - Partial update field preservation
  - Immutable field detection
  - Address cooldown (if enforced)
  
Day 4:   Concurrent operations (Playwright)
  - 5 simultaneous loads
  - Race condition on status changes
  
Day 5:   Documentation + Integration
```

---

## 🎬 GETTING STARTED

### Step 1: Share with Berkeley (1-2 days)
Send **BERKELEY_API_CLARIFICATIONS.md** to Berkeley.  
Prioritize getting answers to **Tier 1 questions**.

### Step 2: Review Findings (1 day)
- Read **TEST_COVERAGE_ANALYSIS.md** for detailed matrix
- Read **TEST_GAPS_AND_RECOMMENDATIONS.md** for roadmap
- Align on Playwright vs Newman split

### Step 3: Plan Sprint 1 (1 day)
Pick **Tier 1 tests** from recommendations:
1. Multi-load conservation (doesn't depend on clarification)
2. Terminal status enforcement (doesn't depend on clarification)
3. Boundary values for amounts (once clarified)
4. Negative balance tests (once clarified)

### Step 4: Implement (Week 1-2)
Start with tests that don't depend on Berkeley clarification.  
Parallelize: Someone asks questions while someone codes Tier 1 independent tests.

### Step 5: Iterate (Week 2-3)
As Berkeley answers arrive, implement dependent tests.  
Add boundary values + error handling as needed.

---

## 🛠️ TESTING STRATEGY: PLAYWRIGHT vs NEWMAN

### Playwright (State-Dependent Logic)
**Use for:**
- ✅ Multi-load conservation (chained operations)
- ✅ Terminal status transitions (state-dependent)
- ✅ Negative balance scenarios (requires state setup)
- ✅ Concurrent operations (parallel fixtures)
- ✅ Consistency verification (multiple assertions across state)

**Improve:**
- Add parametrized boundary test helpers to reduce duplication
- Use TypeScript strictly to catch type mismatches early

**Examples to Add:**
```typescript
// Multi-load conservation
test('multiple loads sum to exact balance increase', async ({ client, seededAccount }) => {
  const loads = [100, 50.25, 33.33];
  // Apply all loads, verify sum
});

// Terminal status
test('lost status cannot be changed', async ({ client, seededAccount }) => {
  // Set to lost, try to change, verify still lost
});
```

---

### Newman/Postman (Request/Response Contracts)
**Use for:**
- ✅ Boundary value variation (100 email lengths)
- ✅ Pagination edge cases (limit=0, offset > total)
- ✅ Negative test matrix (10 ways to fail)
- ✅ Error response validation (4xx codes per scenario)
- ✅ Status code assertions (all paths)

**Improve:**
- Add Pre/Post scripts for precision validation
- Use collection runner with CSV data files
- Add folder structure: `/Positive`, `/Boundary`, `/Negative`

**Examples to Add:**
```json
{
  "folder": "Boundary Tests",
  "requests": [
    { "name": "amount=0.01", "body": { "amount": 0.01 } },
    { "name": "amount=0", "body": { "amount": 0 } },
    { "name": "amount=-1", "body": { "amount": -1 } },
    ...
  ]
}
```

---

## 📚 DOCUMENTATION FILES

All files are in `docs/` directory:

| File | Purpose | Read Time |
|------|---------|-----------|
| `TEST_COVERAGE_ANALYSIS.md` | Detailed boundary value + business logic matrix | 20-30 min |
| `TEST_GAPS_AND_RECOMMENDATIONS.md` | Prioritized actionable recommendations + code examples | 15-20 min |
| `BERKELEY_API_CLARIFICATIONS.md` | Questions to ask vendor; use in communication | 15-20 min |
| `TEST_STRATEGY_INDEX.md` | This file; navigation + summary | 5-10 min |

---

## ✅ SUCCESS CRITERIA

When analysis is complete, you should be able to answer:

1. **Tier 1 (Banking Critical):**
   - [ ] Can negative balances occur? When? Which ops blocked?
   - [ ] How does unload/withdrawal work? (Endpoint? Parameters?)
   - [ ] What decimal precision is required? (Cents? Smaller?)

2. **Tier 2 (High-Value Coverage):**
   - [ ] Which fields are immutable? (Email? DOB?)
   - [ ] What's the max length for each string field?
   - [ ] What are valid ranges for numeric fields?

3. **Tier 3 (Robustness):**
   - [ ] What error codes for validation failures?
   - [ ] How do concurrent operations behave?
   - [ ] Which status transitions are allowed?

---

## 🚀 NEXT STEP

**Recommended action:** Share this folder with your QA team and Berkeley's support team:
1. Use **BERKELEY_API_CLARIFICATIONS.md** in vendor communication
2. Use **TEST_GAPS_AND_RECOMMENDATIONS.md** for planning
3. Use **TEST_COVERAGE_ANALYSIS.md** as reference while coding

**Timeline:** 
- Ask Berkeley: 1-2 days
- Implement Tier 1: 1 week (parallel with answers)
- Implement Tier 2-3: 2 weeks (as clarity improves)

---

## 📝 NOTES

### What This Analysis Covers
- Black-box API testing only (no code review)
- Staging environment constraints
- Financial correctness focus (money conservation, negative balance)
- Current gaps relative to existing 20 tests
- Industry best practices for payment APIs

### What's Out of Scope
- Performance/load testing (covered separately in load-tests/)
- UI/frontend testing
- Code coverage analysis
- White-box testing (you don't have access)
- Production environment
- Non-Card Issuing APIs (Accounts, Payouts, etc.)

### Assumptions
- API specs on developers.berkeleypayment.com are authoritative
- Staging environment behaves like production
- All tests are re-runnable (unique data generation works)
- Black-box testing is the primary validation approach

