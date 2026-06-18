# GitHub Issues Setup Summary
## Berkeley Tests Repository - Issue Organization

**Date:** 2026-06-17  
**Repository:** https://github.com/parvezi4/berkeley-tests  
**Total Issues Created:** 16

---

## 📋 OVERVIEW

GitHub issues have been organized into four categories:

1. **Completed Work** (6 issues) — Tier 1 boundary value tests ✅
2. **Findings & Bugs** (3 issues) — Spec discrepancies discovered 🐛
3. **Planned Work** (5 issues) — Tier 2-4 test roadmap 📋
4. **Engineering Clarifications** (4 issues) — Questions for Berkeley team ❓

---

## ✅ COMPLETED WORK (Tier 1 - All Closed)

These issues track the 37 completed boundary value tests.

### 1. [COMPLETE] Date Format Boundary Tests
- **File:** `tests/cardholders/date-format.spec.ts`
- **Tests:** 4
- **Status:** ✅ Closed
- **Labels:** `tool:playwright`, `type:boundary`, `priority:high`, `size:s`
- **Key Finding:** Date format mismatch between Create (dd-MM-yyyy) and Update (YYYY-MM-DD)

### 2. [COMPLETE] Phone Constraints Tests
- **File:** `tests/cardholders/phone-constraints.spec.ts`
- **Tests:** 7
- **Status:** ✅ Closed
- **Labels:** `tool:playwright`, `type:boundary`, `priority:medium`, `size:m`
- **Key Finding:** Phone constraints not strictly enforced

### 3. [COMPLETE] Field Length Boundary Tests
- **File:** `tests/cardholders/field-lengths.spec.ts`
- **Tests:** 12
- **Status:** ✅ Closed
- **Labels:** `tool:playwright`, `type:boundary`, `priority:high`, `size:m`
- **Key Finding:** Field maxLength limits NOT enforced

### 4. [COMPLETE] Amount Validation Tests
- **File:** `tests/value-loads/amount-validation.spec.ts`
- **Tests:** 7
- **Status:** ✅ Closed
- **Labels:** `tool:playwright`, `type:boundary`, `priority:critical`, `size:m`
- **Key Finding:** String amounts accepted and coerced to integers

### 5. [COMPLETE] External Tag Discovery Tests
- **File:** `tests/value-loads/external-tag.spec.ts`
- **Tests:** 5
- **Status:** ✅ Closed
- **Labels:** `tool:playwright`, `type:discovery`, `priority:medium`, `size:s`
- **Key Finding:** external_tag NOT required despite OpenAPI saying so

### 6. [COMPLETE] Status Actions & Unload Tests
- **Files:** `tests/accounts/accounts.spec.ts`, `tests/value-loads/value-loads.spec.ts`
- **Tests:** 2
- **Status:** ✅ Closed
- **Labels:** `tool:playwright`, `type:business-logic`, `priority:medium`, `size:s`
- **Key Finding:** Unload endpoint confirmed and working

---

## 🐛 FINDINGS & BUGS (In Progress)

These issues document spec discrepancies discovered during testing.

### 1. Date Format Mismatch: Create vs Update
- **Priority:** CRITICAL
- **Status:** 🔴 In Progress
- **Description:** OpenAPI shows dd-MM-yyyy for create, YYYY-MM-DD for update, but update rejects YYYY-MM-DD
- **Action:** Clarify with Berkeley if spec is wrong or API has bug
- **Labels:** `type:discovery`, `priority:critical`, `status:in-progress`

### 2. API More Lenient Than OpenAPI Spec
- **Priority:** HIGH
- **Status:** 🔴 In Progress
- **Description:** Field length limits, required fields, and type validation not enforced as spec states
- **Impact:** 
  - Field maxLength: API ignores (accepts 50+ chars when max 50)
  - external_tag: API treats as optional despite "required"
  - Type coercion: String amounts accepted
- **Action:** Decide if lenient parsing intentional or bug
- **Labels:** `type:discovery`, `priority:high`, `status:in-progress`

### 3. Phone Validation Constraints
- **Priority:** MEDIUM
- **Status:** 🟡 Blocked
- **Description:** Phone constraints (Canadian required, US optional) may not be enforced
- **Action:** Ask Berkeley if constraints are enforced and which formats accepted
- **Labels:** `priority:medium`, `status:blocked`

---

## 📋 PLANNED WORK (Tier 2-4)

Backlog of additional test work organized by tier.

### Tier 2 - Advanced Coverage (3 issues)

#### 1. Negative Balance Scenarios
- **Priority:** CRITICAL
- **Size:** L
- **Tests Needed:**
  - Unload creates negative balance
  - Suspended account balance behavior
  - Load to negative-balance account
  - Transaction ordering with negative
- **Tool:** Playwright
- **Status:** 📋 Planned

#### 2. Multi-Load Money Conservation
- **Priority:** CRITICAL
- **Size:** M
- **Tests Needed:**
  - 5 sequential loads → sum = balance increase
  - Concurrent loads → no lost updates
  - Idempotency across multiple loads
  - Precision with partial penny amounts
- **Tool:** Playwright
- **Status:** 📋 Planned

#### 3. Field Format Validation
- **Priority:** HIGH
- **Size:** M
- **Tests Needed:**
  - Email format (RFC 5322, international domains)
  - Phone format (intl, patterns)
  - Postal codes (country-specific)
  - Country codes (ISO numeric)
  - State codes (2-letter, region validation)
- **Tool:** Newman (better for parameter variation)
- **Status:** 📋 Planned

### Tier 3 - Robustness (2 issues)

#### 1. Concurrent Operations & Race Conditions
- **Priority:** HIGH
- **Size:** L
- **Tests Needed:**
  - Concurrent loads to same account
  - Concurrent status changes
  - Load + status change race
  - Concurrent cardholder updates
- **Tool:** Playwright
- **Status:** 📋 Planned

#### 2. Error Code & Response Format Validation
- **Priority:** MEDIUM
- **Size:** M
- **Tests Needed:**
  - Error response structure
  - HTTP status codes per error
  - 400 vs 422 vs 409 semantics
  - Error message clarity
- **Tool:** Newman
- **Status:** 📋 Planned

### Tier 4 - Polish & Deferred (1 issue)

#### 1. API Contract Snapshot Testing
- **Priority:** MEDIUM
- **Size:** L
- **Tests Needed:**
  - Response schema per endpoint
  - Field presence/absence
  - Timestamp format consistency
  - Type correctness
- **Tool:** Playwright + Analysis
- **Status:** 📋 Planned

---

## ❓ ENGINEERING CLARIFICATIONS (Blocked)

Questions to ask Berkeley engineering team. These block Tier 2 planning.

### 1. Clarify Required Fields & Constraints
- **Priority:** HIGH
- **Blocks:** Tier 1-2 validation strategy
- **Questions:**
  - Is external_tag truly required?
  - Phone field requirements (actual constraints)?
  - Are field length limits hard constraints?
  - Min/max amount values?
- **Status:** 🔴 Blocked (awaiting response)

### 2. Clarify Idempotency Semantics & Retention
- **Priority:** MEDIUM
- **Blocks:** Tier 2 idempotency testing
- **Questions:**
  - Which endpoints support idempotency_key?
  - How long is key valid?
  - Conflict handling (replay with different amount)?
- **Status:** 🔴 Blocked (awaiting response)

### 3. Status Transition Rules & Terminal States
- **Priority:** MEDIUM
- **Blocks:** Tier 2 status testing
- **Questions:**
  - Allowed status transitions?
  - Terminal state enforcement?
  - Error codes?
- **Status:** 🔴 Blocked (awaiting response)

### 4. Negative Balance Policy
- **Priority:** CRITICAL
- **Blocks:** Tier 1-2 conservation testing
- **Questions:**
  - Can balances go negative?
  - Conditions for negative (unload only)?
  - Operations blocked when negative?
- **Status:** 🔴 Blocked (awaiting response)

---

## 🏷️ LABELS USED

### Priority
- `priority:critical` — Critical for banking/correctness
- `priority:high` — High impact on test coverage
- `priority:medium` — Medium priority, nice-to-have
- `priority:low` — Low priority, polish

### Size
- `size:xs` — Very small (1 test)
- `size:s` — Small (1-3 tests)
- `size:m` — Medium (3-7 tests)
- `size:l` — Large (7-15 tests)
- `size:xl` — Extra large (15+ tests)

### Type
- `type:boundary` — Boundary value testing
- `type:negative` — Negative path testing
- `type:business-logic` — Business logic verification
- `type:discovery` — Discovery/investigation of behavior

### Tool
- `tool:playwright` — Implemented with Playwright
- `tool:newman` — Implemented with Newman/Postman
- `tool:analysis` — Analysis/investigation work

### Status
- `status:completed` — Work is done (closed issues)
- `status:in-progress` — Work is ongoing (findings/bugs)
- `status:blocked` — Waiting on clarification

---

## 📚 MILESTONES

Issues organized by testing tier:

### Tier 1 - Boundary Values ✅
- **Status:** Complete
- **Issues:** 6 completed tests + 2 findings + 1 clarification
- **Coverage:** Date formats, phone, field lengths, amounts, external tags, status actions, unload

### Tier 2 - Advanced Coverage 📋
- **Status:** Planned
- **Issues:** 3 tests + 1 clarification
- **Focus:** Multi-load conservation, negative balances, format validation

### Tier 3 - Robustness 📋
- **Status:** Planned
- **Issues:** 2 tests
- **Focus:** Concurrency, error handling

### Tier 4 - Polish & Deferred 📋
- **Status:** Planned
- **Issues:** 1 test
- **Focus:** Contract snapshots, advanced validation

---

## 📊 STATISTICS

| Category | Count | Status |
|----------|-------|--------|
| Completed Tests | 6 | ✅ Closed |
| Findings/Bugs | 3 | 🔴 In Progress |
| Planned Tests | 5 | 📋 Planned |
| Clarifications | 4 | 🔴 Blocked |
| **Total** | **18** | Mixed |

---

## 🔄 NEXT STEPS

### For Team Review
1. Review completed Tier 1 tests (can close as done)
2. Discuss findings with engineering
3. Prioritize Tier 2 work

### For Berkeley Engineering
1. Address CRITICAL clarifications (negative balance policy)
2. Clarify spec discrepancies (date format, lenient validation)
3. Provide answers to enable Tier 2 planning

### For QA Team
1. Once clarifications received: update issue descriptions
2. Begin Tier 2 implementation
3. Track progress via GitHub issues

---

## 📁 RELATED DOCUMENTATION

- **Test Results:** `docs/TIER1_FINDINGS_SUMMARY.md`
- **OpenAPI Spec:** `docs/berkeley-card-issuing-openapi.yaml`
- **Test Analysis:** `docs/OPENAPI_FINDINGS_AND_UPDATES.md`
- **Coverage Matrix:** `docs/TEST_COVERAGE_ANALYSIS.md`
- **Roadmap:** `docs/TEST_GAPS_AND_RECOMMENDATIONS.md`

---

## ✨ KEY ACHIEVEMENTS

✅ All Tier 1 tests passing (37 tests)  
✅ GitHub issues created and organized  
✅ Findings documented for engineering review  
✅ Roadmap visible for Tier 2-4 planning  
✅ Clarification questions prepared for Berkeley team  

