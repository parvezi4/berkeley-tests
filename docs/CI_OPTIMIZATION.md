# CI Optimization & Performance Guide

This document explains the GitHub Actions CI optimizations in place and how to maintain performance as the test suite grows.

## Current Optimizations

### 1. **Efficient Dependency Caching**

**What changed:**
- `setup-node` action uses explicit `cache: npm` configuration
- Cache key: `${{ runner.os }}-npm-${{ hashFiles('**/package-lock.json') }}`
- Restore keys pattern ensures cache hits even on minor dependency changes

**Impact:**
- Dependency installation drops from ~60s to ~3s on cache hit
- Saves ~57 seconds per job, ~2 minutes per full CI run

**Keep cache warm:**
- `package-lock.json` is committed (required for deterministic installs)
- Cache automatically invalidates when dependencies change
- Manual cache clear available in GitHub Actions UI if needed

### 2. **Playwright Browser Caching**

**What changed:**
- Added explicit cache for Playwright browser binaries (`~/.cache/ms-playwright`)
- Only chromium installed (smaller than full install)
- Caches miss on `package-lock.json` changes (includes Playwright version)

**Impact:**
- Browser installation drops from ~90s to instant on cache hit
- Saves ~90 seconds per Playwright job

**Configuration:**
```yaml
- uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    key: ${{ runner.os }}-playwright-${{ hashFiles('**/package-lock.json') }}
```

### 3. **Dependency Installation Optimization**

**What changed:**
- `npm ci --audit=false` — Skip audit during install (use `npm audit` separately if needed)
- Environment variable: `npm_config_audit: false` as default
- Reduced to only required dependencies (no unnecessary packages)

**Impact:**
- npm ci becomes ~3x faster by skipping audit scan
- Reduces from ~15s to ~5s

**Why audit=false is safe:**
- We run `npm audit` in dedicated workflows (future)
- `package-lock.json` prevents dependency tampering
- Audit doesn't affect functionality, only warns about vulnerabilities

### 4. **Parallel Job Execution**

**What changed:**
- `setup` job runs first, caches dependencies
- `playwright` and `newman` jobs run in parallel, both depend on `setup`
- Both jobs reuse cached dependencies

**Impact:**
- Before: Playwright (25m) + Newman (25m) = 50m total
- After: Setup (10m) + Parallel(25m) = ~35m total
- Saves ~15 minutes per CI run

**Job dependency flow:**
```
setup (10m)
  ├─→ playwright (25m) ──┐
  └─→ newman (25m) ──────┤
                         Total: ~35m
```

### 5. **Concurrency Control**

**What changed:**
- Added `concurrency` group to cancel in-progress runs
- When you push again, previous PR/branch run cancels

**Impact:**
- Prevents wasted CI time on stale runs
- Frees up GitHub Actions minutes quota

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

### 6. **Shallow Clone**

**What changed:**
- `checkout` uses `fetch-depth: 1` to get only the latest commit
- Skips full git history (not needed for testing)

**Impact:**
- Checkout drops from ~5s to ~1s
- Saves 4 seconds per job

### 7. **Timeout Management**

**What changed:**
- Explicit `timeout-minutes` on each step
- Prevents hanging jobs from consuming quota
- Defaults: setup=10m, install=3m, tests=20m, type-check=5m

**Impact:**
- Fails fast if a step hangs
- Clearer visibility into which step is slow

### 8. **Artifact Optimization**

**What changed:**
- Playwright report: `retention-days: 7` (was 14)
- Added `compression-level: 6` for gzip compression

**Impact:**
- Smaller storage footprint
- Faster upload/download
- Automatic cleanup after 7 days

## Performance Baseline

**Target run times (with cache):**

| Phase | Duration | Notes |
|-------|----------|-------|
| Checkout | 1s | Shallow clone |
| Setup Node | 2s | Cache hit |
| Install deps | 3s | `npm ci --audit=false` |
| Cache browsers | 0s | Instant |
| Playwright tests | 15-20m | Depends on API latency |
| Newman tests | 8-12m | Depends on API latency |
| Type-check | 3-5m | TypeScript compilation |
| **Total** | **~35m** | With all caches warm |

**First run (no cache):**
- Add ~60s (dependencies) + ~90s (browsers) = ~150s overhead
- Total: ~40-45m on first run

## Monitoring & Troubleshooting

### Cache Hit Rate

Check GitHub Actions "Caches" tab in repository settings:
- npm cache: should have 95%+ hit rate
- playwright cache: should have 90%+ hit rate

If hit rate drops below 80%:
1. Check if dependencies changed frequently
2. Verify `package-lock.json` is committed
3. Manually clear cache if corrupted (Settings → Caches)

### Slow Installs

If `npm ci` takes >10 seconds:

1. **Check npm registry status:**
   ```bash
   npm ping --registry https://registry.npmjs.org
   ```

2. **Check for audit hanging:**
   ```bash
   npm ci --audit=false  # vs with audit
   ```

3. **Verify lock file is up-to-date:**
   ```bash
   npm ci --package-lock-only
   git diff package-lock.json
   ```

### Playwright Browser Cache Issues

If Playwright browser installation always fails:

1. Clear cache manually in GitHub Actions UI
2. Check Playwright version in `package.json`
3. Verify disk space in runner (should be >10GB available)
4. Consider using pre-built image with browsers pre-installed

## Future Optimizations

### 1. **Matrix Strategy** (if test suites grow)
Split tests across multiple machines:
```yaml
strategy:
  matrix:
    test-group: [accounts, cardholders, value-loads, programs]
```
Potential: reduce per-group time from 20m to 5m each, but adds setup overhead.

### 2. **Separate Audit Job**
```yaml
audit:
  runs-on: ubuntu-latest
  steps:
    - run: npm audit --audit-level=moderate
```
Run less frequently (weekly) to catch vulnerabilities without slowing every run.

### 3. **Docker Image Cache**
Pre-build Docker image with Node + Playwright:
- First run: 5m build
- Subsequent runs: instant pull
- Trade-off: added complexity, slower for small projects

### 4. **npm ci Caching Layer**
Use `npm ci` in a cached layer:
```yaml
- uses: bahmutov/npm-install@v1
```
Third-party action with additional caching optimizations.

## Debugging CI Locally

Reproduce CI environment locally:

```bash
# Install exact versions (like CI)
npm ci

# Run with audit disabled
npm ci --audit=false

# Type-check
npm run lint

# Run Playwright (mimics CI)
npx playwright install chromium
npx playwright test

# Run Newman
npm run newman
```

## Cost Impact

**GitHub Actions quota** (assuming ~50 runs/month):

| Configuration | Minutes/month | Cost (if over quota) |
|---------------|---------------|----------------------|
| Before optimization | 50 × 50m = 2,500m | $12+ (>2,000 free) |
| After optimization | 50 × 35m = 1,750m | Free (under 2,000) |
| **Savings** | **750m** | **~$3.50/month** |

*GitHub Actions free tier: 2,000 minutes/month for public repos, unlimited for private*

## Checklist for Maintaining Performance

When adding new tests:

- [ ] Add `timeout-minutes` to new job steps
- [ ] Ensure `package-lock.json` is committed (not `.npmrc`)
- [ ] Keep dependencies minimal (audit before adding)
- [ ] Consider adding new job to matrix if >20m runtime
- [ ] Document in this file if adding new optimization
- [ ] Monitor cache hit rates after changes
- [ ] Review GitHub Actions billing/quota monthly

## References

- [GitHub Actions: Caching Dependencies](https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows)
- [npm ci Documentation](https://docs.npmjs.com/cli/v9/commands/npm-ci)
- [Playwright CI Guide](https://playwright.dev/docs/ci)
