#!/bin/bash

###############################################################################
# Incremental Load Test - Find Rate Limit Threshold
#
# Gradually increases load until the server rate-limiting kicks in.
# Useful for understanding server capacity and rate limit policies.
#
# Usage:
#   ./load-tests/incremental-test.sh [--target <url>]
#
# Output:
#   - Detailed JSON reports for each iteration
#   - HTML reports showing when rate limiting started
#   - Summary showing breaking point and safe load levels
#
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default values
TARGET_URL="${BASE_URL:-https://api.staging.pungle.co}"
RESULTS_DIR="load-tests/results"

# Load environment variables
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Validate required environment
if [ -z "$BP_API_KEY" ]; then
  echo -e "${RED}❌ Error: BP_API_KEY not set${NC}"
  echo "Set it in .env or export BP_API_KEY=your-key"
  exit 1
fi

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --target)
      TARGET_URL="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

mkdir -p "$RESULTS_DIR/incremental"

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Incremental Load Testing - Rate Limit Detection${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo "Configuration:"
echo -e "  Target URL:        ${GREEN}${TARGET_URL}${NC}"
echo -e "  API Key:           $([ -n "$BP_API_KEY" ] && echo -e "${GREEN}***${NC}" || echo -e "${RED}NOT SET${NC}")"
echo -e "  Results Directory: ${GREEN}${RESULTS_DIR}/incremental${NC}"
echo ""
echo "Test Plan:"
echo -e "  ${CYAN}Iteration 1: 1 req/s for 30s${NC}   (baseline)"
echo -e "  ${CYAN}Iteration 2: 2 req/s for 30s${NC}"
echo -e "  ${CYAN}Iteration 3: 5 req/s for 30s${NC}"
echo -e "  ${CYAN}Iteration 4: 10 req/s for 30s${NC}"
echo -e "  ${CYAN}Iteration 5: 15 req/s for 30s${NC}  (standard load)"
echo -e "  ${CYAN}Iteration 6: 20 req/s for 30s${NC}  (stress test)"
echo ""
echo "The test will stop early if rate limiting is detected."
echo ""

# Define load levels to test
declare -a LOAD_LEVELS=(1 2 5 10 15 20)
DURATION=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

BREAKING_POINT=""
MAX_SAFE_LOAD=""

for LOAD in "${LOAD_LEVELS[@]}"; do
  ITERATION=$((${LOAD_LEVELS[@]%$LOAD*} | wc -w))
  REPORT_FILE="${RESULTS_DIR}/incremental/report_${TIMESTAMP}_${LOAD}rps.json"
  HTML_FILE="${RESULTS_DIR}/incremental/report_${TIMESTAMP}_${LOAD}rps.html"

  echo -e "${YELLOW}🔄 Iteration ${ITERATION}: Testing at ${LOAD} req/s for ${DURATION}s...${NC}"

  # Run artillery with specified load
  npx artillery run load-tests/artillery-quick.yml \
    --target "$TARGET_URL" \
    --variables "{\"apiKey\":\"$BP_API_KEY\",\"programId\":\"${PROGRAM_ID:-137}\"}" \
    --output "$REPORT_FILE" 2>/dev/null || true

  # Wait for file creation
  if ! [ -f "$REPORT_FILE" ]; then
    sleep 2
  fi

  # Parse results
  if [ -f "$REPORT_FILE" ]; then
    RATE_429=$(node -e "const fs = require('fs'); const data = JSON.parse(fs.readFileSync('$REPORT_FILE')); console.log(data.aggregate.counters['http.codes.429'] || 0);" 2>/dev/null || echo "0")
    TOTAL_REQUESTS=$(node -e "const fs = require('fs'); const data = JSON.parse(fs.readFileSync('$REPORT_FILE')); console.log(data.aggregate.counters['http.requests'] || 0);" 2>/dev/null || echo "0")
    MEAN_LATENCY=$(node -e "const fs = require('fs'); const data = JSON.parse(fs.readFileSync('$REPORT_FILE')); console.log(Math.round(data.aggregate.summaries['http.response_time']?.mean || 0));" 2>/dev/null || echo "0")

    # Generate HTML report
    node load-tests/generate-html-report.js "$REPORT_FILE" "$HTML_FILE" 2>/dev/null

    # Display results
    echo -e "  ${GREEN}✓${NC} Requests: ${TOTAL_REQUESTS} | Mean Latency: ${MEAN_LATENCY}ms | 429 Errors: ${RATE_429}"

    # Check if rate limiting kicked in
    if [ "$RATE_429" -gt 0 ]; then
      BREAKING_POINT="$LOAD req/s"
      echo -e "  ${RED}⚠️  RATE LIMITING DETECTED!${NC} (${RATE_429} requests received HTTP 429)"
      echo ""
      echo -e "${RED}═══════════════════════════════════════════════════════════${NC}"
      echo -e "${RED}Breaking Point Found${NC}"
      echo -e "${RED}═══════════════════════════════════════════════════════════${NC}"
      break
    else
      MAX_SAFE_LOAD="$LOAD req/s"
    fi

    echo ""
  else
    echo -e "  ${RED}❌ Failed to generate report${NC}"
    echo ""
  fi
done

# Summary
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Test Summary${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

if [ -n "$BREAKING_POINT" ]; then
  echo -e "${RED}⚠️  Rate Limiting Started At: ${BREAKING_POINT}${NC}"
  if [ -n "$MAX_SAFE_LOAD" ]; then
    echo -e "${GREEN}✓ Maximum Safe Load: ${MAX_SAFE_LOAD}${NC}"
  fi
else
  echo -e "${GREEN}✓ No rate limiting detected at tested loads${NC}"
  echo -e "${GREEN}✓ Maximum tested load: ${MAX_SAFE_LOAD}${NC}"
fi

echo ""
echo "Recommendations:"
if [ -n "$BREAKING_POINT" ]; then
  echo -e "  • Use loads below ${BREAKING_POINT} for production tests"
  if [ -n "$MAX_SAFE_LOAD" ]; then
    echo -e "  • Safe sustained load: ${MAX_SAFE_LOAD}"
  fi
  echo -e "  • For higher loads, consider:"
  echo -e "    - Adding backoff/retry logic for 429 responses"
  echo -e "    - Requesting rate limit increase from provider"
  echo -e "    - Distributing load across multiple time periods"
else
  echo -e "  • Current server handles tested loads well"
  echo -e "  • Consider testing higher loads to find limits"
  echo -e "  • Monitor server metrics during next higher load test"
fi

echo ""
echo "Reports:"
echo -e "  📊 HTML reports: ${RESULTS_DIR}/incremental/"
echo -e "  📋 JSON reports: ${RESULTS_DIR}/incremental/"
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
