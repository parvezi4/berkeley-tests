# Documentation Index

## Strategy & Planning
- **`Berkeley_QA_Test_Strategy.docx`** — Full QA strategy: philosophy, layered test model, test types, risk-weighted coverage, tooling, black-box techniques
- **`Berkeley_QA_Strategy_Deck.pptx`** — Presentation with speaker notes, includes load & performance testing section

## Execution Results
- **[`FINAL_EXECUTION_REPORT.md`](./FINAL_EXECUTION_REPORT.md)** — Complete Tier 1-3 test execution results (90/98 passing, 0 failures)
  - Test coverage breakdown by tier
  - Root causes of blocked tests
  - Recommendations for Berkeley engineering team

## API Findings
- **[`API_BEHAVIOUR_FINDINGS.md`](./API_BEHAVIOUR_FINDINGS.md)** — Confirmed API behaviors and validated assumptions
  - 17 API assumptions tested
  - Confirmed findings (A5, A7 REFUTED, A17 REFUTED, etc.)
  - Test exploration results from EXPLORE-1 through EXPLORE-4
  - OpenAPI specification discrepancies documented

## Load Testing
- **[`LOAD_TESTING.md`](./LOAD_TESTING.md)** — Comprehensive load testing guide and strategies
  - Quick smoke test (30s, default)
  - Full load test (4+ minutes)
  - Incremental load test (5-10 minutes, finds rate-limit threshold)
  - Report interpretation and best practices

## OpenAPI Specification
- **`berkeley-card-issuing-openapi.yaml`** — API specification (see findings for discrepancies between spec and actual API behavior)

---

**Notes:**
- Tests are organized in `/tests` by resource domain: `programs/`, `cardholders/`, `accounts/`, `value-loads/`, `integration/`
- See [FINAL_EXECUTION_REPORT.md](./FINAL_EXECUTION_REPORT.md) for next steps and questions for Berkeley team
