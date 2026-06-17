# Tier 1 Implementation Plan — Boundary Value & Business Logic Tests
## OpenAPI Spec-Based (No Assumptions)

**Branch:** `feat/tier1-boundary-value-tests`  
**Date:** 2026-06-17  
**Scope:** Implement tests based on definitive OpenAPI spec findings  
**Status:** Ready to implement

---

## OVERVIEW

### Tests to Implement (6 Test Suites, ~25 Tests Total)

| Suite | File | Tests | Effort | Dependencies |
|-------|------|-------|--------|---|
| 1. Date Format Mismatch | `tests/cardholders/date-format.spec.ts` | 4 | Low | None |
| 2. Amount Integer Validation | `tests/value-loads/amount-validation.spec.ts` | 5 | Low | None |
| 3. External Tag Behavior | `tests/value-loads/external-tag.spec.ts` | 3 | Low | None |
| 4. Phone Constraints | `tests/cardholders/phone-constraints.spec.ts` | 4 | Low | None |
| 5. Field Length Boundaries | `tests/cardholders/field-lengths.spec.ts` | 5 | Medium | None |
| 6. Status Actions & Unload | `tests/accounts/status-actions.spec.ts`, `tests/value-loads/unload.spec.ts` | 4 | Low-Medium | Config (unload enabled?) |

### Key Principle: Document Assumptions Clearly
Every test will include a comment explaining:
- What we're testing
- What the OpenAPI spec says
- What assumption we're making (if any)
- What behavior we expect

---

## TEST SUITE 1: DATE FORMAT MISMATCH

**File:** `tests/cardholders/date-format.spec.ts`

**Rationale:** OpenAPI shows inconsistent date formats (dd-MM-yyyy for create, YYYY-MM-DD for update). This is unusual and likely a bug.

**Tests:**

```typescript
import { test, expect } from '../fixtures/api-fixtures.js';
import { BerkeleyClient } from '../support/api/berkeley-client.js';
import { newCardholder, createCardholderWithRetry } from '../support/utils/test-data.js';

/**
 * DATE FORMAT MISMATCH TESTS
 *
 * OpenAPI Spec Finding:
 *   - Create Cardholder: date_of_birth format is "dd-MM-yyyy" (e.g., "01-01-1980")
 *   - Update Cardholder: date_of_birth format is "YYYY-MM-DD" (e.g., "1980-01-01")
 *
 * This is unusual and inconsistent. These tests verify actual behavior and flag
 * the discrepancy for the engineering team.
 */
test.describe('Cardholder Date Format', () => {
  test('[spec] create cardholder accepts dd-MM-yyyy format', async ({ client }) => {
    // OpenAPI documented format for create
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder({
        date_of_birth: '01-01-1980'  // dd-MM-yyyy
      }))
    );
    expect(res.status()).toBe(201);
  });

  test('[assumption] update cardholder accepts YYYY-MM-DD format', async ({ client }) => {
    // OpenAPI shows YYYY-MM-DD for update; assumption: this is correct
    const ch = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder())
    );
    const created = BerkeleyClient.unwrap(await ch.json());

    const updateRes = await client.updateCardholder(created.id, {
      date_of_birth: '1980-01-01'  // YYYY-MM-DD format per spec
    });
    expect([200, 201]).toContain(updateRes.status());
  });

  test('[bug] create with YYYY-MM-DD format (wrong format)', async ({ client }) => {
    // If create uses dd-MM-yyyy, this should fail
    // Assumption: wrong format rejected with 4xx
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder({
        date_of_birth: '1980-01-01'  // Wrong format
      }))
    );
    // This may pass (lenient parsing) or fail (strict parsing)
    // Document actual behavior
    if (res.status() === 400 || res.status() === 422) {
      test.info().annotations.push({
        type: 'note',
        description: 'Create rejects YYYY-MM-DD format as expected'
      });
    } else {
      test.info().annotations.push({
        type: 'warning',
        description: `Create accepted YYYY-MM-DD format (lenient parsing?): ${res.status()}`
      });
    }
  });

  test('[bug] update with dd-MM-yyyy format (wrong format)', async ({ client }) => {
    // If update uses YYYY-MM-DD, this should fail
    // Assumption: wrong format rejected with 4xx
    const ch = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder())
    );
    const created = BerkeleyClient.unwrap(await ch.json());

    const res = await client.updateCardholder(created.id, {
      date_of_birth: '01-01-1980'  // Wrong format for update
    });
    // Document actual behavior
    if ([400, 422].includes(res.status())) {
      test.info().annotations.push({
        type: 'note',
        description: 'Update rejects dd-MM-yyyy format as expected'
      });
    } else {
      test.info().annotations.push({
        type: 'warning',
        description: `Update accepted dd-MM-yyyy format (inconsistent?): ${res.status()}`
      });
    }
  });
});
```

---

## TEST SUITE 2: AMOUNT INTEGER VALIDATION

**File:** `tests/value-loads/amount-validation.spec.ts`

**Rationale:** OpenAPI spec says amounts are integers in smallest currency unit (1000 = $10.00). No decimals allowed.

**Tests:**

```typescript
/**
 * VALUE LOAD AMOUNT VALIDATION
 *
 * OpenAPI Spec Finding:
 *   - amount: integer (smallest currency unit)
 *   - Example: $10.00 CAD = 1000
 *   - Min/max values NOT documented in spec
 *
 * Assumption: We test boundaries to discover actual limits
 *   - Min: 1 (penny)
 *   - Max: Unknown; will test progressively
 *   - Decimal rejection: Expected to fail
 */
test.describe('Value Load Amount Validation', () => {
  test('[spec] load with integer amount succeeds', async ({ client, seededAccount }) => {
    const res = await client.createValueLoad({
      account_id: seededAccount.accountId,
      amount: 1000,  // $10.00, integer per spec
      external_tag: uniqueTag()
    });
    expect(res.status()).toBe(201);
  });

  test('[boundary] load with minimum amount (1 unit = $0.01)', async ({ client, seededAccount }) => {
    // Assumption: minimum is 1 unit (penny)
    const res = await client.createValueLoad({
      account_id: seededAccount.accountId,
      amount: 1,
      external_tag: uniqueTag()
    });
    // May succeed or fail; document finding
    if (res.status() === 201) {
      test.info().annotations.push({
        type: 'note',
        description: 'Minimum amount 1 unit accepted'
      });
    } else {
      test.info().annotations.push({
        type: 'note',
        description: `Minimum amount 1 unit rejected: ${res.status()}`
      });
    }
  });

  test('[boundary] load with amount 0 (no load)', async ({ client, seededAccount }) => {
    // Assumption: zero amount may be rejected
    const res = await client.createValueLoad({
      account_id: seededAccount.accountId,
      amount: 0,
      external_tag: uniqueTag()
    });
    expect([201, 400, 422]).toContain(res.status());
    test.info().annotations.push({
      type: 'note',
      description: `Amount 0 behavior: ${res.status()}`
    });
  });

  test('[negative] load with decimal amount rejected', async ({ client, seededAccount }) => {
    // OpenAPI says integer; decimals should fail
    // Assumption: 10.50 rejected with 4xx
    const res = await client.createValueLoad({
      account_id: seededAccount.accountId,
      amount: 10.50 as never,  // Decimal
      external_tag: uniqueTag()
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('[negative] load with string amount rejected', async ({ client, seededAccount }) => {
    // Type mismatch: string instead of integer
    // Assumption: "1000" rejected
    const res = await client.createValueLoad({
      account_id: seededAccount.accountId,
      amount: "1000" as never,  // String type
      external_tag: uniqueTag()
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('[boundary] load with large amount (exploratory)', async ({ client, seededAccount }) => {
    // Assumption: Large amounts should work (unless max enforced)
    // Test 999,999.99 = 99,999,999 units
    const res = await client.createValueLoad({
      account_id: seededAccount.accountId,
      amount: 99_999_999,
      external_tag: uniqueTag()
    });
    // Document finding
    test.info().annotations.push({
      type: 'note',
      description: `Large amount (99,999,999 units) status: ${res.status()}`
    });
  });
});
```

---

## TEST SUITE 3: EXTERNAL TAG BEHAVIOR

**File:** `tests/value-loads/external-tag.spec.ts`

**Rationale:** OpenAPI says external_tag is REQUIRED (not optional). Quick tests to verify behavior and uniqueness.

**Tests:**

```typescript
/**
 * VALUE LOAD EXTERNAL TAG
 *
 * OpenAPI Spec Finding:
 *   - external_tag: required field (not optional)
 *   - Uniqueness: NOT documented
 *
 * Assumption: We test to discover:
 *   - Is it truly required?
 *   - Can duplicates exist?
 *   - Can it be empty string?
 */
test.describe('Value Load External Tag', () => {
  test('[spec] load without external_tag is rejected', async ({ client, seededAccount }) => {
    const res = await client.createValueLoad({
      account_id: seededAccount.accountId,
      amount: 1000,
      // external_tag: omitted
    } as never);
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('[assumption] load with empty external_tag behavior', async ({ client, seededAccount }) => {
    // Spec says required; empty string may or may not fail
    const res = await client.createValueLoad({
      account_id: seededAccount.accountId,
      amount: 1000,
      external_tag: ''
    });
    // Document finding
    test.info().annotations.push({
      type: 'note',
      description: `Empty external_tag status: ${res.status()}`
    });
  });

  test('[discovery] duplicate external_tag behavior', async ({ client, seededAccount }) => {
    // Assumption: Duplicates allowed (not enforced as unique)
    const tag = uniqueTag();

    const res1 = await client.createValueLoad({
      account_id: seededAccount.accountId,
      amount: 1000,
      external_tag: tag
    });
    expect(res1.status()).toBe(201);

    const res2 = await client.createValueLoad({
      account_id: seededAccount.accountId,
      amount: 500,
      external_tag: tag  // Same tag
    });
    
    // Document finding
    if (res2.status() === 201) {
      test.info().annotations.push({
        type: 'note',
        description: 'Duplicate external_tag allowed (not unique per load)'
      });
    } else {
      test.info().annotations.push({
        type: 'note',
        description: 'Duplicate external_tag rejected (enforced unique)'
      });
    }
  });
});
```

---

## TEST SUITE 4: PHONE CONSTRAINTS

**File:** `tests/cardholders/phone-constraints.spec.ts`

**Rationale:** OpenAPI explicitly documents phone constraints by region (Canadian: required + max 16; US: optional + max 10).

**Tests:**

```typescript
/**
 * CARDHOLDER PHONE CONSTRAINTS
 *
 * OpenAPI Spec Finding:
 *   - Canadian programs: phone required, max 16 digits
 *   - US programs: phone optional, max 10 digits
 *   - Your program: country 124 (Canada), so phone required
 *
 * These tests verify region-specific constraints.
 */
test.describe('Cardholder Phone Constraints', () => {
  test('[spec] canadian cardholder without phone is rejected', async ({ client }) => {
    // Country 124 = Canada, requires phone
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder({
        country: '124',  // Canada
        phone: undefined
      }))
    );
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('[spec] canadian cardholder with valid phone succeeds', async ({ client }) => {
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder({
        country: '124',  // Canada
        phone: '1231231234'  // 10 digits, within 16-digit max
      }))
    );
    expect(res.status()).toBe(201);
  });

  test('[boundary] canadian cardholder with 16-digit phone (max)', async ({ client }) => {
    // Max 16 digits for Canadian per spec
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder({
        country: '124',
        phone: '1'.repeat(16)  // Exactly 16 digits
      }))
    );
    // Should succeed if 16 is truly the max
    test.info().annotations.push({
      type: 'note',
      description: `16-digit phone status: ${res.status()}`
    });
  });

  test('[boundary] canadian cardholder with 17-digit phone (over max)', async ({ client }) => {
    // Over 16-digit max for Canadian
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder({
        country: '124',
        phone: '1'.repeat(17)  // 17 digits
      }))
    );
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
});
```

---

## TEST SUITE 5: FIELD LENGTH BOUNDARIES

**File:** `tests/cardholders/field-lengths.spec.ts`

**Rationale:** OpenAPI specifies maxLength for all string fields. Test exact boundaries.

**Tests:**

```typescript
/**
 * CARDHOLDER FIELD LENGTH BOUNDARIES
 *
 * OpenAPI Spec Findings (maxLength):
 *   - first_name, middle_name, last_name: 50
 *   - address1: 40
 *   - address2: 30
 *   - city: 100
 *   - email: 50
 *
 * Assumption: Fields at limit accepted, over limit rejected
 */
test.describe('Cardholder Field Length Boundaries', () => {
  const helpers = {
    atLimit: (len: number) => 'a'.repeat(len),
    overLimit: (len: number) => 'a'.repeat(len + 1)
  };

  test('[boundary] first_name at maxLength 50', async ({ client }) => {
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder({
        first_name: helpers.atLimit(50)
      }))
    );
    expect(res.status()).toBe(201);
  });

  test('[boundary] first_name over maxLength 50', async ({ client }) => {
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder({
        first_name: helpers.overLimit(50)
      }))
    );
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('[boundary] address1 at maxLength 40', async ({ client }) => {
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder({
        address1: helpers.atLimit(40)
      }))
    );
    expect(res.status()).toBe(201);
  });

  test('[boundary] address1 over maxLength 40', async ({ client }) => {
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder({
        address1: helpers.overLimit(40)
      }))
    );
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('[boundary] email at maxLength 50', async ({ client }) => {
    // Format: user@example.com = 15 chars, so pad with "a" prefix
    const email = 'a'.repeat(50 - '@example.com'.length) + '@example.com';
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder({
        email
      }))
    );
    expect(res.status()).toBe(201);
  });

  test('[boundary] email over maxLength 50', async ({ client }) => {
    const email = 'a'.repeat(51 - '@example.com'.length) + '@example.com';  // 51 chars total
    const res = await createCardholderWithRetry(() =>
      client.createCardholder(newCardholder({
        email
      }))
    );
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
});
```

---

## TEST SUITE 6: STATUS ACTIONS & UNLOAD

**File:** `tests/accounts/status-actions.spec.ts` & `tests/value-loads/unload.spec.ts`

**Rationale:** OpenAPI shows status as action keywords (suspend, unsuspend, mark_card_lost, etc.), not state names. Also verify unload endpoint exists.

**Tests:**

```typescript
/**
 * ACCOUNT STATUS ACTIONS
 *
 * OpenAPI Spec Findings:
 *   - Status is an ACTION keyword, not a state name
 *   - Actions: suspend, unsuspend, mark_card_active, mark_card_lost, etc.
 *   - Terminal states: lost, stolen (cannot change)
 *
 * Assumption: State names (suspended, lost) should fail; actions should work
 */
test.describe('Account Status Actions', () => {
  test('[spec] suspend action succeeds', async ({ client, seededAccount }) => {
    const res = await client.modifyAccountStatus(
      seededAccount.accountId,
      'suspend',
      seededAccount.lastFourDigits
    );
    expect([200, 201]).toContain(res.status());
  });

  test('[spec] unsuspend action succeeds', async ({ client, seededAccount }) => {
    // First suspend
    await client.modifyAccountStatus(
      seededAccount.accountId,
      'suspend',
      seededAccount.lastFourDigits
    );
    // Then unsuspend
    const res = await client.modifyAccountStatus(
      seededAccount.accountId,
      'unsuspend',
      seededAccount.lastFourDigits
    );
    expect([200, 201]).toContain(res.status());
  });

  test('[assumption] state name "suspended" (not action) may fail', async ({ client, seededAccount }) => {
    // Assumption: "suspended" is state name, not action; should fail
    const res = await client.modifyAccountStatus(
      seededAccount.accountId,
      'suspended' as never,  // State name, not action
      seededAccount.lastFourDigits
    );
    // Document finding
    test.info().annotations.push({
      type: 'note',
      description: `State name "suspended" status: ${res.status()}`
    });
  });
});

/**
 * VALUE UNLOAD ENDPOINT
 *
 * OpenAPI Spec Findings:
 *   - Separate endpoint: POST /api/v1/card_issuing/value_loads/unload
 *   - Must be enabled per program (expect 422 if not enabled)
 *   - Same schema as load (account_id, amount, external_tag, etc.)
 */
test.describe('Value Unload', () => {
  test('[spec] unload endpoint exists and either works or is disabled', async ({ client, seededAccount }) => {
    // Lenient test: expect either 201 (success) or 422 (not enabled)
    const res = await client.createValueUnload({
      account_id: seededAccount.accountId,
      amount: 500,
      external_tag: uniqueTag()
    });
    
    if (res.status() === 201) {
      test.info().annotations.push({
        type: 'note',
        description: 'Unload feature is enabled on this program'
      });
    } else if (res.status() === 422) {
      test.info().annotations.push({
        type: 'note',
        description: 'Unload feature is NOT enabled on this program (expected for many programs)'
      });
    } else {
      test.info().annotations.push({
        type: 'warning',
        description: `Unload unexpected status: ${res.status()}`
      });
    }
  });
});
```

---

## IMPLEMENTATION CHECKLIST

### Step 1: Add Test Files
- [ ] `tests/cardholders/date-format.spec.ts`
- [ ] `tests/value-loads/amount-validation.spec.ts`
- [ ] `tests/value-loads/external-tag.spec.ts`
- [ ] `tests/cardholders/phone-constraints.spec.ts`
- [ ] `tests/cardholders/field-lengths.spec.ts`
- [ ] `tests/accounts/status-actions.spec.ts`
- [ ] `tests/value-loads/unload.spec.ts` (or add to value-loads.spec.ts)

### Step 2: Add Helper Method to BerkeleyClient (if needed)
```typescript
// For unload endpoint
createValueUnload(body: CreateValueLoadRequest): Promise<APIResponse> {
  return this.request.post(this.path('value_loads', 'unload'), {
    headers: this.headers,
    data: body
  });
}
```

### Step 3: Run Tests Locally
```bash
npm test                 # Full suite
npm run test:cardholders # Cardholder tests
npm run test:value-loads # Value load tests
npm run test:accounts    # Account tests
```

### Step 4: Routine Checks
```bash
npm run typecheck        # TypeScript compilation
npm run lint             # ESLint
npm run check            # All checks
```

### Step 5: Review Findings
- [ ] Date format mismatch: confirmed or resolved?
- [ ] Amount validation: min/max discovered?
- [ ] External tag: uniqueness behavior?
- [ ] Phone: constraints verified?
- [ ] Field lengths: all at boundary tested?
- [ ] Status actions: keywords work?
- [ ] Unload: enabled or disabled?

### Step 6: Document Findings
- [ ] Create TIER1_FINDINGS.md with results
- [ ] Note any unexpected behaviors
- [ ] Flag items for engineering team (date format, etc.)

### Step 7: Commit & Push
```bash
git add tests/
git commit -m "feat: add Tier 1 boundary value tests

- Date format mismatch (create vs update)
- Amount integer validation
- External tag required check
- Phone constraints by region
- Field length boundaries
- Status action keywords
- Unload endpoint check

All tests include assumption documentation."
```

---

## ASSUMPTIONS DOCUMENTED IN CODE

Every test file includes:
1. **OpenAPI Spec Finding** comment block
2. **Assumption** or **Boundary** marker on each test
3. **Annotation** on expected vs. actual behavior
4. Clear indication of what to flag to engineering

Example annotation pattern:
```typescript
test.info().annotations.push({
  type: 'note',        // or 'warning'
  description: 'What we discovered'
});
```

---

## Expected Outcomes

After running Tier 1, we'll know:
- ✅ Date format mismatch: confirmed bug or working as intended?
- ✅ Amount validation: min/max limits
- ✅ External tag: required + uniqueness behavior
- ✅ Phone: constraints verified
- ✅ Field lengths: exact boundaries
- ✅ Status actions: keyword vs. state name behavior
- ✅ Unload: enabled or program-specific

These findings will inform:
- Further test refinement (Tier 2-3)
- Items to raise with engineering team
- Documentation for future test maintainers

