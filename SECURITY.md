# Security & Credentials

## Secrets handling

- **No credentials are committed to this repository.** `.env` is git-ignored.
- `.env.example` contains placeholders only.
- In CI, the staging API key is provided via the `BP_API_KEY` repository **secret**, never hard-coded.

## Scope

- All tests target the **staging** environment (`https://api.staging.pungle.co`).
- This suite performs **functional** testing only. It does not generate load.

## Load / performance testing

Do **not** run load or stress tooling (k6, Artillery, etc.) against any Berkeley
environment without **explicit written sign-off** from Berkeley. Load generators
can trip fraud, abuse, and DDoS protections, and unsanctioned load testing of a
payments provider is a contractual issue. When approved, target staging only.

## Reporting

If you discover a credential committed in error, rotate the key with Berkeley
immediately and purge it from git history before pushing.
