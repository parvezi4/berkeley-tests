import { test, expect } from '../fixtures/api-fixtures.js';
import { uniqueTag } from '../support/utils/test-data.js';

/**
 * VALUE LOAD EXTERNAL TAG
 *
 * OpenAPI Spec Finding:
 *   - external_tag: REQUIRED field (not optional)
 *   - Used for: User-defined external reference tag
 *   - Uniqueness: NOT documented in spec
 *
 * Assumptions in these tests:
 *   - Missing external_tag: should fail (required field)
 *   - Empty string: may fail (empty required field)
 *   - Duplicates: behavior unknown - to be discovered
 *   - Long tags: behavior unknown - to be discovered
 *
 * Note: This is a quick exploration to establish baseline behavior.
 */
test.describe('Value Load External Tag [OPENAPI-SPEC]', () => {
  test('[discovery] load without external_tag behavior (required per OpenAPI)', async ({
    client,
    seededAccount
  }) => {
    // OpenAPI specifies external_tag as required
    // Discovery: is it truly required?
    const res = await client.createValueLoad({
      account_id: seededAccount.accountId,
      amount: 1000,
      external_tag: undefined as never // Omitted
    });

    test.info().annotations.push({
      type: 'note',
      description: `Value load without external_tag: HTTP ${res.status()}`
    });

    if (res.status() === 201) {
      test.info().annotations.push({
        type: 'warning',
        description: '📝 FINDING: external_tag is NOT required (OpenAPI says required). API is lenient.'
      });
    }
  });

  test('[discovery] load with empty external_tag behavior', async ({ client, seededAccount }) => {
    // External tag is required, but is empty string valid?
    // Assumption: empty string fails (not a meaningful tag)
    const res = await client.createValueLoad({
      account_id: seededAccount.accountId,
      amount: 1000,
      external_tag: '' // Empty string
    });

    test.info().annotations.push({
      type: 'note',
      description: `Empty external_tag status: HTTP ${res.status()}`
    });

    if (res.status() === 400 || res.status() === 422) {
      test.info().annotations.push({
        type: 'note',
        description: 'Empty external_tag rejected as expected'
      });
    } else if (res.status() === 201) {
      test.info().annotations.push({
        type: 'warning',
        description: 'Empty external_tag accepted (lenient validation)'
      });
    }
  });

  test('[discovery] duplicate external_tag on separate loads', async ({ client, seededAccount }) => {
    // Question: Is external_tag enforced as unique per load, or duplicates allowed?
    // Assumption: duplicates are allowed (tag is just a label, not a key)
    const sharedTag = uniqueTag();

    // First load with tag
    const res1 = await client.createValueLoad({
      account_id: seededAccount.accountId,
      amount: 1000,
      external_tag: sharedTag
    });
    expect(res1.status()).toBe(201);

    // Second load with same tag
    const res2 = await client.createValueLoad({
      account_id: seededAccount.accountId,
      amount: 500,
      external_tag: sharedTag // Duplicate tag
    });

    test.info().annotations.push({
      type: 'note',
      description: `Duplicate external_tag status: HTTP ${res2.status()}`
    });

    if (res2.status() === 201) {
      test.info().annotations.push({
        type: 'note',
        description: 'Duplicate external_tag allowed. Tag is not enforced as unique.'
      });
    } else if ([400, 409, 422].includes(res2.status())) {
      test.info().annotations.push({
        type: 'note',
        description: 'Duplicate external_tag rejected. Tag enforced as unique per load.'
      });
    }
  });

  test('[discovery] external_tag with special characters', async ({ client, seededAccount }) => {
    // Assumption: Special characters are allowed in tags
    const specialTag = 'load-2026-06-17_test@unique#1';

    const res = await client.createValueLoad({
      account_id: seededAccount.accountId,
      amount: 1000,
      external_tag: specialTag
    });

    test.info().annotations.push({
      type: 'note',
      description: `Special characters in external_tag status: HTTP ${res.status()}`
    });

    if (res.status() === 201) {
      test.info().annotations.push({
        type: 'note',
        description: 'Special characters (@, #, etc.) accepted in external_tag'
      });
    } else {
      test.info().annotations.push({
        type: 'warning',
        description: 'Special characters rejected. Tag may have format constraints.'
      });
    }
  });

  test('[discovery] external_tag with very long string', async ({ client, seededAccount }) => {
    // Assumption: Long tags work (no stated maxLength in OpenAPI)
    // 255 chars is a common limit; test at and beyond
    const longTag = 'a'.repeat(255);

    const res = await client.createValueLoad({
      account_id: seededAccount.accountId,
      amount: 1000,
      external_tag: longTag
    });

    test.info().annotations.push({
      type: 'note',
      description: `255-character external_tag status: HTTP ${res.status()}`
    });

    if (res.status() > 400) {
      test.info().annotations.push({
        type: 'note',
        description: 'Long external_tag rejected. Max length may be enforced.'
      });
    }
  });
});
