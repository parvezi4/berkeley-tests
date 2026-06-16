# Postman Collection

An importable Postman collection covering all four Card Issuing resource groups, plus a matching environment.

## Files

- `Berkeley-testing.postman_collection.json` — the collection (Cardholders, Accounts & Cards, Value Loads, Programs), with per-request test scripts and variable chaining.
- `Berkeley-Staging.postman_environment.json` — environment with `base_url`, `program_id`, and chained-variable placeholders. **`api_key` is intentionally blank** — set it locally after import; do not commit a real key.

## Import

1. Postman → **Import** → drop both files in.
2. Select the **Berkeley-Staging** environment.
3. Set `api_key` to your staging key (it is stored as a secret-type variable).

## Run order (for a full chained run)

1. **Cardholders → Create Cardholder** seeds `cardholder_id` and `processor_reference`.
2. **Accounts → Get Account By Processor Reference** resolves `account_id`; **Get Account Details** sets `last_four_digits`.
3. **Value Loads** use `account_id`; **Create Value Load** seeds `value_load_id`.
4. **Programs** is independent and can run any time.

The same collection runs headless in CI via Newman if desired:

```bash
newman run Berkeley-testing.postman_collection.json \
  -e Berkeley-Staging.postman_environment.json \
  --env-var "api_key=$BP_API_KEY"
```
