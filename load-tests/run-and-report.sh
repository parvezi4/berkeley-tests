#!/bin/bash

###############################################################################
# Artillery Load Test Runner with Results Reporting
#
# Usage:
#   ./load-tests/run-and-report.sh [options]
#
# Options:
#   --duration <seconds>    Override sustained phase duration (default: 120)
#   --rate <n>             Override sustained phase arrival rate (default: 15)
#   --target <url>         Target API URL (default: https://api.staging.pungle.co)
#   --no-report            Skip HTML report generation
#   --open-report          Open HTML report in browser after completion
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
SKIP_REPORT=false
OPEN_REPORT=false
DURATION=120
RATE=15
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RESULTS_DIR="load-tests/results"
REPORT_FILE="${RESULTS_DIR}/report_${TIMESTAMP}.json"
HTML_REPORT="${RESULTS_DIR}/report_${TIMESTAMP}.html"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --duration)
      DURATION="$2"
      shift 2
      ;;
    --rate)
      RATE="$2"
      shift 2
      ;;
    --target)
      TARGET_URL="$2"
      shift 2
      ;;
    --no-report)
      SKIP_REPORT=true
      shift
      ;;
    --open-report)
      OPEN_REPORT=true
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
echo -e "  Sustained Phase:   ${GREEN}${DURATION}s @ ${RATE} req/s${NC}"
echo -e "  Results File:      ${GREEN}${REPORT_FILE}${NC}"
echo ""

# Run Artillery with custom settings
echo -e "${YELLOW}🚀 Starting load test...${NC}"
echo ""

artillery run load-tests/artillery.yml \
  --target "$TARGET_URL" \
  --set baseUrl="$TARGET_URL" \
  --set apiKey="$BP_API_KEY" \
  --set phases.2.duration="$DURATION" \
  --set phases.2.arrivalRate="$RATE" \
  -o "$REPORT_FILE"

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

# Generate HTML report if not skipped
if [ "$SKIP_REPORT" = false ] && command -v artillery &> /dev/null; then
  echo ""
  echo -e "${YELLOW}📊 Generating HTML report...${NC}"

  artillery report "$REPORT_FILE" -o "$HTML_REPORT" 2>/dev/null || true

  if [ -f "$HTML_REPORT" ]; then
    echo -e "${GREEN}✓ HTML report saved to: ${HTML_REPORT}${NC}"

    # Open report if requested
    if [ "$OPEN_REPORT" = true ]; then
      echo -e "${YELLOW}📖 Opening report in browser...${NC}"
      if command -v open &> /dev/null; then
        open "$HTML_REPORT"
      elif command -v xdg-open &> /dev/null; then
        xdg-open "$HTML_REPORT"
      else
        echo -e "${YELLOW}ℹ️  Cannot auto-open. Visit: file://${PWD}/${HTML_REPORT}${NC}"
      fi
    fi
  fi
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"

# Exit with test result code
exit $TEST_EXIT_CODE
