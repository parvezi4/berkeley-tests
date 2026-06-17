# Performance & Load Testing

This document covers protocol-level load testing using **Artillery**, a lightweight HTTP load testing engine. These tests complement the functional Playwright tests by measuring system performance, throughput, and latency under load without consuming browser resources.

## Why Artillery?

Artillery provides several advantages for API load testing:

- **Lightweight** — No browser overhead; tests run as pure HTTP requests
- **Fast execution** — Thousands of requests per second on modest hardware
- **Protocol-level** — Tests actual API performance, not browser rendering
- **Scenario-based** — Compose realistic user flows combining multiple endpoints
- **Low resource footprint** — Ideal for CI/CD pipelines and development machines

## Prerequisites

### Installation

**Global installation (recommended for CLI use):**
```bash
npm install -g artillery
```

**Or as a dev dependency in this project:**
```bash
npm install --save-dev artillery
```

### Environment Setup

Load tests require the same environment variables as functional tests:

```bash
# Copy from .env.example and fill in real values
cp .env.example .env

# Required:
#   BP_API_KEY     - Your staging API key (or set as secret in CI)
#   BASE_URL       - API endpoint (default: https://api.staging.pungle.co)
#   PROGRAM_ID     - Program under test (default: 137)
```

## Running Load Tests

### Recommended: Using the Reporter Script

The easiest way to run tests and view results:

```bash
# Run with defaults (120s @ 15 req/s) and open HTML report
./load-tests/run-and-report.sh --open-report

# Run with custom parameters
./load-tests/run-and-report.sh --duration 300 --rate 50

# Run without generating HTML report
./load-tests/run-and-report.sh --no-report
```

**What the script does:**
- ✅ Validates `BP_API_KEY` is set
- ✅ Runs Artillery with your test config
- ✅ Saves JSON results to `load-tests/results/`
- ✅ Generates colorized summary metrics
- ✅ Creates HTML report (optional)
- ✅ Opens report in browser (with `--open-report`)

### Manual Execution

**Quick smoke test** (30s warmup + 60s ramp-up):
```bash
artillery run load-tests/artillery.yml \
  --target https://api.staging.pungle.co
```

**With environment variables from .env:**
```bash
export BP_API_KEY=$(grep BP_API_KEY .env | cut -d= -f2)
artillery run load-tests/artillery.yml \
  --target https://api.staging.pungle.co \
  --set baseUrl=https://api.staging.pungle.co \
  --set apiKey=$BP_API_KEY
```

**Verbose output with detailed logging:**
```bash
artillery run load-tests/artillery.yml \
  --target https://api.staging.pungle.co \
  -o artillery-report.json
```

**Generate HTML report from saved results:**
```bash
artillery report artillery-report.json -o report.html
```

### CI/CD Integration

In GitHub Actions or other CI systems, tests are automatically run with the configured secrets:

```yaml
- name: Run performance tests
  env:
    BP_API_KEY: ${{ secrets.BP_API_KEY }}
  run: |
    artillery run load-tests/artillery.yml \
      --target https://api.staging.pungle.co
```

## Test Scenarios

### 1. **Program Info & Balance** (20% traffic weight)

**What it tests:**
- Fetching program metadata (GET /programs/{id})
- Retrieving program-level balance (GET /programs/{id}/balance)

**Why it matters:**
- Validates read-heavy baseline performance
- Measures metadata API latency

**Load characteristics:**
- No state dependencies
- Lightweight requests (~100 bytes)
- High concurrency tolerance

### 2. **Cardholder Lifecycle** (30% traffic weight)

**What it tests:**
- Creating a new cardholder (POST /cardholders)
  - Exercises request body parsing, business logic, database writes
- Retrieving cardholder details (GET /cardholders/{id})
- Listing cardholders (GET /cardholders)

**Why it matters:**
- Write-heavy operation; measures database performance under load
- Tests sequential dependencies (create → retrieve)
- Validates response structure consistency

**Load characteristics:**
- Largest payloads (~500 bytes POST body)
- Creates persistent state
- Models real consumer onboarding workflow

### 3. **Account Resolution & Balance** (20% traffic weight)

**What it tests:**
- Creating a cardholder (establishes a primary account)
- Resolving account from processor reference (GET /accounts?processor_reference=...)
- Fetching account details (GET /accounts/{id})
- Reading account balance (GET /accounts/{id}/balance)

**Why it matters:**
- Tests the consumer integration pattern: create → resolve → query
- Validates processor reference lookup performance
- Measures balance read latency

**Load characteristics:**
- Mixed read/write pattern
- Sequential state dependencies
- Realistic consumer workflow

### 4. **Value Load Operations** (30% traffic weight)

**What it tests:**
- Creating a cardholder + account setup
- Resolving account from processor reference
- Creating a value load (POST /value_loads/load)
  - Critical financial operation
- Retrieving load details (GET /value_loads/{id})
- Listing loads (GET /value_loads?program_id=...)

**Why it matters:**
- **Highest business criticality** — represents actual money movement
- Tests idempotency key handling
- Measures write performance for financial transactions

**Load characteristics:**
- Most complex flow (6 requests per user)
- Highest financial risk
- Must succeed reliably under load

### 5. **Negative Path — Auth Validation** (5% traffic weight)

**What it tests:**
- Invalid bearer token rejection (GET /programs/{id} with bad token)

**Why it matters:**
- Validates auth enforcement
- Measures security boundaries
- Should return 401/403 consistently

### 6. **Negative Path — Resource Not Found** (5% traffic weight)

**What it tests:**
- Non-existent program lookup (GET /programs/999999999)
- Non-existent cardholder lookup (GET /cardholders/999999999)

**Why it matters:**
- Validates error handling
- Should return 4xx (not 5xx) for missing resources
- Tests application stability under edge cases

## Load Phases

The default load profile consists of four phases, totaling **4 minutes 20 seconds**:

| Phase | Duration | Rate | Ramp | Purpose |
|-------|----------|------|------|---------|
| **Warmup** | 30s | 2 req/s | — | Establish connections, verify connectivity |
| **Ramp-up** | 60s | 5→15 req/s | Yes | Gradually increase load, detect bottlenecks |
| **Sustained** | 120s | 15 req/s | — | **Main test phase** — measure stability at target load |
| **Cool-down** | 30s | 15→2 req/s | Yes | Graceful shutdown, cleanup |

**Total throughput:** ~1,350 requests across all phases

### Customizing Load Phases

To run a lighter load for development:

```bash
artillery run load-tests/artillery.yml \
  --target https://api.staging.pungle.co \
  --set phases.0.arrivalRate=1 \
  --set phases.1.arrivalRate=2 \
  --set phases.1.rampTo=5 \
  --set phases.2.arrivalRate=5
```

To run a high-stress test:

```bash
artillery run load-tests/artillery.yml \
  --target https://api.staging.pungle.co \
  --set phases.2.duration=300 \
  --set phases.2.arrivalRate=50
```

## Interpreting Results

Artillery outputs key metrics after each test run:

### Response Time Metrics
- **min / max / mean / p95 / p99** — Distribution of request latency
  - p95 = 95th percentile (most requests are faster; 5% are slower)
  - p99 = 99th percentile (highest-latency 1% of requests)
  - Goal: p95 < 500ms, p99 < 1000ms for API calls

### Throughput
- **rps** — Requests per second successfully completed
- **goal:** Should match `arrivalRate` during sustained phase

### Errors
- **2xx / 4xx / 5xx** — HTTP status code distribution
  - 5xx errors indicate server issues; should be 0 under normal load
  - 4xx errors expected for negative path tests
  - Goal: 100% success rate for happy-path scenarios

### Concurrency
- **codes.200 / 201 / etc.** — Count of each status code
- **Count total** — Verify expected request volume was generated

## Example Output

```
Summary report @ 13:45:23 UTC

  Scenarios launched:  100
  Scenarios completed: 100
  Requests completed:  1,350
  Mean response time:  245ms
  Scenario duration:   4m 20s

  50%ile (p50):  180ms
  95%ile (p95):  450ms
  99%ile (p99):  920ms

  Codes:
    200:  900
    201:  300
    400:    0
    401:    50
    5xx:    0
```

**Interpretation:**
- ✅ All scenarios completed successfully
- ✅ p95 < 500ms — acceptable latency
- ✅ No 5xx errors — backend healthy
- ✅ 401 count matches auth negative tests (5% weight = ~50 req)

## Results & Reporting

### Understanding Result Files

After running tests, results are saved to `load-tests/results/`:

```
load-tests/results/
├── report_20240616_154203.json     # Raw Artillery results (machine-readable)
└── report_20240616_154203.html     # HTML report (human-readable)
```

**JSON Results (`report_*.json`):**
- Complete metrics in structured format
- Useful for programmatic analysis, CI/CD pipelines
- Can be imported into dashboards or monitoring tools
- Archived for historical trend analysis

**HTML Report (`report_*.html`):**
- Visual charts and graphs
- Response time distribution
- Scenario breakdown
- Status code summary
- Easy to share with stakeholders

### Reporter Script (`run-and-report.sh`)

The included bash script simplifies running tests and generating reports:

**Features:**
- Automatically loads environment from `.env`
- Validates `BP_API_KEY` is set
- Saves results with timestamp-based filenames
- Generates colorized summary metrics in terminal
- Creates HTML report automatically
- Optional: Opens report in default browser
- Allows overriding duration and arrival rate

**Usage Examples:**

```bash
# Basic: Run and show summary
./load-tests/run-and-report.sh

# Open report in browser
./load-tests/run-and-report.sh --open-report

# Custom load: 5 minutes at 50 req/s
./load-tests/run-and-report.sh --duration 300 --rate 50

# Just run, no HTML report
./load-tests/run-and-report.sh --no-report

# Custom target URL
./load-tests/run-and-report.sh --target https://api.production.pungle.io
```

## Monitoring & Observability

### Real-time Metrics

Artillery can stream metrics to StatsD/CloudWatch. Enable in `artillery.yml`:

```yaml
metrics:
  plugins:
    statsd:
      host: localhost
      port: 8125
```

Then visualize in Grafana, DataDog, or CloudWatch.

### Local HTML Report

```bash
artillery run load-tests/artillery.yml --target https://api.staging.pungle.co -o report.json
artillery report report.json
open artillery-report.html
```

### Debugging Failed Requests

Enable verbose output to see request/response details:

```bash
DEBUG=* artillery run load-tests/artillery.yml
```

## Best Practices

### ✅ Do:
- Run tests against **staging only** — never production
- **Coordinate with operations** before large load tests
- **Warm up** the API first (use Warmup phase)
- **Monitor backend** during tests (logs, metrics, error rates)
- **Iterate gradually** — start light, increase load incrementally
- **Save results** for historical trend analysis (`-o report.json`)
- **Version your test config** — track changes to load profiles

### ❌ Don't:
- Run load tests against **production** without explicit approval
- Ignore **idempotency keys** — risk double-charging in replay scenarios
- Test without **valid credentials** (will inflate auth error rates)
- Use **production database** directly as a target
- Share **API keys** in logs or reports — use `***` masking

## Troubleshooting

### "BP_API_KEY not set" Error

**Cause:** Environment variable not loaded.

**Fix:**
```bash
export BP_API_KEY=$(grep BP_API_KEY .env | cut -d= -f2)
artillery run load-tests/artillery.yml --set apiKey=$BP_API_KEY
```

### High 401/403 Error Rates

**Cause:** API key invalid or expired.

**Fix:**
1. Verify the key in `.env` matches what's in GitHub Secrets
2. Generate a new staging key if necessary
3. Reload the environment: `source .env`

### Timeout Errors ("ECONNREFUSED")

**Cause:** API endpoint unreachable.

**Fix:**
1. Verify `BASE_URL` in `.env`: `https://api.staging.pungle.co`
2. Test connectivity: `curl -H "Authorization: Bearer $BP_API_KEY" https://api.staging.pungle.co/api/v1/card_issuing/programs/137`
3. Check if staging is down or network restricted

### Memory Usage Spikes

**Cause:** Too many concurrent connections.

**Workaround:**
- Reduce `arrivalRate` in load phases
- Reduce test duration
- Increase `think` (pause) time between requests

## Further Reading

- **[Artillery Docs](https://artillery.io/docs)** — Full reference
- **[Artillery Best Practices](https://artillery.io/docs/best-practices)** — Performance tuning
- **[Load Testing Anti-Patterns](https://artillery.io/blog/load-testing-anti-patterns)** — What NOT to do
