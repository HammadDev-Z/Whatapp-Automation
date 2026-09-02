# Pending Tasks

Working list of outstanding work for this project. Check items off as they are completed;
add new items with enough context to act on them without re-investigating.

Severity tags: **[bug]** wrong behavior · **[incomplete]** half-built / missing piece ·
**[dead]** unused code or config · **[risk]** works today but fragile.

---

## Project modules

### Entry point & wiring
- `src/index.js` — composition root: config, `pg` Pool, repos/services, message handler, Express, bot, graceful shutdown.
- `src/config.js` — `loadConfig`, env validation, production guards.
- `src/database/pool.js` — `createPool(databaseUrl)`, single shared `pg.Pool`.

### Bot
- `src/bot/client.js` — `whatsapp-web.js` wrapper: QR, auth/ready/disconnected, single-flight reconnect.
- `src/commands/message-handler.js` — WhatsApp-agnostic dispatch: calculation vs command, reply delays, in-flight dedup, low-stock fan-out.
- `src/utilities/commands.js` — `parseCommand`: `/tag`, `830x5` shorthand, `/help`, `/groupid`, `/stock`, `/status`.

### Services
- `src/services/code-allocation.js` — `CodeAllocationService`: the allocation transaction + `recordDelivery`.
- `src/services/calculator.js` — `parseCalculation`: arithmetic (`* / ÷` only) and `+50` / `-12.5` adjustments.
- `src/services/calculation-repository.js` — `CalculationRepository.record`: per-group running balance.
- `src/services/category-repository.js` — `resolve` / `listActive` / `listStock`.
- `src/services/limit-window.js` — `latestPakistanNoon`, `activeLimitWindowStart`.
- `src/services/group-limit-repository.js` — per-group per-category daily limits + windows.
- `src/services/group-repository.js` — `allowed_groups` CRUD (used by the `groups` CLI).
- `src/services/group-rate-limiter.js` — in-memory sliding-window per-group cap.
- `src/services/admin-repository.js` — `admin_numbers` CRUD, `isAllowed`, `seedFromCsv`.
- `src/services/stock-monitor.js` — `check(category)` against `LOW_STOCK_THRESHOLDS`.
- `src/services/usage-reporting.js` — reporting baseline, inventory rollup, per-group usage.
- `src/services/csv-importer.js` — CLI CSV import (`category,code`).
- `src/services/code-importer.js` — dashboard paste-a-block import.

### Dashboard
- `src/app.js` — `createApp`: Express, session store, `/health`, error handler.
- `src/routes/dashboard.js` — all dashboard routes.
- `src/middleware/security.js` — `requireAuth`, `ensureCsrf`, `verifyCsrf`, `safeEqual`.
- `src/utilities/html.js` — `escapeHtml`, `layout()`.

### Utilities
- `src/utilities/normalization.js` — `normalizeCategory`, `normalizePhone`.
- `src/utilities/mask.js` — `maskCode`.
- `src/utilities/logger.js` — one-line JSON logger; scrubs `code|password|secret|credential` keys.

### Scripts
- `scripts/migrate.js` · `scripts/import-codes.js` · `scripts/manage-groups.js` · `scripts/run-db-integration.js`

### Migrations
`001_initial` · `002_code_categories` · `003_backfill_dashboard_ledger` · `004_admin_numbers` ·
`005_calculations` · `006_expand_calculation_types` · `007_add_value_categories` ·
`008_usage_reporting_reset` · `009_group_category_limits` · `010_group_limit_windows` ·
`011_allow_calculation_expressions`

### Tests
- `test/calculator.test.js` — the only suite `npm test` discovers.

---

## Broken / incomplete by module

### `src/index.js`
- [ ] **[incomplete]** No reconciliation for deliveries stuck in `delivery_status='pending'`. If the
  process dies between the allocation COMMIT and `recordDelivery`, the code stays `used`/`pending`
  forever and never appears in Dashboard → Alerts (which only lists `failed`). Add a startup sweep
  or a periodic job that flags stale `pending` rows.
- [ ] **[incomplete]** `adminRepository.seedFromCsv` is awaited at boot but its transaction is broken
  (see `admin-repository.js` below).

### `src/config.js`
- [ ] **[risk]** No guard that `DATABASE_URL` is set in production — silently falls back to
  `localhost`. Add a production check like the ones for `ADMIN_PASSWORD` / `SESSION_SECRET`.
- [ ] **[risk]** `number()` rejects `0`, so `TAG_RESPONSE_DELAY_MIN_SECONDS=0` (reply instantly) is
  impossible. Allow `>= 0` for the delay bounds.
- [ ] **[risk]** Weak default-password guard: `adminPassword.includes('replace-')` misses
  `Replace-`, `CHANGE-ME`, etc.

### `src/database/pool.js`
- [ ] **[bug]** No `pool.on('error', …)` handler — an error on an idle client crashes the process
  with an unhandled exception.
- [ ] **[incomplete]** No `ssl` option — cannot connect to a managed Postgres that requires TLS
  (RDS, Heroku, Supabase). Add opt-in SSL from an env var.

### `src/bot/client.js`
- [ ] **[bug]** Reconnect calls `client.initialize()` again on the same disconnected client without
  `destroy()` first — `whatsapp-web.js` does not reliably support this and it can leak the puppeteer
  browser. Rebuild the client on reconnect.
- [ ] **[incomplete]** `auth_failure` just reschedules `initialize()` every `reconnectDelayMs` with no
  backoff and no cap — a dead session spins forever. Add exponential backoff + max attempts, and
  surface "needs re-scan" state.
- [ ] **[incomplete]** `initialize()` failure (e.g. missing Chromium) is caught and retried forever;
  never exits or alerts.
- [ ] **[incomplete]** No `loading_screen` / `change_state` handling for diagnostics.

### `src/commands/message-handler.js`
- [ ] **[bug]** Requester attribution uses the raw `sender` (`message.author || message.from`) for
  `allocate()` and calculations, so `requested_by` in `codes` / `audit_logs` / `calculation_transactions`
  can be a `@lid` string. Admin checks resolve `@lid` → real number via `resolveSender`; allocation
  should do the same so the audit trail is consistent.
- [ ] **[bug/UX]** Shorthand is too greedy: a plain `10x20` ("10 times 20") is parsed as a tag request
  for category `10` and the bot replies "Unknown code category". Decide whether bare `<n>x<n>` should
  only be treated as a request when `<n>` resolves to a real category.
- [ ] **[incomplete]** Calculations bypass `allowed_groups` authorization **and** the rate limiter —
  any group the bot sits in gets a running balance ledger. Confirm this is intended or gate it.
- [ ] **[incomplete]** `inFlight` dedup is per-process memory only; a restart mid-flight loses it
  (DB `processed_messages` still protects allocation, but not the calculation path cleanly).
- [ ] **[risk]** Calculation reply delay is hardcoded `randomDelayMs(3, 6)` — not configurable.
- [ ] **[risk]** `/help extra`, `/status now`, etc. are silently ignored instead of responding.

### `src/utilities/commands.js`
- [ ] **[dead]** `parseCommand` can return `{name:'invalid'}` for shorthand-looking noise; combined
  with the greedy-shorthand issue above this produces spurious "Invalid command" / "Unknown category"
  replies in normal chatter.
- [ ] **[incomplete]** No unit tests (see Test coverage).

### `src/services/code-allocation.js`
- [ ] **[bug]** Daily-limit usage count includes `status='used'` rows whose `delivery_status='failed'`
  — a code that never reached the group still burns that group's 24h allowance. Exclude failed
  deliveries from the window count, or document the trade-off.
- [ ] **[bug/UX]** `limit_reached` vs `out_of_stock` wording: when a configured limit clamps the
  request the bot says "❌ `<cat>` stock ended" even though physical stock may be fine. Distinguish
  "daily limit reached" from "out of stock".
- [ ] **[dead]** `status='reserved'` is still allowed by the schema `CHECK` (migrations 001/…) but
  nothing ever sets it. The dashboard filter no longer offers it; dropping it from the schema needs
  a new migration, or implement an actual reservation step.
- [ ] **[risk]** `catch` block runs `ROLLBACK` unconditionally; if the connection is already dead the
  rollback throws and masks the original error.

### `src/services/calculator.js`
- [ ] **[dead]** `calculation_type` enum still carries `'addition'`, `'subtraction'`,
  `'multiplication'` (migrations 005/006) but the parser only ever emits `'adjustment'` /
  `'expression'`. Trim the CHECK constraint via a new migration, or start classifying.
- [ ] **[incomplete]** Division by zero and `NUMERIC(20,2)` overflow both make the whole message
  silently non-responsive (returns `null` / DB error caught upstream). No feedback to the group.
- [ ] **[incomplete]** Leading-sign expressions like `-5+3` are ignored (only single-term `+n` / `-n`
  adjustments are accepted).

### `src/services/calculation-repository.js`
- [ ] **[bug]** Not concurrency-safe: `balance_before` is read from the balance upsert, then a
  separate `UPDATE … SET current_total = current_total + $2` runs. Two near-simultaneous messages in
  one group can record inconsistent `balance_before` / `balance_after` (the running total stays
  correct, the ledger chain does not). Lock the balance row `FOR UPDATE` first.
- [ ] **[bug]** Duplicate message handling relies on a pre-`SELECT` then insert; a real race hits the
  `message_id` UNIQUE constraint, throws, and the handler logs an error instead of returning
  `{duplicate:true}` like allocation does. Use `INSERT … ON CONFLICT DO NOTHING`.
- [ ] **[incomplete]** No dashboard visibility for balances or transactions at all.

### `src/services/category-repository.js`
- [ ] **[incomplete]** No UI or CLI to add/rename/deactivate categories or aliases — groups and
  admins both have management screens, categories only change via a migration.
- [ ] **[dead]** Category-order `CASE` block is copy-pasted here, in `dashboard.js`,
  `usage-reporting.js`, and `group-limit-repository.js`. Extract one shared constant/helper.

### `src/services/limit-window.js`
- [ ] **[risk]** Hardcoded `+5h` Pakistan offset with no DST handling — correct today, silently wrong
  if Pakistan reinstates DST. Consider `Intl` / `Asia/Karachi` like the dashboard already uses.
- [ ] **[risk]** A `window_started_at` in the future (clock skew / manual edit) yields a future
  window start and blocks all allocations until it passes.

### `src/services/group-limit-repository.js`
- [ ] **[bug/UX]** `used_last_24h` is labelled "Used in current cycle" in the UI but is actually
  "used since window start" (could be < or > 24h after a manual reset). Align label and value.
- [ ] **[dead]** Fourth copy of the category-order `CASE` expression.

### `src/services/group-rate-limiter.js`
- [ ] **[incomplete]** In-memory only — not shared across instances, resets on restart. Fine for a
  single process; document or move to Postgres/Redis if scaling.
- [ ] **[risk]** Group keys are never evicted from the `Map` (arrays are pruned on access but the
  key stays) — unbounded growth with many groups.

### `src/services/admin-repository.js`
- [ ] **[bug]** `seedFromCsv` calls `this.pool.query('BEGIN')` / `'COMMIT'` / `'ROLLBACK'` directly on
  the pool, so the statements may run on different pooled connections and the transaction is
  meaningless. Check out a client (`pool.connect()`), matching the pattern used elsewhere.

### `src/services/stock-monitor.js`
- [ ] **[incomplete]** `LOW_STOCK_THRESHOLDS` has no entries for `68k`, `224k`, `1.4m` (added in
  migration 007) — they never trigger a low-stock alert.
- [ ] **[incomplete]** No debounce/cooldown — once a category is below threshold, every successful
  delivery re-posts the alert to `LOW_STOCK_ALERT_GROUP_ID`.

### `src/services/usage-reporting.js`
- [ ] **[dead]** Fifth copy of the category-order `CASE` expression.
- [ ] **[risk]** `inventory()` / `groupUsage()` re-run `(SELECT reset_at FROM usage_reporting_state …)`
  as a scalar subquery per group row — negligible now, worth a join if categories grow.

### `src/services/csv-importer.js` / `src/services/code-importer.js`
- [ ] **[risk]** `ON CONFLICT(code) DO NOTHING` enforces global code uniqueness across all categories;
  the same code string under a second category is silently skipped as a duplicate.
- [ ] **[incomplete]** `code-importer` only strips numbered-list prefixes with a trailing space
  (`1. CODE`); `1.CODE` is treated as the literal code.
- [ ] **[incomplete]** No size/row cap beyond the 250 KB body limit (dashboard) — a large CSV via the
  CLI is read fully into memory.

### `src/app.js`
- [ ] **[risk]** The catch-all error handler echoes `error.message` (escaped) to the client — a DB
  error can leak schema/constraint names.

### `src/routes/dashboard.js`
- [ ] **[bug]** `GET /dashboard/audit` is registered twice. The first handler (group usage report)
  always responds, so the second (full event ledger with `today`/`week`/`month` filters) is
  unreachable. The Inventory page's "Open full ledger →" and the nav "Usage" link both land on the
  group-usage page. Split the routes (e.g. `/dashboard/ledger`) and fix the nav in `html.js`.
- [ ] **[bug/UX]** `/dashboard/codes` column headers say "Created UTC" / "Used UTC" but `timestamp()`
  formats in `Asia/Karachi`. Relabel to PKT (the audit page already says "PKT timestamp").
- [ ] **[incomplete]** No `/login` throttling or lockout — unlimited password guesses against the
  single admin account.
- [ ] **[risk]** Filter query params (`req.query.category`, `status`, …) can arrive as arrays and are
  `String()`-coerced into `"a,b"`; harmless (escaped) but sloppy. Validate against known values.
- [ ] **[incomplete]** No screen for the calculation ledger / balances.

### `src/middleware/security.js`
- [ ] **[risk]** `safeEqual` compares byte length before `timingSafeEqual`, leaking credential length
  via timing. Hash both sides to a fixed length first.

### `src/utilities/logger.js`
- [ ] **[incomplete]** No log-level filtering at all — every `info`/`warn`/`error` always prints.
  (The dead `LOG_LEVEL` env var was removed; add real level support if wanted.)
- [ ] **[risk]** Key scrub is substring-based on top-level keys only: a benign field like `groupCode`
  is dropped, and nested objects are not scrubbed. `Error` is flattened to `.message`, so stack
  traces never reach the logs.

### `src/utilities/mask.js`
- [ ] **[bug]** For 5–6 character codes, `slice(0,3)` + `slice(-3)` overlap and together reveal the
  entire code (e.g. `"abcde"` → `"abc" … "cde"`). Codes ≤ 4 chars are fully starred; everything in
  between is effectively unmasked. Fix the short-code branch.

### `scripts/`
- [ ] **[bug]** `run-db-integration.js` spawns `tests/allocation.integration.test.js`, which does not
  exist — `npm run test:integration` fails immediately.
- [ ] **[incomplete]** `migrate.js` has no down/rollback path and no "run one migration" mode.
- [ ] **[risk]** `manage-groups.js detect` waits on the QR indefinitely if the session is not
  authenticated and never times out.

### Docker
- [ ] **[incomplete]** `docker-entrypoint.sh` only clears Chromium singleton locks; it does not run
  migrations, so `docker compose --profile app up` against a fresh DB crash-loops until
  `scripts/migrate.js` is run by hand. Auto-migrate on boot or make the ordering explicit in docs.

### Cross-cutting
- [ ] **[incomplete]** Test coverage is `calculator.test.js` only (see list below).
- [ ] **[incomplete]** README "Project map" and test/ vs tests/ references don't match the repo.
- [ ] **[incomplete]** The calculation feature is entirely undocumented in the README.

---

## Test coverage to add

- [ ] `parseCommand` — `/tag`, `830x5` / `830 × 5` / `830 x 5`, `/stock <cat>`, invalid forms.
- [ ] `CodeAllocationService.allocate` — concurrency (`SKIP LOCKED` disjointness), dedup replay,
  unauthorized group, out-of-stock, partial allocation, `group_category_limits` clamping.
- [ ] `CalculationRepository.record` — balance math, `balance_before`/`after` chain, message-id dedup.
- [ ] `limit-window.js` — 12:00 PKT boundary, multi-day gaps, manual reset stepping.
- [ ] `normalizeCategory` / `normalizePhone` (`@lid`, `+92`, `00` forms).
- [ ] `maskCode` — short, hyphenated, and long codes.
- [ ] `csv-importer` / `code-importer` — bad rows, dupes, inactive category, rollback on DB error.
- [ ] `group-rate-limiter`.

---

## Done

- **2026-09-02** — Removed dead code/config: `multer` dependency + `uploads/` dir + its
  `.gitignore` / `.dockerignore` entries; `MAX_CSV_SIZE_MB` / `config.maxCsvSizeMb`; `LOG_LEVEL`
  env var; `makeAdminChecker` + `CATEGORY_PATTERN` export in `normalization.js`; the unused
  "LATEST BLOCKS" branch (`content` / `recent` / `recentBlocks`) in `GET /dashboard`; the
  `reserved` option in the `/dashboard/codes` status filter. `npm test` green, `package-lock.json`
  synced.
- **2026-09-02** — Added `/calculate` command: responds only in the group configured via
  `CALCULATION_REPORT_GROUP_ID` and replies with every group's running calculation balance
  (`calculation_balances.current_total`) plus a grand total. Group names are captured from
  `message.getChat()` on each calculation and stored in `calculation_balances.group_name`
  (**migration `012_calculation_balance_group_name.sql` — run `npm run migrate`**), since
  calculations are not gated by `allowed_groups`. Files: `src/config.js`, `src/utilities/commands.js`,
  `src/services/calculation-repository.js` (`record` + `listBalances`), `src/commands/message-handler.js`
  (`resolveGroupName`), `src/index.js`, `.env.example`, `migrations/012_*.sql`.
  Tests: `test/calculate-command.test.js`.
