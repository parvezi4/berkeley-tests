import { test, expect } from '../../src/fixtures/api-fixtures.js';
import { BerkeleyClient } from '../../src/api/berkeley-client.js';
import { config } from '../../src/utils/config.js';
import type { Program } from '../../src/api/types.js';

test.describe('Programs', () => {
  test('Get Program returns core fields and matches the requested id @smoke', async ({ client }) => {
    const res = await client.getProgram();
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/json');

    const program = BerkeleyClient.unwrap<Program>(await res.json());
    expect(program).toMatchObject({
      id: expect.anything(),
      name: expect.any(String),
      program_type: expect.any(String),
      status: expect.any(String),
      currency: expect.any(String),
    });
    expect(String(program.id)).toBe(String(config.programId));
    expect(program.status).toBe('active');
  });

  test('Get Program Balance returns a balance payload', async ({ client }) => {
    const res = await client.getProgramBalance();
    expect(res.status()).toBe(200);
    const balance = BerkeleyClient.unwrap<Record<string, unknown>>(await res.json());
    expect(typeof balance).toBe('object');
  });

  test('[negative] unknown program id is rejected with a 4xx', async ({ client }) => {
    const res = await client.getProgram(999_999_999);
    expect(res.status(), 'a non-existent program should not return 2xx').toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test('[security] an invalid bearer token is rejected with 401/403', async ({ client }) => {
    const res = await client.getProgramWithToken('invalid-token-0000');
    expect([401, 403]).toContain(res.status());
  });
});
