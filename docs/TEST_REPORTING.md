# Test Reporting & GitHub Integration

This document describes how test reports are generated, stored, and consumed by GitHub Actions for insights and analysis.

All test results are consolidated in `test-results/` organized by tool for consistency and easier navigation.

## Report Structure

```
test-results/                   (Machine-readable results for CI/CD)
├── playwright/
│   ├── results.json            (Complete test execution data)
│   └── junit.xml               (GitHub Test Results integration)
├── newman/
│   ├── results.json            (Local execution)
│   └── results.xml             (CI integration)
└── artillery/
    ├── quick_TIMESTAMP.json/.html
    ├── standard_TIMESTAMP.json/.html
    └── incremental_TIMESTAMP.json/.html

reports/                        (Browser-viewable HTML reports)
└── playwright/
    └── html/
        ├── index.html          (Interactive test dashboard)
        └── ... (supporting files)
```

## Report Types Generated

### 1. **Playwright Test Reports**

**HTML Report:**
- **Format:** Interactive HTML dashboard
- **Location:** `reports/playwright/html/index.html`
- **View locally:** `npm run report` (opens in browser)
- **Contains:** 
  - Test execution timeline
  - Pass/fail breakdown by test suite
  - Detailed error traces and screenshots (if applicable)
  - Request/response details for failed tests
  - Performance metrics per test
- **Note:** Stored separately in `reports/` directory to avoid Playwright output folder conflicts

**JUnit XML Report:**
- **Format:** Machine-readable XML (industry standard)
- **Location:** `test-results/playwright/junit.xml`
- **Used by:** GitHub's test reporter
- **Contains:** Test names, durations, failures, errors

**JSON Report:**
- **Format:** Structured JSON
- **Location:** `test-results/playwright/results.json`
- **Contains:** Complete test execution data for programmatic analysis

### 2. **Newman/Postman Test Reports**

**JSON Report (Local):**
- **Format:** Newman JSON output
- **Location:** `test-results/newman/results.json`
- **Contains:** Collection execution results, request times, assertions

**XML Report (CI):**
- **Format:** JUnit-compatible XML
- **Location:** `test-results/newman/results.xml` (CI only)
- **Used by:** GitHub's test reporter
- **Contains:** Test names, assertions, errors

### 3. **Artillery Load Test Reports**

**JSON Report:**
- **Format:** Artillery native JSON
- **Location:** `test-results/artillery/{quick|standard|incremental}_TIMESTAMP.json`
- **Contains:** Performance metrics, response times, status codes, latency percentiles

**HTML Report:**
- **Format:** Interactive dashboard
- **Location:** `test-results/artillery/{quick|standard|incremental}_TIMESTAMP.html`
- **Contains:** Charts, latency distributions, throughput analysis, rate-limit detection

## GitHub Integration

### Test Results Tab

GitHub's native **Test Results** tab displays:
- ✅ Playwright tests parsed from JUnit XML
- Summary statistics (passed, failed, skipped)
- Timeline of test execution
- Error details for failed tests
- Test durations

**How to access:**
1. Go to your GitHub Actions run
2. Click the **Test Results** tab (appears when JUnit reports are present)
3. Filter by test suite, status, or search by name

### Artifacts Tab

Reports are retained as downloadable artifacts in two bundles:

**Test Results Bundle (`test-results/`)** — Machine-readable results for CI/CD:
- **Playwright** (`test-results/playwright/`):
  - `junit.xml` — Machine-readable results for GitHub Test Results tab
  - `results.json` — Complete execution data for CI/CD analysis
- **Newman** (`test-results/newman/`):
  - `results.json` — Local execution results
  - `results.xml` — CI execution results for GitHub integration
- **Artillery** (`test-results/artillery/`):
  - `{quick|standard|incremental}_TIMESTAMP.json` — Test metrics and performance data

**Reports Bundle (`reports/`)** — Browser-viewable HTML reports:
- **Playwright** (`reports/playwright/html/`):
  - `index.html` — Full interactive test dashboard
  - Supporting files for visualization

**Retention:** 30 days

**How to access:**
1. Go to your GitHub Actions run
2. Click the **Artifacts** section at the bottom
3. Download the artifact bundle you need

### Workflow Summary

Each run shows a summary at the top with:
- Test suite status (Playwright: ✅/❌, Newman: ✅/❌)
- Links to artifact downloads
- Status of each major job

## Consuming Reports Locally

### Download & View HTML Reports

```bash
# Via GitHub CLI
gh run download <RUN_ID> -n playwright-artifacts
gh run download <RUN_ID> -n newman-artifacts

# Or download from GitHub UI:
# 1. Go to Actions → Run → Artifacts
# 2. Download the artifact bundle
# 3. Unzip and open report in browser
```

### Parse JUnit XML Programmatically

Use JUnit XML parsers in your CI/CD tools:

```python
# Python example
import xml.etree.ElementTree as ET

tree = ET.parse('test-results/junit.xml')
root = tree.getroot()

for testcase in root.findall('.//testcase'):
    name = testcase.get('name')
    time = testcase.get('time')
    failure = testcase.find('failure')
    if failure is not None:
        print(f"❌ {name}: {failure.get('message')}")
    else:
        print(f"✅ {name}: {time}s")
```

### Analyze JSON Results

```bash
# Query with jq
jq '.stats | {tests, passed, failed}' test-results/results.json

# Get slowest tests
jq '.tests | sort_by(-.duration) | .[0:5]' test-results/results.json
```

## CI/CD Integration Examples

### Add Custom Status Checks

Create a workflow that consumes the reports:

```yaml
- name: Check test thresholds
  run: |
    FAILED=$(jq '.stats.failed' test-results/results.json)
    if [ "$FAILED" -gt 0 ]; then
      echo "❌ Tests failed"
      exit 1
    fi
```

### Post to Slack

```yaml
- name: Notify Slack
  uses: slackapi/slack-github-action@v1
  with:
    payload: |
      {
        "text": "Test run completed",
        "blocks": [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "Playwright: ${{ needs.playwright.result }}\nNewman: ${{ needs.newman.result }}"
            }
          }
        ]
      }
```

### Dashboard Integration

Use the JSON reports to feed external dashboards:

```bash
# Send to monitoring system
curl -X POST https://monitoring.example.com/api/test-results \
  -H "Content-Type: application/json" \
  -d @test-results/results.json
```

## Report History & Trends

### View Test Trends

GitHub doesn't have built-in trend visualization, but you can:

1. **Export artifact history:**
   ```bash
   # Download multiple run artifacts
   for RUN_ID in $(gh run list --limit 10 --json databaseId); do
     gh run download $RUN_ID -n playwright-artifacts
   done
   ```

2. **Aggregate results:**
   ```bash
   # Combine multiple runs into a trend dataset
   for file in */test-results/results.json; do
     jq '.timestamp = now' "$file"
   done | jq -s 'group_by(.stats.passed)'
   ```

3. **Use third-party tools:**
   - **Allure Reports** — For trend visualization
   - **ReportPortal** — For centralized test analytics
   - **Datadog** — For CI/CD metrics

## What Gets Stored

| Report | Format | Size | Retention | Location |
|--------|--------|------|-----------|----------|
| Playwright HTML | HTML | ~5-10 MB | 30 days | playwright-artifacts |
| JUnit XML | XML | ~100-500 KB | 30 days | playwright-artifacts |
| Results JSON | JSON | ~500 KB | 30 days | playwright-artifacts |
| Newman HTML | HTML | ~2-5 MB | 30 days | newman-artifacts |
| Newman JSON | JSON | ~100-200 KB | 30 days | newman-artifacts |

**Total per run:** ~10-20 MB (compressed: ~2-3 MB)

## Troubleshooting Reports

### No Test Results Tab Appears

**Possible causes:**
- JUnit XML not generated — verify `junit` reporter in playwright.config.ts
- File not at expected path — check `test-results/junit.xml` in artifacts
- Test failed during execution — check run logs

**Fix:**
```bash
# Manually verify JUnit generation
npm run lint  # Type check
npx playwright test  # Run tests
ls test-results/junit.xml  # Verify file exists
```

### Artifacts Not Retained

**Verify retention settings:**
- Playwright artifacts: 30 days (check workflow line `retention-days: 30`)
- Newman artifacts: 30 days

**Adjust if needed:**
- GitHub free tier: artifacts deleted after 90 days minimum
- GitHub Pro/Enterprise: custom retention policies

### Large Artifact Sizes

**Reduce compression:**
```yaml
compression-level: 9  # Maximum compression (slower upload)
```

**Or exclude heavy files:**
```yaml
path: |
  test-results/junit.xml
  test-results/results.json
  # Exclude HTML if needed: # playwright-report/
```

## Future Enhancements

Potential improvements for test reporting:

1. **SARIF Format** — Security/quality scanning
   - Use `@microsoft/sarif-tools` to convert XML to SARIF
   - GitHub will display in "Security" tab

2. **Code Coverage** — With coverage reporting
   - Requires coverage instrumentation
   - Use `nyc` or similar for Playwright

3. **Performance Regression Detection** — Automatic baselines
   - Compare current run against baseline
   - Flag slowdowns automatically

4. **Test Flakiness Tracking** — Historical flake detection
   - Archive results by date
   - Identify consistently flaky tests

5. **Trend Dashboard** — Custom visualization
   - Host static site with trend charts
   - Deploy via GitHub Pages

## Related Documentation

- [Playwright Test Reporter API](https://playwright.dev/docs/test-reporters)
- [GitHub Actions Test Report Support](https://github.com/actions/upload-artifact)
- [JUnit XML Format](https://github.com/dorny/test-reporter)
