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

## OpenAPI Specification
- **`berkeley-card-issuing-openapi.yaml`** — API specification (see findings for discrepancies between spec and actual API behavior)

---

**Notes:**
- Tests are organized in `/tests` by resource domain: `programs/`, `cardholders/`, `accounts/`, `value-loads/`, `exploration/`, `integration/`
- See [FINAL_EXECUTION_REPORT.md](./FINAL_EXECUTION_REPORT.md) for next steps and questions for Berkeley team
