# Postman Collection

An importable Postman collection covering all four Card Issuing resource groups, plus a matching environment. These tests are complementary to the Playwright suite and can be run standalone or in CI.

## Files

- `Berkeley-testing.postman_collection.json` — the collection (Cardholders, Accounts & Cards, Value Loads, Programs), with per-request test scripts and variable chaining.
- `Berkeley-Staging.postman_environment.json` — environment with `base_url`, `program_id`, and chained-variable placeholders. **`api_key` is intentionally blank** — set it locally after import; do not commit a real key.

## Quickstart: Import into Postman Desktop

1. Postman → **Import** → drag both `.json` files.
2. Select the **Berkeley-Staging** environment from the dropdown (top-right).
3. Set `api_key` to your staging key in the environment editor (stored as a secret-type variable; not synced to workspace).
4. Click **Send** on any request, or use **Run** to execute the collection with variable chaining.

## Run order (for a full chained run)

1. **Cardholders → Create Cardholder** seeds `cardholder_id` and `processor_reference`.
2. **Accounts → Get Account By Processor Reference** resolves `account_id`; **Get Account Details** sets `last_four_digits`.
3. **Value Loads** use `account_id`; **Create Value Load** seeds `value_load_id`.
4. **Programs** is independent and can run any time.

## Headless Testing: Newman (CLI)

### Install

Newman is bundled as a dev dependency in this project:

```bash
npm install
```

### Local run

```bash
npm run newman:local
```

This requires `BP_API_KEY` to be set in your shell environment:

```bash
export BP_API_KEY=your-staging-key
npm run newman:local
```

### CI (GitHub Actions)

The collection runs automatically in CI on every push/PR:

```bash
npm run newman
```

The CI workflow provides the API key via `secrets.BP_API_KEY`. See [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) for details.

### Options

Both `npm run newman` and `npm run newman:local` accept Newman CLI flags:

```bash
npm run newman -- --timeout 10000       # Set timeout to 10s per request
npm run newman -- --reporters cli,json  # Output as JSON in addition to CLI
npm run newman -- --reporters json --export results.json  # Save JSON report
```

For full Newman documentation, see [postman/newman](https://learning.postman.com/docs/collections/using-newman-cli/command-line-with-newman/).

## Test Results

Newman test results are saved to `test-results/newman/`:
- **Location:** `test-results/newman/results.json` (or `.xml` in CI)
- **Gitignore:** Result files are gitignored to avoid committing large test artifacts
- **Directory:** Preserved with `.gitkeep` to ensure the directory exists after cloning

Results are local-only and safe to delete between test runs. See [`docs/TEST_REPORTING.md`](../docs/TEST_REPORTING.md) for details on all test result formats and locations.
