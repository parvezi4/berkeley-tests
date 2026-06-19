#!/usr/bin/env node

/**
 * Helper script to run Newman with environment variables from .env or CI environment
 *
 * Usage: node postman/scripts/run-newman.js [--verbose]
 *        npm run newman [-- extra-args]
 *
 * Loads configuration from:
 * - .env file (if present, for local development)
 * - Environment variables (for CI/GitHub Actions)
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

// Load .env file if it exists (local development)
if (fs.existsSync('.env')) {
  dotenv.config();
}

const isVerbose = process.argv.includes('--verbose');
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

// Validate required environment variables
const requiredVars = ['BP_API_KEY'];
const missing = requiredVars.filter(v => !process.env[v]);

if (missing.length > 0) {
  console.error(`❌ Missing required environment variable(s): ${missing.join(', ')}`);
  console.error('   Set them in .env (local) or as secrets/vars in GitHub Actions');
  process.exit(1);
}

const baseCommand = [
  'newman',
  'run',
  'postman/Berkeley-testing.postman_collection.json',
  '-e',
  'postman/Berkeley-Staging.postman_environment.json'
];

// Add environment variables
if (process.env.BP_API_KEY) {
  baseCommand.push('--env-var', `api_key=${process.env.BP_API_KEY}`);
}

if (process.env.BASE_URL) {
  baseCommand.push('--env-var', `base_url=${process.env.BASE_URL}`);
} else {
  baseCommand.push('--env-var', 'base_url=https://api.staging.pungle.co');
}

if (process.env.PROGRAM_ID) {
  baseCommand.push('--env-var', `program_id=${process.env.PROGRAM_ID}`);
} else {
  baseCommand.push('--env-var', 'program_id=137');
}

// Create results directory if it doesn't exist
const resultsDir = 'newman-results';
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
}

// Add reporters for CI
if (isCI) {
  // Generate both JSON and JUnit XML for reporting
  baseCommand.push(
    '--reporters', 'cli,json,junit',
    '--reporter-json-export', `${resultsDir}/newman-results.json`,
    '--reporter-junit-export', `${resultsDir}/newman-results.xml`
  );
  console.log('Running in CI mode with JSON and JUnit reporters');
} else {
  // Local development: just JSON
  baseCommand.push(
    '--reporters', 'cli,json',
    '--reporter-json-export', `${resultsDir}/newman-results.json`
  );
}

if (isVerbose) {
  baseCommand.push('--verbose');
  console.log('Verbose output enabled');
}

console.log('Environment:', {
  CI: isCI,
  'BP_API_KEY': process.env.BP_API_KEY ? '***' : 'NOT SET',
  'BASE_URL': process.env.BASE_URL || 'https://api.staging.pungle.co (default)',
  'PROGRAM_ID': process.env.PROGRAM_ID || '137 (default)'
});
console.log('');
console.log('Command:', baseCommand.join(' ').replace(process.env.BP_API_KEY, '***'));
console.log('');

try {
  execSync(baseCommand.join(' '), { stdio: 'inherit' });
  process.exit(0);
} catch (error) {
  process.exit(1);
}
