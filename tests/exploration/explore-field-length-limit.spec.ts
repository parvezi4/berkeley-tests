import { test } from '@playwright/test';
import { BerkeleyClient } from '../support/api/berkeley-client.js';
import { newCardholder } from '../support/utils/test-data.js';

/**
 * PART 5: Binary search for exact first_name hard limit.
 *
 * EXPLORE-4 showed:
 * - 30 chars: ✓ accepted
 * - 51 chars: ✓ accepted
 * - 100 chars: ✗ rejected
 *
 * This test narrows down the exact threshold between 51 and 100.
 * Once confirmed, update HARD_LIMIT in tests/tier2/format-validation.spec.ts.
 */
test('binary search: find exact first_name hard limit', async ({ request }) => {
  const client = new BerkeleyClient(request);
  let low = 52;
  let high = 99;
  let lastAccepted = 51;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const name = 'X'.repeat(mid);
    const res = await client.createCardholder(newCardholder({ first_name: name }));
    console.log(`[FIELD-LENGTH] length=${mid} → HTTP ${res.status()}`);

    if (res.status() === 201) {
      lastAccepted = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  console.log(
    `[FIELD-LENGTH] ✅ Hard limit: accepts up to ${lastAccepted}, rejects at ${lastAccepted + 1}`,
  );
  test.info().annotations.push({
    type: 'finding',
    description: `first_name hard limit: ${lastAccepted} chars accepted, ${lastAccepted + 1} rejected`,
  });
});
