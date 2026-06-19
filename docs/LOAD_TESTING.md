# Load Testing & Performance Guide

Comprehensive load testing for the Berkeley Card Issuing API with rate-limit detection, performance baselines, and beautiful reporting.

This document covers protocol-level load testing using **Artillery**, a lightweight HTTP load testing engine. These tests complement the functional Playwright tests by measuring system performance, throughput, and latency under load without consuming browser resources.

> ⚠️ **Important:** Load tests are **local-only** and do **not** run in GitHub Actions CI. They are designed for developer machines and require explicit execution via npm scripts or the reporter script.

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

## Quick Start

### Run a quick smoke test (30 seconds, minimal load)
```bash
npm run test:load
```

### Run full load test (4+ minutes)
```bash
npm run test:load:standard
```

### Find rate-limit threshold (incremental, 5-10 minutes)
```bash
npm run test:load:incremental
```

## Test Modes

### 1. Quick Smoke Test (30 seconds) — DEFAULT
**Purpose:** Fast validation, minimal server load, safe for rate-limited APIs

**What it tests:**
- Program info retrieval (read-only)
- Authentication validation (negative test)
- Baseline latency metrics

**Load profile:**
- Duration: 30 seconds
- Rate: 2 requests/second
- Total requests: ~60

**Use cases:**
- Pre-deployment connectivity checks
- Quick development iteration
- Testing against rate-limited staging
- Rapid feedback loops

**Run:**
```bash
npm run test:load
```

### 2. Full Load Test (4+ minutes)
**Purpose:** Comprehensive capacity testing with full scenario coverage

**What it tests:**
- Program info & balance queries
- Cardholder lifecycle (create, read, list)
- Account resolution and balance lookups
- Value load operations
- Authentication failure handling
- Resource not found handling

**Load profile:**
- Warmup: 30s @ 2 req/s
- Ramp-up: 60s ramping from 5 to 15 req/s
- Sustained: 120s @ 15 req/s
- Cool-down: 30s ramping from 15 to 2 req/s
- Total: ~4 minutes, ~2700 requests

**Use cases:**
- Capacity planning
- Performance baselines
- Identifying bottlenecks
- Load testing before production deploys

**Run:**
```bash
npm run test:load:standard
```

### 3. Incremental Load Test (5-10 minutes)
**Purpose:** Find the exact rate-limit threshold by gradually increasing load

**What it tests:**
- Starts at 1 req/s and increases to 20 req/s
- Stops early when rate limiting (HTTP 429) detected
- Each iteration: 30 seconds

**Load progression:**
1. 1 req/s - Baseline connectivity
2. 2 req/s - Minimal load
3. 5 req/s - Light load
4. 10 req/s - Moderate load (iteration 4)
5. 15 req/s - Standard sustained load (iteration 5)
6. 20 req/s - Stress test (if no rate limiting detected)

**Output:**
- Breaking point: Exact load level where 429 errors start
- Maximum safe load: Highest stable load without rate limiting
- Recommendations: Next steps based on findings
- Detailed reports for each iteration

**Use cases:**
- Understanding server capacity
- Rate-limit policy discovery
- Capacity planning
- SLA validation
- Finding sustainable load levels

**Run:**
```bash
npm run test:load:incremental      # Full incremental (1-20 req/s)
npm run test:load:incremental-4    # Up to iteration 4 (10 req/s)
npm run test:load:incremental-5    # Up to iteration 5 (15 req/s)
```

**Example output:**
```
Breaking Point Found
Rate Limiting Started At: 15 req/s
Maximum Safe Load: 10 req/s

Recommendations:
  • Use loads below 15 req/s for production tests
  • Safe sustained load: 10 req/s
  • For higher loads, consider:
    - Adding backoff/retry logic for 429 responses
    - Requesting rate limit increase from provider
    - Distributing load across multiple time periods
```

## Test Scenarios

Each load test exercises a combination of realistic API scenarios with weighted traffic distribution:

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
  - **Highest business criticality** — represents actual money movement
- Retrieving load details (GET /value_loads/{id})
- Listing loads (GET /value_loads?program_id=...)

**Why it matters:**
- Tests idempotency key handling
- Measures write performance for financial transactions
- Must succeed reliably under load

**Load characteristics:**
- Most complex flow (6 requests per user)
- Highest financial risk
- Includes idempotency validation

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

## Load Phases & Profiles

### Default Load Profile (4+ minutes)

The default load profile consists of four phases with specific purposes:

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

## Reports

Both JSON and HTML reports are generated automatically.

### JSON Reports
- **Location:** `load-tests/results/report_TIMESTAMP.json`
- **Contains:** Complete metrics, per-scenario data, latency distributions
- **Use:** Programmatic analysis, CI/CD integration, metrics export
- **Size:** 20-150KB

### HTML Reports
- **Location:** `load-tests/results/report_TIMESTAMP.html`
- **Features:**
  - Interactive dashboard with charts
  - Status code distribution (pie chart)
  - Latency percentiles (bar chart)
  - Rate-limiting alerts (highlighted if 429 detected)
  - Scenario breakdown table
  - Performance summary cards

**View reports:**
1. Download from `load-tests/results/`
2. Open `.html` file in browser
3. Or open directly: `open load-tests/results/report_*.html`

## Interpreting Results

### Key Metrics

#### Response Time Metrics
- **min / max / mean / p95 / p99** — Distribution of request latency
  - **p95** = 95th percentile (most requests are faster; 5% are slower)
  - **p99** = 99th percentile (highest-latency 1% of requests)
  - **Goal:** p95 < 500ms, p99 < 1000ms for API calls

#### Throughput
- **rps** — Requests per second successfully completed
- **Goal:** Should match `arrivalRate` during sustained phase

#### Errors
- **2xx / 4xx / 5xx** — HTTP status code distribution
  - 5xx errors indicate server issues; should be 0 under normal load
  - 4xx errors expected for negative path tests
  - Goal: 100% success rate for happy-path scenarios

#### Concurrency
- **codes.200 / 201 / etc.** — Count of each status code
- **Count total** — Verify expected request volume was generated

### Example Output

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

### Health Indicators
| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| Success Rate | >99% | 95-99% | <95% |
| p99 Latency | <100ms | 100-500ms | >500ms |
| 429 Responses | 0 | <5% | >5% |
| 5xx Errors | 0 | <1% | >1% |

### Rate Limiting Detection
If you see this alert in the HTML report:
```
⚠️  RATE LIMITING DETECTED!
X requests (Y%) received HTTP 429 responses
```

**This means:**
- Server applied rate limiting during test
- Current load is above sustainable threshold
- Reduce load or add backoff logic

**Next steps:**
1. Use lower load for future tests
2. Increase time between requests (add think time)
3. Implement exponential backoff for 429 responses
4. Contact provider for rate-limit increase if needed

## Configuration

### Target URL
Override the target API URL:
```bash
./load-tests/run-and-report.sh --target https://api.example.com
./load-tests/incremental-test.sh --target https://api.example.com
```

### Environment Variables
```bash
# API authentication
BP_API_KEY=your-api-key

# Program ID (optional, defaults to 137)
PROGRAM_ID=999

# Base URL (optional, defaults to staging)
BASE_URL=https://api.example.com
```

Set in `.env` file or export:
```bash
export BP_API_KEY=your-key
export BASE_URL=https://api.example.com
npm run test:load
```

### Load Phase Customization
Edit `load-tests/artillery.yml` or `load-tests/artillery-quick.yml`:

```yaml
config:
  phases:
    - duration: 30      # seconds
      arrivalRate: 2    # requests/second
      name: "Warmup"
    - duration: 60
      arrivalRate: 5
      rampTo: 15
      name: "Ramp-up"
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

## Troubleshooting

### "BP_API_KEY not set"

**Cause:** Environment variable not loaded.

**Solution:** Set the environment variable
```bash
export BP_API_KEY=$(grep BP_API_KEY .env | cut -d= -f2)
artillery run load-tests/artillery.yml --set apiKey=$BP_API_KEY

# or add to .env file
export BP_API_KEY=your-key
```

### HTML report not generated
**Possible causes:**
- JSON report didn't generate (check Artillery output)
- Chart.js CDN unreachable (reports need internet for charts)

**Solution:**
```bash
# Manually generate HTML from existing JSON
node load-tests/generate-html-report.js load-tests/results/report_*.json
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

### High 5xx error rates
**Possible causes:**
- Server is overloaded
- Database is slow
- Load test is too aggressive for server capacity

**Solution:**
- Reduce load: Lower `arrivalRate` in config
- Increase think time: Add `think: 2` between requests
- Check server metrics and logs
- Use incremental test to find safe load

## Performance Baselines

### Expected Performance (Staging)
Based on normal operations:
- **Mean Latency:** 30-50ms
- **p99 Latency:** <100ms
- **Success Rate:** >99%
- **Sustainable Load:** 10-15 req/s

These values vary by server capacity and API complexity.

## Best Practices

### ✅ Do:
- Run tests against **staging only** — never production
- **Coordinate with operations** before large load tests
- **Warm up** the API first (use Warmup phase)
- **Monitor backend** during tests (logs, metrics, error rates)
- **Iterate gradually** — start light, increase load incrementally
- **Save results** for historical trend analysis (`-o report.json`)
- **Version your test config** — track changes to load profiles
- **Start with quick test first** — validates connectivity before heavy load
- **Use incremental test for capacity planning** — finds rate-limit threshold
- **Document findings** — save reports for comparison and trend tracking

### ❌ Don't:
- Run load tests against **production** without explicit approval
- Ignore **idempotency keys** — risk double-charging in replay scenarios
- Test without **valid credentials** (will inflate auth error rates)
- Use **production database** directly as a target
- Share **API keys** in logs or reports — use `***` masking

## Advanced Usage

### Generating Reports Programmatically
```bash
# Run test
npm run test:load

# Reports are auto-generated:
# - load-tests/results/report_TIMESTAMP.json
# - load-tests/results/report_TIMESTAMP.html
```

### Parsing JSON Reports
```bash
# Get basic stats
jq '.aggregate.counters' load-tests/results/report_*.json

# Get latency percentiles
jq '.aggregate.summaries."http.response_time"' load-tests/results/report_*.json

# Get 429 count
jq '.aggregate.counters."http.codes.429"' load-tests/results/report_*.json

# Get scenario breakdown
jq '.aggregate.counters | to_entries[] | select(.key | contains("created_by_name"))' load-tests/results/report_*.json
```

### Integrating with CI/CD
```yaml
# GitHub Actions example
- name: Run load test
  run: npm run test:load

- name: Check results
  run: |
    RATE_429=$(jq '.aggregate.counters."http.codes.429" // 0' load-tests/results/report_*.json)
    if [ "$RATE_429" -gt 0 ]; then
      echo "⚠️  Rate limiting detected: $RATE_429 requests"
      exit 1
    fi

- name: Upload reports
  uses: actions/upload-artifact@v4
  with:
    name: load-test-reports
    path: load-tests/results/
    retention-days: 30
```
