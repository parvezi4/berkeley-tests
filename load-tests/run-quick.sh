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

# Run quick load test with proper variables
npx artillery run load-tests/artillery-quick.yml \
  --target "${BASE_URL:-https://api.staging.pungle.co}" \
  --variables "{\"apiKey\":\"$BP_API_KEY\",\"programId\":\"${PROGRAM_ID:-137}\"}"
