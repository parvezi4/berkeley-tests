#!/bin/bash

###############################################################################
# Artillery Load Test Runner with Results Reporting
#
# Usage:
#   ./load-tests/run-and-report.sh [options]
#
# Options:
#   --target <url>         Target API URL (default: https://api.staging.pungle.co)
#   --quick               Run quick 30-second smoke test (low load, basic validation)
#
# Environment Variables:
#   BP_API_KEY             API key (required if not in .env)
#   BASE_URL               Target URL (defaults to https://api.staging.pungle.co)
#   PROGRAM_ID             Program ID (defaults to 137)
#
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
TARGET_URL="${BASE_URL:-https://api.staging.pungle.co}"
QUICK_TEST=false
ARTILLERY_CONFIG="load-tests/artillery.yml"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RESULTS_DIR="load-tests/results"
REPORT_FILE="${RESULTS_DIR}/report_${TIMESTAMP}.json"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --target)
      TARGET_URL="$2"
      shift 2
      ;;
    --quick)
      QUICK_TEST=true
      ARTILLERY_CONFIG="load-tests/artillery-quick.yml"
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Create results directory
mkdir -p "$RESULTS_DIR"

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

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Artillery Load Test Runner${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo "Configuration:"
echo -e "  Target URL:        ${GREEN}${TARGET_URL}${NC}"
echo -e "  API Key:           $([ -n "$BP_API_KEY" ] && echo -e "${GREEN}***${NC}" || echo -e "${RED}NOT SET${NC}")"
echo -e "  Program ID:        ${GREEN}${PROGRAM_ID:-137}${NC}"
echo -e "  Results File:      ${GREEN}${REPORT_FILE}${NC}"
echo ""

# Run Artillery with custom settings
echo -e "${YELLOW}🚀 Starting load test...${NC}"
echo ""

npx npx npx artillery run "$ARTILLERY_CONFIG" \
  --target "$TARGET_URL" \
  --variables "{\"apiKey\":\"$BP_API_KEY\",\"programId\":\"${PROGRAM_ID:-137}\"}" \
  --output "$REPORT_FILE" 2>/dev/null || true

TEST_EXIT_CODE=$?

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Test Execution Complete${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Display summary
echo -e "${GREEN}✓ Raw results saved to: ${REPORT_FILE}${NC}"

# Generate and display summary
if [ -f "$REPORT_FILE" ]; then
  echo ""
  echo "Quick Summary:"
  node -e "
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync('$REPORT_FILE', 'utf8'));
    const summary = data.aggregate;

    console.log('  Scenarios completed: ' + summary.scenariosCompleted);
    console.log('  Requests: ' + summary.requestsCompleted);
    console.log('  Mean latency: ' + summary.meanLatency.toFixed(0) + 'ms');
    console.log('  p95 latency: ' + summary.p95 + 'ms');
    console.log('  p99 latency: ' + summary.p99 + 'ms');
    console.log('');
    console.log('  Success: ' + summary.statusCodesByStatus['2xx']);
    console.log('  4xx errors: ' + (summary.statusCodesByStatus['4xx'] || 0));
    console.log('  5xx errors: ' + (summary.statusCodesByStatus['5xx'] || 0));
  " 2>/dev/null || echo "  (Could not parse results)"
fi

# Generate HTML report from JSON
if [ -f "$REPORT_FILE" ]; then
  HTML_REPORT="${REPORT_FILE%.json}.html"
  echo ""
  echo -e "${YELLOW}📊 Generating HTML report...${NC}"

  node load-tests/generate-html-report.js "$REPORT_FILE" "$HTML_REPORT" 2>/dev/null

  if [ -f "$HTML_REPORT" ]; then
    echo -e "${GREEN}✓ HTML report saved to: ${HTML_REPORT}${NC}"
  fi
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"

# Exit with test result code
exit $TEST_EXIT_CODE
