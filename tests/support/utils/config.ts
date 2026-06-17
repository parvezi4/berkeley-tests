import dotenv from 'dotenv';

dotenv.config();

/**
 * Centralised, validated access to environment configuration.
 * Throws early with a clear message if a required secret is missing, so a
 * misconfigured CI run fails fast instead of producing confusing 401s.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value || value.startsWith('replace-with')) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Copy .env.example to .env and provide a real value (or set it in CI secrets).`,
    );
  }
  return value;
}

export const config = {
  baseURL: process.env.BASE_URL ?? 'https://api.staging.pungle.co',
  apiKey: required('BP_API_KEY'),
  programId: Number(process.env.PROGRAM_ID ?? '137'),
  // Stable API structure — kept here so a version bump is a one-line change.
  cardIssuingPath: 'api/v1/card_issuing',
} as const;
