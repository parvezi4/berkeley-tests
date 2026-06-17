# Load Testing Guide

Comprehensive load testing for the Berkeley Card Issuing API with rate-limit detection and beautiful reporting.

## Quick Start

### Run a quick smoke test (30 seconds, minimal load)
```bash
./load-tests/run-and-report.sh --quick
```

### Run full load test (4+ minutes)
```bash
./load-tests/run-and-report.sh
```

### Find rate-limit threshold (incremental, 5-10 minutes)
```bash
./load-tests/incremental-test.sh
```

## Test Modes

### 1. Quick Smoke Test (30 seconds)
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
./load-tests/run-and-report.sh --quick
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
./load-tests/run-and-report.sh
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
4. 10 req/s - Moderate load
5. 15 req/s - Standard sustained load
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
./load-tests/incremental-test.sh
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
- **Mean Latency:** Average response time (lower is better)
- **p95/p99:** 95th and 99th percentile response times (tail latency)
- **Success Rate:** Percentage of 2xx responses
- **Rate Limit (429):** Count of too-many-requests errors

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
./load-tests/run-and-report.sh
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

## Troubleshooting

### "BP_API_KEY not set"
**Solution:** Set the environment variable
```bash
export BP_API_KEY=your-key
# or add to .env file
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

### All responses are 401 Unauthorized
**Causes:**
- BP_API_KEY not set
- API key is invalid or expired
- Authorization header not being sent

**Solution:**
1. Verify BP_API_KEY is correct
2. Check that API key is active
3. Ensure `.env` file is being loaded

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

1. **Test against realistic environments**
   - Use staging, not production
   - Similar data volume and complexity
   - Similar concurrent users

2. **Start with quick test first**
   - Validates connectivity before heavy load
   - Identifies obvious issues early

3. **Use incremental test for capacity planning**
   - Finds your rate-limit threshold
   - Informs load test duration
   - Helps set realistic SLAs

4. **Monitor server health during tests**
   - Watch CPU, memory, database
   - Check error logs
   - Track response times

5. **Run periodic tests**
   - Before deployments
   - After infrastructure changes
   - Monthly for trend tracking

6. **Document findings**
   - Save reports for comparison
   - Track performance over time
   - Share with team for SLA discussions

## Advanced Usage

### Generating Reports Programmatically
```bash
# Run test
./load-tests/run-and-report.sh --quick

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
  run: ./load-tests/run-and-report.sh --quick

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

## Related Documentation
- [CI/CD Optimization](./CI_OPTIMIZATION.md) - Pipeline performance tuning
- [Test Reporting](./TEST_REPORTING.md) - Playwright and Newman reporting
- [Artillery Documentation](https://artillery.io/docs)
