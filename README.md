# Berkeley Payments — Card Issuing API Test Suite

A black-box API test suite for the Berkeley Payments **Card Issuing** APIs, built with **Playwright + TypeScript**. It exercises four resource groups — Cardholders, Accounts & Cards, Value Loads, and Programs — on the staging environment.

This repository accompanies a QA test strategy (see [`docs/`](docs/)) and a Postman collection (see [`postman/`](postman/)). Together they demonstrate a layered approach to testing a third-party payments platform where we own the integration but not the source.

> **Design note.** As an API consumer we test the system through its observable contract. The suite is organised around business flows and financial risk — deepest on value movement, where a defect is most costly — rather than around an inventory of endpoints.

## What's inside

```
.
├── tests/
│   ├── fixtures/       # Playwright fixtures (client, seeded account)
│   │   └── api-fixtures.ts
│   ├── support/        # Test infrastructure & helpers
│   │   ├── api/        # Typed BerkeleyClient + response/request types
│   │   └── utils/      # Config loader + test-data factory
│   ├── cardholders/    # CRUD, validation, negative paths
│   ├── accounts/       # Resolution, balance, status transitions
│   ├── value-loads/    # Loads, money-conservation, idempotency
│   └── programs/       # Reads, auth isolation
├── load-tests/         # Artillery load testing (quick, full, incremental modes)
│   ├── artillery.yml   # Full load test (4+ min, 15 req/s)
│   ├── artillery-quick.yml # Smoke test (30s, 2 req/s)
│   ├── run-and-report.sh   # Test runner with HTML report generation
│   └── incremental-test.sh # Find rate-limit threshold
├── postman/            # Postman collection + environment + Newman runner
│   ├── scripts/
│   │   └── run-newman.js   # Newman test runner for Postman collection
│   └── Berkeley-testing.postman_collection.json
├── docs/               # Testing guides, QA strategy, and API reference
│   ├── LOAD_TESTING.md # Complete load testing guide
│   ├── API_BEHAVIOUR_FINDINGS.md # Confirmed behaviors vs. docs discrepancies
│   ├── FINAL_EXECUTION_REPORT.md # Test execution results and findings
│   ├── berkeley-card-issuing-openapi.yaml # API specification (AI-generated)
│   └── *.docx, *.pptx  # QA strategy documents
├── SECURITY.md         # Credentials and compliance
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

- **Typed client.** [`tests/support/api/berkeley-client.ts`](tests/support/api/berkeley-client.ts) wraps Playwright's `request` context, attaches auth, builds URLs from the stable `card_issuing` path, and normalises the inconsistent `data` envelope. It never throws on non-2xx, so negative-path tests can assert on status codes.
- **Re-runnable data.** [`tests/support/utils/test-data.ts`](tests/support/utils/test-data.ts) generates timestamped emails / tags / idempotency keys, so the suite can run repeatedly with no manual cleanup.
- **Fresh account fixture.** [`tests/fixtures/fresh-account.ts`](tests/fixtures/fresh-account.ts) creates isolated test accounts with retry logic, essential for tests that modify account state (status changes, terminal states).
- **Seeded fixture.** `seededAccount` (in [`tests/fixtures/api-fixtures.ts`](tests/fixtures/api-fixtures.ts)) chains *create cardholder → resolve account → read account*, mirroring a real consumer integration and giving dependent tests a ready account.
- **Conditional endpoints** (status changes that depend on card state or program config) assert *no 5xx* and annotate the run rather than hard-failing on a precondition the staging program may not meet.

## CI & Testing Strategy

### Functional Tests (GitHub Actions - Automated)

`.github/workflows/ci.yml` runs **functional tests** on every push/PR to `main` and nightly:
- **Playwright** — Full API test suite with state dependencies
- **Newman** — Postman collection tests  
- **Type-check** — TypeScript compilation

These catch regressions and API contract changes. Reports are generated and stored as artifacts.

**Setup:** Set `BP_API_KEY` as a repository **secret**; `BASE_URL` and `PROGRAM_ID` as **variables**.

**Details:** See [`docs/CI_OPTIMIZATION.md`](docs/CI_OPTIMIZATION.md) and [`docs/TEST_REPORTING.md`](docs/TEST_REPORTING.md)

### Load Tests (Local Only - Manual)

**Artillery load tests** run **locally only** and are **not** automated in CI because:
- Load tests require coordinated timing and explicit provider sign-off
- Resource-intensive; not suitable for CI runners
- Results need careful interpretation and capacity planning
- Rate limiting is a feature, not a failure

Run them on-demand via:
```bash
./load-tests/run-and-report.sh --quick       # 30s smoke test
./load-tests/run-and-report.sh               # 4+ min full test
./load-tests/incremental-test.sh             # Find rate-limit threshold
```

**Details:** See [`docs/LOAD_TESTING.md`](docs/LOAD_TESTING.md)

## Load & Performance Testing

Protocol-level load testing is available via **Artillery**, a lightweight HTTP engine that complements the functional Playwright tests. Load tests measure throughput, latency, and stability without browser overhead.

**Quick start:**
```bash
# Quick smoke test (30 seconds, minimal load)
./load-tests/run-and-report.sh --quick

# Full load test (4+ minutes)
./load-tests/run-and-report.sh

# Find rate-limit threshold (incremental, 5-10 minutes)
./load-tests/incremental-test.sh
```

**Key points:**
- Load tests run **locally only** (not in CI) and must have **staging provider sign-off**
- Three test modes: quick (smoke test), full (comprehensive), incremental (find limits)
- Tests include realistic flows: cardholder creation, account resolution, value loads, negative paths
- Reports: Beautiful HTML dashboards + JSON for CI/CD integration
- Auto-detects rate limiting and shows when it kicked in

See [`docs/LOAD_TESTING.md`](docs/LOAD_TESTING.md) for the complete guide, metrics interpretation, and best practices.

## Documentation

### Getting Started
- **[README.md](README.md)** — This file; quick start and overview

### Testing Guides
- **[docs/LOAD_TESTING.md](docs/LOAD_TESTING.md)** — Comprehensive load testing guide
  - Three test modes (quick, full, incremental)
  - Rate-limit detection and capacity planning
  - Interpreting results and performance baselines
  
- **[docs/TEST_REPORTING.md](docs/TEST_REPORTING.md)** — Test reporting & GitHub integration
  - Playwright HTML/JUnit XML reports
  - Newman/Postman test reports
  - GitHub Test Results tab integration
  - Consuming reports locally or programmatically

- **[docs/CI_OPTIMIZATION.md](docs/CI_OPTIMIZATION.md)** — CI/CD pipeline optimization
  - Caching strategies
  - Job parallelization
  - Performance baselines and monitoring
  - Troubleshooting CI failures

### Security & Best Practices
- **[SECURITY.md](SECURITY.md)** — Credentials, scope, and compliance
  - Secrets handling (no credentials committed)
  - Staging-only scope
  - Load testing authorization requirements

### QA Strategy & Architecture
- **[docs/](docs/)** — Test strategy documentation
  - `Berkeley_QA_Test_Strategy.docx` — Full QA philosophy and approach
  - `Berkeley_QA_Strategy_Deck.pptx` — Presentation with speaker notes
  - **[docs/API_BEHAVIOUR_FINDINGS.md](docs/API_BEHAVIOUR_FINDINGS.md)** — Confirmed API behaviors vs. documentation
  - **[docs/FINAL_EXECUTION_REPORT.md](docs/FINAL_EXECUTION_REPORT.md)** — Test execution results and findings

### API Specification
- **[docs/berkeley-card-issuing-openapi.yaml](docs/berkeley-card-issuing-openapi.yaml)** — OpenAPI specification
  
  > ⚠️ **Disclaimer:** This OpenAPI document was **generated from the official Berkeley Payments API documentation by Claude.ai** and is **not** an official deliverable from the Berkeley engineering team. It is provided for reference and testing purposes. Refer to the official API documentation for authoritative specifications.

### Postman Collection
- **[postman/README.md](postman/README.md)** — Importable collection and environment
  - Integration with Newman for CI
  - Manual testing in Postman

## Scope & credentials

This suite targets **staging only**. No secrets are committed — `.env` is git-ignored and `.env.example` carries placeholders. See [`SECURITY.md`](SECURITY.md).
