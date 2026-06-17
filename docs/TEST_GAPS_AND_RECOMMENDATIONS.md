# Test Coverage Gaps & Actionable Recommendations
## Based on Official Berkeley API Specs

**Date:** 2026-06-17  
**Status:** Analysis complete; ready for implementation planning

---

## QUICK SUMMARY

### Current State ✅
- 20 Playwright tests across 4 resource groups
- Core happy paths covered
- Money conservation & idempotency validated (single load)
- Auth isolation tested
- Basic negative paths (non-existent IDs, missing fields)

### Critical Gaps Found ❌
1. **No boundary value testing** (string lengths, numeric ranges)
2. **No type coercion testing** (wrong types for fields)
3. **No negative balance scenario tests** (banking critical!)
4. **No multi-load conservation tests** (verification only for single loads)
5. **No unload/withdrawal testing** (API supports unload type, not tested)
6. **No pagination edge cases** (limit=0, offset > total)
7. **No terminal state testing** (lost/stolen status can't change)
8. **No value_load filtering tests** (program_id, external_tag)
9. **No processor_reference UUID validation**
10. **No concurrent operation tests** (race conditions)

---

## TIER 1 TESTS (Implement First — Banking Critical)

### 1.1: Negative Balance Handling
**Risk:** High — Direct financial impact  
**Effort:** Medium (requires testing "unload" endpoint; spec exists but not tested)  
**Suite:** Playwright

```typescript
test('unload creates negative balance scenario', async ({ client, seededAccount }) => {
  // Prerequisite: Account has $100
  const beforeLoad = await getBalance(seededAccount.accountId);
  
  // Unload $150 (more than balance)
  const unload = await client.createValueLoad({
    account_id: seededAccount.accountId,
    amount: -150,  // OR use specific unload endpoint if exists
    load_type: 'unload'  // May need separate endpoint
  });
  
  // Expected: Either
  // (a) 4xx rejection (insufficient funds), OR
  // (b) 201 success, balance = -50
  
  if (unload.status() === 201) {
    const afterUnload = await getBalance(seededAccount.accountId);
    expect(afterUnload).toBe(beforeLoad - 150);
    
    // CRITICAL: Can we still load to negative account?
    const reload = await client.createValueLoad({
      account_id: seededAccount.accountId,
      amount: 100,
      external_tag: uniqueTag()
    });
    expect(reload.status()).toBe(201);
    expect(await getBalance(seededAccount.accountId)).toBe(beforeLoad - 50);
  } else {
    expect(unload.status()).toBeGreaterThanOrEqual(400);
    expect(unload.status()).toBeLessThan(500);
  }
});

test('[critical] negative amount in load request is rejected', async ({ client }) => {
  const res = await client.createValueLoad({
    account_id: seededAccount.accountId,
    amount: -100  // MUST REJECT
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
});

test('operation on account with negative balance succeeds', async ({ client, seededAccount }) => {
  // Assume account at -$50 after unload
  // Attempt another operation
  const load = await client.createValueLoad({
    account_id: seededAccount.accountId,
    amount: 75
  });
  expect([200, 201]).toContain(load.status());
  expect(await getBalance(seededAccount.accountId)).toBe(25);  // -50 + 75
});
```

**Clarification Needed:** Is there a separate unload endpoint, or does amount: -100 trigger unload?

---

### 1.2: Multi-Load Money Conservation
**Risk:** High — Sums matter more than singles  
**Effort:** Low  
**Suite:** Playwright

```typescript
test('[flagship] multiple loads sum exactly to final balance increase', async ({ client, seededAccount }) => {
  const before = await getBalance(seededAccount.accountId);
  
  const loads = [100, 50.25, 33.33, 10.01, 5.41];
  const expected = loads.reduce((a, b) => a + b);
  
  for (const amount of loads) {
    const res = await client.createValueLoad({
      account_id: seededAccount.accountId,
      amount,
      external_tag: uniqueTag()
    });
    expect(res.status()).toBe(201);
  }
  
  const after = await getBalance(seededAccount.accountId);
  expect(after - before).toBe(expected);
});
```

---

### 1.3: Terminal Status Detection
**Risk:** Medium — Lost/stolen are terminal  
**Effort:** Low  
**Suite:** Playwright

```typescript
test('lost status is terminal and cannot be changed', async ({ client, seededAccount }) => {
  // Create new account to test
  const acc = await createCardholder();
  
  // Set to lost (via modify status endpoint, if exists)
  const lost = await client.modifyAccountStatus(acc.accountId, 'lost');
  expect([200, 201]).toContain(lost.status());
  
  // Verify it's lost
  const check = await client.getAccount(acc.accountId);
  expect((await check.json()).status_code).toBe('lost');
  
  // Attempt to change from lost → any other status
  const tryChange = await client.modifyAccountStatus(acc.accountId, 'active');
  expect([400, 409, 422].includes(tryChange.status())).toBe(true);
  
  // Verify still lost
  const checkAgain = await client.getAccount(acc.accountId);
  expect((await checkAgain.json()).status_code).toBe('lost');
});

test('stolen status is terminal', async ({ client, seededAccount }) => {
  // Similar to lost test
});
```

---

## TIER 2 TESTS (High Value, 2-3 days each)

### 2.1: Boundary Value Tests for Value Loads
**Risk:** Medium — Edge cases hidden in boundaries  
**Effort:** Medium  
**Suite:** Newman (better for parameter variation)

```
Create Value Load Boundary Tests:

amount field:
  ✓ 0.01 (minimum, likely)
  ✓ 0 (is zero load valid?)
  ✓ -1 (negative, must reject)
  ✓ 999_999_999 (very large)
  ✓ 0.001 (sub-penny precision)
  ✓ 100.999 (3 decimals, truncate or error?)

external_tag field:
  ✓ "a" * 255 (max length boundary)
  ✓ "a" * 256 (over limit)
  ✓ "" (empty, if optional)
  ✓ "tag with spaces"
  ✓ "tag\nnewline"

idempotency_key field:
  ✓ First call with key K
  ✓ Replay with same K
  ✓ Replay with same K, different amount (conflict?)
  ✓ Replay after 24h (stale key?)
```

**Implementation:** Create Postman folder with data file (CSV) iterating through values.

---

### 2.2: Boundary Value Tests for Cardholders
**Risk:** Medium — Input validation often overlooked  
**Effort:** Medium  
**Suite:** Newman

```
Create Cardholder Boundary Tests:

email field:
  ✓ "a@b.co" (minimal)
  ✓ "user@example.com" (standard)
  ✓ "a" * 240 + "@example.com" (near limit)
  ✓ "a" * 250 + "@example.com" (over 255)
  ✓ "user@example.com " (trailing space, trimmed?)
  ✓ "user@example.com" (case variation, normalized?)
  ✓ "user@example.com" (duplicate, if not unique per program)

phone field:
  ✓ "1231231234" (10-digit)
  ✓ "+1-555-0100" (with formatting)
  ✓ "123" (too short)
  ✓ "" (empty, if optional)

postal_code field:
  ✓ "84121" (US 5-digit)
  ✓ "84121-1234" (US 9-digit)
  ✓ "A1A 1A1" (Canada)
  ✓ "A1A1A1" (Canada no space, normalized?)
  ✓ "" (empty, if required)
  ✓ "X" (single char)

country field (ISO numeric):
  ✓ "840" (US)
  ✓ "124" (Canada)
  ✓ "999" (invalid code)

state field (2-letter):
  ✓ "UT" (valid)
  ✓ "ut" (lowercase, normalized?)
  ✓ "Utah" (full name, should reject)
  ✓ "ZZ" (invalid)
```

---

### 2.3: Pagination Edge Cases
**Risk:** Low — Common API defect  
**Effort:** Low  
**Suite:** Playwright or Newman

```typescript
test('[boundary] list cardholders with limit=0', async ({ client }) => {
  const res = await client.listCardholders({ limit: 0 });
  // Expected: 400 (invalid) or 200 with empty data
  expect([200, 400]).toContain(res.status());
});

test('[boundary] list cardholders with limit=-1', async ({ client }) => {
  const res = await client.listCardholders({ limit: -1 });
  expect([200, 400]).toContain(res.status());
});

test('[boundary] list cardholders with offset > total', async ({ client }) => {
  const res = await client.listCardholders({ offset: 999999 });
  expect(res.status()).toBe(200);
  const body = BerkeleyClient.unwrap(await res.json());
  expect((body.data || body).length).toBe(0);
});

test('pagination returns consistent subset per page', async ({ client }) => {
  const p1 = await client.listCardholders({ limit: 5, offset: 0 });
  const p2 = await client.listCardholders({ limit: 5, offset: 5 });
  
  const data1 = BerkeleyClient.unwrap(await p1.json()).data;
  const data2 = BerkeleyClient.unwrap(await p2.json()).data;
  
  // No overlap between pages
  const ids1 = data1.map(ch => ch.id);
  const ids2 = data2.map(ch => ch.id);
  const overlap = ids1.filter(id => ids2.includes(id));
  expect(overlap.length).toBe(0);
});
```

---

### 2.4: Processor Reference UUID Validation
**Risk:** Low — Format validation  
**Effort:** Low  
**Suite:** Playwright

```typescript
test('value load processor_reference is valid UUID format', async ({ client, seededAccount }) => {
  const res = await client.createValueLoad({
    account_id: seededAccount.accountId,
    amount: 100,
    external_tag: uniqueTag()
  });
  
  const load = BerkeleyClient.unwrap<ValueLoad>(await res.json());
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  expect(load.processor_reference).toMatch(uuidRegex);
});
```

---

### 2.5: Value Load Filtering by program_id and external_tag
**Risk:** Low — Filtering logic  
**Effort:** Low  
**Suite:** Playwright

```typescript
test('list value loads filtered by external_tag', async ({ client, seededAccount }) => {
  const tag1 = uniqueTag();
  const tag2 = uniqueTag();
  
  await client.createValueLoad({
    account_id: seededAccount.accountId,
    amount: 100,
    external_tag: tag1
  });
  
  await client.createValueLoad({
    account_id: seededAccount.accountId,
    amount: 50,
    external_tag: tag2
  });
  
  const res = await client.listValueLoads({ external_tag: tag1 });
  const body = BerkeleyClient.unwrap(await res.json());
  
  expect(body.data.every(load => load.external_tag === tag1)).toBe(true);
  expect(body.data.length).toBe(1);
});

test('list value loads filtered by program_id', async ({ client }) => {
  const res = await client.listValueLoads({ program_id: config.programId });
  const body = BerkeleyClient.unwrap(await res.json());
  
  expect(body.data.every(load => load.program_id === config.programId)).toBe(true);
});
```

---

## TIER 3 TESTS (Nice-to-Have, Lower Risk)

### 3.1: Type Coercion & Data Format Validation
**Risk:** Low — Catches malformed responses  
**Effort:** Medium  
**Suite:** Playwright

```typescript
test('balance fields are valid decimal strings', async ({ client, seededAccount }) => {
  const res = await client.getAccountBalance(seededAccount.accountId);
  const balance = BerkeleyClient.unwrap<AccountBalance>(await res.json());
  
  // Each field must be decimal string
  for (const field of ['settled_balance', 'available_balance', 'balance']) {
    expect(typeof balance[field]).toBe('string');
    expect(balance[field]).toMatch(/^-?\d+(\.\d{1,2})?$/); // pennies max
    
    // Must be parseable
    const num = parseFloat(balance[field]);
    expect(isFinite(num)).toBe(true);
  }
});

test('cardholder IDs are positive integers', async ({ client }) => {
  const res = await client.listCardholders({ limit: 1 });
  const body = BerkeleyClient.unwrap(await res.json());
  
  for (const ch of body.data) {
    expect(typeof ch.id).toBe('number');
    expect(ch.id).toBeGreaterThan(0);
    expect(ch.id % 1).toBe(0); // integer
  }
});

test('timestamps are ISO 8601 format', async ({ client, seededAccount }) => {
  const res = await client.getCardholder(seededAccount.cardholderId);
  const ch = BerkeleyClient.unwrap(await res.json());
  
  expect(ch.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  expect(new Date(ch.created_at).toString()).not.toBe('Invalid Date');
});
```

---

### 3.2: Processor Reference Consistency
**Risk:** Low — Integration point  
**Effort:** Low  
**Suite:** Playwright

```typescript
test('processor reference resolves consistently', async ({ client, seededAccount }) => {
  const ref = seededAccount.processorReference;
  
  // Resolve 3 times
  const results = [];
  for (let i = 0; i < 3; i++) {
    const res = await client.getAccountByProcessorReference(ref);
    const acc = BerkeleyClient.unwrap(await res.json());
    results.push(acc.id);
  }
  
  // All must resolve to same account
  expect(results[0]).toBe(results[1]);
  expect(results[1]).toBe(results[2]);
});
```

---

### 3.3: Concurrent Load Operations
**Risk:** High (if supported) — Race conditions  
**Effort:** Medium  
**Suite:** Playwright

```typescript
test('[concurrent] 5 simultaneous loads to same account', async ({ client, seededAccount }) => {
  const before = await getBalance(seededAccount.accountId);
  const amount = 20;
  const count = 5;
  
  const results = await Promise.all(
    Array(count).fill(null).map(() =>
      client.createValueLoad({
        account_id: seededAccount.accountId,
        amount,
        external_tag: uniqueTag()
      })
    )
  );
  
  // All must succeed
  expect(results.every(r => r.status() === 201)).toBe(true);
  
  // Balance must be exact
  const after = await getBalance(seededAccount.accountId);
  expect(after - before).toBe(amount * count);
});
```

---

### 3.4: Cardholder Update Partial Field Behavior
**Risk:** Low — Update semantics  
**Effort:** Low  
**Suite:** Playwright

```typescript
test('cardholder update preserves omitted fields', async ({ client }) => {
  const ch = await createCardholder();
  const original = await client.getCardholder(ch.id);
  const origData = BerkeleyClient.unwrap(await original.json());
  
  // Update only first_name
  await client.updateCardholder(ch.id, { first_name: 'Jane' });
  
  // Verify other fields unchanged
  const updated = await client.getCardholder(ch.id);
  const updateData = BerkeleyClient.unwrap(await updated.json());
  
  expect(updateData.last_name).toBe(origData.last_name);
  expect(updateData.email).toBe(origData.email);
  expect(updateData.first_name).toBe('Jane');
});
```

---

## TIER 4: DEFERRED (Requires API Clarification)

These tests require Berkeley to clarify behavior first:

- [ ] Address update cooldown enforcement
- [ ] Cardholder email immutability
- [ ] Idempotency key retention period & format constraints
- [ ] Status transition rules (which → which allowed?)
- [ ] Error response format (structure, codes, messages)
- [ ] Unload endpoint specification
- [ ] Negative balance enforcement policy

---

## IMPLEMENTATION ROADMAP

### Week 1: Tier 1 (Banking Critical)
```
Day 1-2: Negative balance handling
Day 3:   Multi-load conservation
Day 4:   Terminal status (lost/stolen)
Day 5:   Buffer / refinement
```

### Week 2: Tier 2 (High Value)
```
Day 1-2: Boundary value tests (Value Loads + Cardholders)
Day 3:   Pagination edge cases
Day 4:   Processor reference validation + filtering
Day 5:   Buffer / refinement
```

### Week 3: Tier 3 (Polish)
```
Day 1-2: Type validation + format checks
Day 3:   Consistency tests (processor ref, partial updates)
Day 4:   Concurrent operations
Day 5:   Documentation + integration
```

---

## TESTING STRATEGY BY SUITE

### Playwright (Keep For These)
- Multi-load conservation (state chaining)
- Negative balance scenarios (requires endpoint calls)
- Terminal status verification (state-dependent)
- Concurrent operations (parallel fixtures)
- Processor reference consistency (multiple calls)
- Partial update behavior (state verification)

**Add:** Parametrized boundary test helpers to reduce code duplication

### Newman (Add For These)
- Boundary value variation (100 email/phone/postal combos)
- Pagination edge cases (limit=0, offset > total)
- Error response validation (status codes per scenario)
- Negative test matrix (10 ways to fail, 1 success)
- Filter + pagination combinations

**Add:** Pre/post scripts for decimal precision validation, UUID format checks

---

## Success Criteria

✅ All Tier 1 tests passing  
✅ Tier 2 coverage > 80% of API surface  
✅ No boundary value surprises  
✅ Concurrent ops don't race  
✅ Negative balances handled correctly  
✅ Terminal states enforced  
✅ Documentation updated with findings

