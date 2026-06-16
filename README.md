# Berkeley Payments — Card Issuing API Test Suite

A black-box API test suite for the Berkeley Payments **Card Issuing** APIs, built with **Playwright + TypeScript**. It exercises four resource groups — Cardholders, Accounts & Cards, Value Loads, and Programs — on the staging environment.

This repository accompanies a QA test strategy (see [`docs/`](docs/)) and a Postman collection (see [`postman/`](postman/)). Together they demonstrate a layered approach to testing a third-party payments platform where we own the integration but not the source.

> **Design note.** As an API consumer we test the system through its observable contract. The suite is organised around business flows and financial risk — deepest on value movement, where a defect is most costly — rather than around an inventory of endpoints.

## What's inside

```
.
├── src/
│   ├── api/            # Typed BerkeleyClient + response/request types
│   ├── fixtures/       # Playwright fixtures (client, seeded account)
│   └── utils/          # Config loader + test-data factory
├── tests/
│   ├── cardholders/    # CRUD, validation, negative paths
│   ├── accounts/       # Resolution, balance, status transitions
│   ├── value-loads/    # Loads, money-conservation, idempotency
│   └── programs/       # Reads, auth isolation
├── postman/            # Importable collection + environment
├── docs/               # Strategy document and presentation
└── .github/workflows/  # CI: type-check + tests on push/PR + nightly
```

## Quick start

```bash
# 1. Install
npm install
npx playwright install --with-deps   # only needed once per machine

# 2. Configure
cp .env.example .env
#   edit .env and set BP_API_KEY to your staging key

# 3. Run
npm test                 # full Playwright suite
npm run test:smoke       # @smoke-tagged fast subset
npm run newman:local     # Postman collection tests (verbose)
npm run newman           # Postman collection tests (standard)
npm run report           # open the Playwright HTML report
```

### Running locally

Both Playwright and Newman tests require the `BP_API_KEY` environment variable set via `.env`:

```bash
export BP_API_KEY=your-staging-key
npm test           # Run Playwright tests
npm run newman     # Run Newman/Postman tests
```

### GitHub Actions setup

To run tests in CI, configure these GitHub repository settings:

1. **Secrets** (Settings → Secrets and Variables → Actions):
   - `BP_API_KEY` — your staging API key (required)

2. **Variables** (Settings → Secrets and Variables → Actions) — optional:
   - `BASE_URL` — defaults to `https://api.staging.pungle.co`
   - `PROGRAM_ID` — defaults to `137`

Both **Playwright** and **Newman/Postman** tests run automatically on:
- Every push to `main`
- Every pull request to `main`
- Nightly scheduled run (6 AM UTC) to catch provider-side drift

## Highlighted tests

| Test | Why it matters |
|------|----------------|
| **Money conservation** (`value-loads`) | A load of *N* must increase available balance by exactly *N*. The single most important invariant in a payments system — proven entirely from observable balances. |
| **Idempotency replay** (`value-loads`) | Replaying an idempotency key must not move the balance twice. Critical for safe retry-after-timeout behaviour. |
| **State transitions** (`accounts`) | Suspend → unsuspend is reversible; this is where fraud-response correctness lives. |
| **Auth isolation** (`programs`) | An invalid token is rejected with 401/403 — the security baseline. |

## Test design

- **Typed client.** `src/api/berkeley-client.ts` wraps Playwright's `request` context, attaches auth, builds URLs from the stable `card_issuing` path, and normalises the inconsistent `data` envelope. It never throws on non-2xx, so negative-path tests can assert on status codes.
- **Re-runnable data.** `src/utils/test-data.ts` generates timestamped emails / tags / idempotency keys, so the suite can run repeatedly with no manual cleanup.
- **Seeded fixture.** `seededAccount` chains *create cardholder → resolve account → read account*, mirroring a real consumer integration and giving dependent tests a ready account.
- **Conditional endpoints** (status changes that depend on card state or program config) assert *no 5xx* and annotate the run rather than hard-failing on a precondition the staging program may not meet.

## CI

`.github/workflows/ci.yml` runs a type-check and the full suite on every push and pull request to `main`, plus a nightly scheduled run to catch provider-side drift in staging. Set `BP_API_KEY` as a repository **secret**; `BASE_URL` and `PROGRAM_ID` can be repository **variables**.

## A note on load & performance testing

Performance work is intentionally **not** wired into this functional suite. Black-box load testing of a payments provider (latency percentiles, throughput ceiling, rate-limit behaviour) is valuable but must only ever be run against staging **with the provider's explicit sign-off**, since load generators can trip fraud and abuse controls. Recommended tooling and approach are covered in the strategy document.

## Scope & credentials

This suite targets **staging only**. No secrets are committed — `.env` is git-ignored and `.env.example` carries placeholders. See [`SECURITY.md`](SECURITY.md).
