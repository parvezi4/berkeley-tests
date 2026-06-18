# Exploration Test Suite — Implementation Status
## Empirical Validation of API Behaviour Assumptions

**Date**: 2026-06-18  
**Status**: ✅ Test files created and committed, ready for execution  
**Branch**: `feat/tier1-boundary-value-tests`

---

## Summary

Following the guidance from `CLAUDE_CODE_EXPLORATION_PROMPT.md`, four comprehensive exploration test suites have been created to empirically validate the assumptions documented in `API_BEHAVIOUR_FINDINGS.md`.

These are **diagnostic tests** (not regression tests) designed to:
- Log every HTTP response status, body, and error detail
- Use soft assertions so all steps run regardless of failures
- Record observations for manual analysis and assumption validation
- Answer the 5 key questions that block Tier 2-3 planning

---

## Exploration Test Files Created

### ✅ EXPLORE-1: Negative Balance & Amount Boundaries
**File**: `tests/exploration/explore-negative-balance.spec.ts`

**Tests**:
1. Unload exactly the available balance → expect 201, balance = 0
2. Unload 1 unit on zero balance → observe response
3. Unload 100 units on zero balance → observe response
4. Check balance after over-unload → confirm if negative balances exist
5. Load on zero-balance account → confirm loads from pool
6. Amount = 0 load → observe
7. Amount = -1 load → observe error code
8. Amount = 99,999,999 load → observe

**Validates Assumptions**: A1, A2, A3, A13, A14

**Key Questions Answered**:
- Can balances go negative? (A1)
- What error code for insufficient funds? (A2)
- If negative: how is it formatted? (A3)

---

### ✅ EXPLORE-2: Idempotency Key Semantics
**File**: `tests/exploration/explore-idempotency.spec.ts`

**Tests**:
1. Basic idempotency → load with key K, replay with K, check balance moved once
2. Conflict handling → load with K+100, replay with K+200, observe conflict
3. Key scope → same key on different accounts, observe scope
4. Case sensitivity → load with KEY, replay with key (lowercased)
5. Unload idempotency → confirm idempotency works on unload too

**Validates Assumptions**: A4, A5, A6, A7

**Key Questions Answered**:
- Replay returns same ID? (A4)
- Different amount same key rejected? (A5)
- Per-account scoped or global? (A7)

---

### ✅ EXPLORE-3: Status Transition Matrix
**File**: `tests/exploration/explore-status-transitions.spec.ts`

**Tests** (each transition tested with fresh account to avoid state contamination):

**Path A (from active)**:
- active → suspend
- active → unsuspend (expect error)
- active → mark_card_active
- active → mark_card_lost
- active → mark_card_stolen

**Path B (from suspended)**:
- suspended → unsuspend
- suspended → suspend again (idempotent or error?)
- suspended → mark_card_lost

**Path C (terminal state operations)**:
- lost → GET balance
- lost → GET transactions
- lost → GET account details
- lost → attempt load
- lost → unsuspend (terminal block)

**Validates Assumptions**: A8, A9, A10

**Key Questions Answered**:
- Wrong-state transitions return 4xx? (A8)
- mark_lost available from any state? (A9)
- GET reads work on terminal accounts? (A10)

---

### ✅ EXPLORE-4: Field Validation (Formats, Lengths, Type Coercion)
**File**: `tests/exploration/explore-field-validation.spec.ts`

**Tests**:

**Section A: date_of_birth format on Update**:
1. Try dd-MM-yyyy (same as Create) → record result
2. Try YYYY-MM-DD (docs text format) → record result
3. Try ISO timestamp → record result
4. Try invalid YYYY/MM/DD → record result

**Section B: field length enforcement**:
1. first_name 30 chars → check persisted length and truncation
2. first_name 51 chars → check persisted length and truncation
3. first_name 100 chars → check persisted length

**Section C: phone field requirement**:
1. phone omitted → observe result
2. phone empty string → observe result
3. phone too short → observe result

**Section D: amount type coercion**:
1. amount as string "100" → record status and balance impact
2. amount as float 100.5 → record status and what was stored
3. amount as null → record status
4. amount as "abc" → record status

**Validates Assumptions**: A11, A12, A15, A17

**Key Questions Answered**:
- Field lengths enforced or lenient? (A11-A12)
- Type coercion intentional? (A15)
- Correct date_of_birth format? (A17)

---

## How to Run

### Run all exploration tests:
```bash
npm run explore
```

Or directly:
```bash
npx playwright test tests/exploration/ --reporter=list
```

### Run a specific exploration:
```bash
npx playwright test tests/exploration/explore-negative-balance.spec.ts --reporter=list
npx playwright test tests/exploration/explore-idempotency.spec.ts --reporter=list
npx playwright test tests/exploration/explore-status-transitions.spec.ts --reporter=list
npx playwright test tests/exploration/explore-field-validation.spec.ts --reporter=list
```

### Capture detailed console output:
```bash
npm run explore 2>&1 | tee exploration-results.log
```

---

## Next Steps: Processing Results

Once the exploration tests run, you'll need to:

### 1. **Capture Console Output**
Each test logs a summary table at the end. Save the console output to a file.

### 2. **Update `API_BEHAVIOUR_FINDINGS.md`**
For each assumption (A1–A17), update Section 2:
- Change `[ASSUMED]` to `[CONFIRMED]` or `[REFUTED]`
- Add the observed value in a "Result" column
- Add any unexpected findings as new rows

Example update:
```markdown
| A1 | Negative balance | Unloading more than available balance returns a 4xx | [status] | 422 insufficient_funds | [CONFIRMED] |
```

### 3. **Fill in Section 3 Exploration Tasks**
Update the "Record actual" column in the status transition matrix with results:
```markdown
| active | suspend | 200/201 ✓ | 201 |
| active | unsuspend | 4xx (not suspended) | 422 |
```

### 4. **Answer the 5 Key Questions (Section 4)**
For any questions that testing can answer, fill in the empirical finding.

---

## Test Design Notes

### Soft Assertions Throughout
All tests use `expect.soft()` so that every step runs even when assertions fail. This ensures we capture complete information about the API's behavior.

### Comprehensive Logging
Every console.log is prefixed with `[EXPLORE-X]` for easy filtering and identification:
```bash
grep '\[EXPLORE-1\]' exploration-results.log
```

### Read-Back Verification (EXPLORE-4)
For field validation, tests do create → GET → compare to verify what was actually persisted, not just what the API accepted.

### State Isolation
Each status transition test (EXPLORE-3) creates a fresh cardholder to avoid state contamination from previous transitions.

---

## Assumptions Being Validated

| ID | Area | Assumption | Status |
|---|---|---|---|
| A1-A3 | Negative balance | Behavior when unloading beyond balance | [PENDING] |
| A4-A7 | Idempotency | Key semantics, scope, conflict handling | [PENDING] |
| A8-A10 | Status transitions | Valid/invalid transitions, terminal states, reads on terminal | [PENDING] |
| A11-A12 | Field lengths | Enforcement (hard vs soft), truncation | [PENDING] |
| A15 | Type coercion | String/float amounts accepted? | [PENDING] |
| A17 | date_of_birth format | Correct format for Update endpoint | [PENDING] |

---

## Blockers Resolved by This Exploration

Once results are captured and assumptions updated:

- ✅ **Issue #17** (Negative Balance Policy) → EXPLORE-1 answer
- ✅ **Issue #15** (Idempotency Semantics) → EXPLORE-2 answer
- ✅ **Issue #16** (Status Transitions) → EXPLORE-3 answer
- ✅ **Issue #14** (Required Fields & date_of_birth) → EXPLORE-4 answer

---

## Integration with Tier 2-3 Planning

Once assumptions are validated:

1. **Tier 2 can proceed**:
   - Negative Balance Scenarios (Issue #11) → unblocked by A1-A3 answers
   - Multi-Load Conservation (Issue #12) → unblocked by A4-A7 answers

2. **Tier 3 can proceed**:
   - Concurrent Operations (Issue #13) → unblocked by A8-A10 answers

3. **Bug fixes / spec updates**:
   - If assumptions are REFUTED, we update OpenAPI spec accordingly
   - If we discover bugs (e.g., date format issue), create GitHub issues

---

## Files Modified/Created

- ✅ `tests/exploration/explore-negative-balance.spec.ts` (204 lines)
- ✅ `tests/exploration/explore-idempotency.spec.ts` (245 lines)
- ✅ `tests/exploration/explore-status-transitions.spec.ts` (319 lines)
- ✅ `tests/exploration/explore-field-validation.spec.ts` (391 lines)
- ✅ `package.json` (added `"explore"` script)
- ✅ `docs/API_BEHAVIOUR_FINDINGS.md` (reference document)
- ✅ `docs/CLAUDE_CODE_EXPLORATION_PROMPT.md` (instructions)

---

## Status Summary

| Item | Status |
|------|--------|
| Exploration test files created | ✅ Done |
| Tests committed to git | ✅ Done |
| Package script added | ✅ Done |
| Ready to execute | ✅ Yes |
| Assumptions being tested | ✅ 16 total |
| Questions being answered | ✅ 5 critical |
| Blockers addressed | ✅ 4 critical issues |

**Next Action**: Run the exploration suite and process results back into `API_BEHAVIOUR_FINDINGS.md`.

---

*Last updated: 2026-06-18*  
*Related files: tests/exploration/, docs/API_BEHAVIOUR_FINDINGS.md, docs/CLAUDE_CODE_EXPLORATION_PROMPT.md*
