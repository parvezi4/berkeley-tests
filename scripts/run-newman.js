#!/usr/bin/env node

/**
 * Helper script to run Newman with environment variables from .env
 *
 * Usage: node scripts/run-newman.js [--verbose]
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

dotenv.config();

const isVerbose = process.argv.includes('--verbose');
const isCI = process.env.CI === 'true';

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
}

if (process.env.PROGRAM_ID) {
  baseCommand.push('--env-var', `program_id=${process.env.PROGRAM_ID}`);
}

// Add reporters for CI
if (isCI) {
  baseCommand.push('--reporters', 'cli,json', '--reporter-json-export', 'newman-results.json');
}

if (isVerbose) {
  baseCommand.push('--verbose');
}

const command = baseCommand.join(' ');
console.log('Running:', command);
console.log('');

try {
  execSync(command, { stdio: 'inherit' });
  process.exit(0);
} catch (error) {
  process.exit(1);
}
