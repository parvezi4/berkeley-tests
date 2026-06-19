#!/bin/bash
# Quick load test wrapper (30s smoke test)
set -e

# Load environment from .env if it exists
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Validate required environment
if [ -z "$BP_API_KEY" ]; then
  echo "❌ Error: BP_API_KEY not set"
  echo "Set it in .env or export BP_API_KEY=your-key"
  exit 1
fi

# Create results directory
mkdir -p test-results/artillery

# Generate timestamp for report files
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
JSON_REPORT="test-results/artillery/quick_${TIMESTAMP}.json"
HTML_REPORT="test-results/artillery/quick_${TIMESTAMP}.html"

# Run quick load test with proper variables and save results
npx artillery run load-tests/artillery-quick.yml \
  --target "${BASE_URL:-https://api.staging.pungle.co}" \
  --variables "{\"apiKey\":\"$BP_API_KEY\",\"programId\":\"${PROGRAM_ID:-137}\"}" \
  --output "$JSON_REPORT" 2>/dev/null || true

# Generate HTML report from JSON
if [ -f "$JSON_REPORT" ]; then
  echo ""
  echo "📊 Generating HTML report..."
  node load-tests/generate-html-report.js "$JSON_REPORT" "$HTML_REPORT" 2>/dev/null || true
  echo "✅ Report saved to: $HTML_REPORT"
fi
