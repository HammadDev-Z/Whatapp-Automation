# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A transactional WhatsApp Web bot that distributes one-time codes to authorized WhatsApp
groups, plus a server-rendered admin dashboard. All state (inventory, authorization,
dedup, audit trail, per-group limits, calculation balances) lives in PostgreSQL.
`whatsapp-web.js` is unofficial automation — expect disconnects and breakage when
WhatsApp changes; use a disposable number.

Node.js 20+, CommonJS, no build step, no TypeScript, no frontend framework.

## Commands

```powershell
npm install
docker compose up -d postgres          # local Postgres (postgres:16, db whatsapp_codes)
npm run migrate                         # apply migrations/*.sql
npm start                               # run bot + dashboard (src/index.js)
npm run dev                             # same, with --watch
npm test                                # node --test, serial
npm run check                           # syntax-check src/index.js + src/app.js only
npm run import-codes -- .\path\codes.csv   # CSV import (columns: category, code)
npm run groups -- detect|list|add <id> <name>|enable <id>|disable <id>
```

Run a single test: `node --test test/calculator.test.js` (or `--test-name-pattern "<name>"`).

The WhatsApp `LocalAuth` profile in `.wwebjs_auth/` cannot be opened twice. **Stop the
bot before running `npm run groups -- detect`**, and never run two processes that log in.

### Test state discrepancy

`npm test` currently only discovers `test/calculator.test.js`. The README and
`scripts/run-db-integration.js` reference a `tests/` directory (`allocation.integration.test.js`,
parsing/normalization/rate-limit suites, etc.) that is **not present in the repo**, so
`npm run test:integration` fails as-is. If you add integration coverage, `run-db-integration.js`
expects `tests/allocation.integration.test.js` and sets `RUN_DB_TESTS=1`.

## Architecture

### Composition

`src/index.js` is the only wiring point: it loads config, creates one `pg` Pool, instantiates
repository classes and services, builds the WhatsApp-agnostic message handler, starts the
Express app, then initializes the bot. Everything is dependency-injected via `create*` factory
functions and repo classes that take `pool` in their constructor — there are no module-level
singletons for stateful things. Tests construct handlers/services directly with fakes.

### Message flow

`src/bot/client.js` (thin `whatsapp-web.js` wrapper: QR, auth/ready/disconnected events,
single-flight reconnect) forwards every `message` to `src/commands/message-handler.js`. The
handler is pure of WhatsApp internals except the `message` object and is the real unit under test.

Two message kinds, checked in this order:

1. **Calculations** (`src/services/calculator.js`): bare arithmetic like `10+20-5`, `90.38÷5`,
   or a signed adjustment `+50` / `-12.5`. Maintains a running per-group balance
   (`calculation_balances` / `calculation_transactions`, via `CalculationRepository`) and
   replies as "AWAN E-STORE". `decimal.js` for all money math. **`x` and `×` are deliberately
   NOT multiplication** — they belong to inventory shorthand; only `*` and `÷` multiply/divide.
2. **Commands** (`src/utilities/commands.js` `parseCommand`): `/tag <cat> [Nx]`, shorthand
   `830x5` / `830 × 5`, `/help`, `/groupid`, `/stock [cat]`, `/status`, `/calculate`. Admin-only
   commands (`groupid`, `stock`, `status`) check `AdminRepository` after resolving `@lid` senders
   to real numbers. `/calculate` only responds in the single group whose ID equals
   `CALCULATION_REPORT_GROUP_ID` (config `calculationReportGroupId`); it replies with every group's
   running `calculation_balances.current_total` plus a grand total. Anywhere else it is ignored.
   Calculations are not gated by `allowed_groups` — they run in any chat the bot is in — so the
   group's display name is stored in `calculation_balances.group_name` (migration 012) for
   `/calculate` to show. It is set two ways: best-effort auto from `message.getChat()` on each
   calc (**this throws on some WhatsApp Web builds — `resolveGroupName` swallows it and returns
   null**), and the admin command `/setname <name>` (or, from the report group,
   `/setname <id>@g.us <name>`) which writes it directly via `CalculationRepository.setGroupName`.

Non-group chats, `fromMe`, unparseable messages, and duplicate message IDs never allocate.
The bot sleeps a random delay before replying (`TAG_RESPONSE_DELAY_MIN/MAX_SECONDS`; 3–6s for
calculations) to appear human.

### Allocation transaction — `src/services/code-allocation.js`

This is the authoritative concurrency and dedup logic; the pre-checks in the handler are only
optimizations. One transaction:

1. `allowed_groups ... FOR SHARE` — unauthorized if missing/inactive.
2. `INSERT processed_messages ON CONFLICT DO NOTHING` — the race-safe dedup gate.
3. If a `group_category_limits` row exists: lock it `FOR UPDATE`, upsert/lock
   `group_limit_windows`, count usage since the window start, clamp the request to what remains
   (`limit_reached` / partial).
4. `SELECT ... FROM codes WHERE status='unused' ... FOR UPDATE SKIP LOCKED LIMIT n` — concurrent
   requests get disjoint codes.
5. Mark `used` + `delivery_status='pending'`, write `audit_logs`, COMMIT.

Then: reply in the group, then `recordDelivery(success)` flips `delivery_status` to `sent` or
`failed`. **Failed/uncertain delivery keeps the code `used`** and surfaces it under
Dashboard → Alerts. Never script a `failed` → `unused` reset without human confirmation that
the code was not delivered.

### Categories

Categories and aliases are DB rows (`code_categories`, `category_aliases`), not code. Resolve
user input with `normalizeCategory()` then `CategoryRepository.resolve(alias)`. Canonical set:
`830, 2320, 5150, 13k, 27k, 56k, 68k, 224k, 1.4m` with aliases like `5k→5150`, `2$→68k`,
`10$→1.4m`. The category display order is hardcoded as a `CASE` expression duplicated across
`dashboard.js`, `category-repository.js`, and `usage-reporting.js` — update all of them together.

### Limit windows — `src/services/limit-window.js`

Per-group 24h allowances reset at 12:00 Pakistan time by default. The offset is a hardcoded
`+5h` constant (Pakistan has no DST). "Reset limit time now" (`group_limit_windows`) starts a
fresh cycle from that instant, advancing in whole-day steps. "Reset all usage counters" on the
Inventory page resets both the reporting baseline (`usage_reporting_state`) and every group's
limit window in one transaction.

### Dashboard — `src/app.js`, `src/routes/dashboard.js`

Server-rendered HTML built by string concatenation through `layout()` in
`src/utilities/html.js` — no template engine, no client JS. Session auth via `express-session`
+ `connect-pg-simple` (`dashboard_sessions` table), single admin from `ADMIN_USERNAME` /
`ADMIN_PASSWORD`. Every POST requires a `_csrf` token (`src/middleware/security.js`,
`verifyCsrf`); pass `req.session.csrfToken` into `layout(title, content, csrfToken)`. Code
values are always masked via `src/utilities/mask.js` before rendering.

Known quirk: `dashboard.js` registers `GET /dashboard/audit` twice. The first handler (group
usage report) always responds, so the second (full event ledger with period filters) is
currently unreachable.

### Migrations

Plain SQL in `migrations/NNN_name.sql`, applied by `scripts/migrate.js` in filename-sort order,
each wrapped in its own transaction, tracked by filename in `schema_migrations`. Add new files
with the next zero-padded number; never edit an applied migration.

## Conventions

- Some files (`index.js`, `app.js`, `bot/client.js`, `middleware/security.js`, `logger.js`) are
  written in a deliberately dense, near-single-line style; most service/route files are
  conventionally formatted. Match the file you are editing.
- `logger.js` **drops any log field whose key matches `/code|password|secret|credential/i`** and
  flattens `Error` to its message. Do not name a field `code` and expect to see its value; logs
  are one-line JSON by design.
- `config.js` enforces production guards (strong `ADMIN_PASSWORD`, `SESSION_SECRET` ≥ 32 chars,
  `LOW_STOCK_ALERT_GROUP_ID` must end `@g.us`, delay max ≥ min). Numeric env vars must be
  positive.
- All SQL goes through parameterized `pool.query` / a checked-out client for transactions.
- Never commit `.env`, inventory CSVs (`codes*.csv`), `.wwebjs_auth/`, or `*.log` (all in
  `.gitignore`). `.wwebjs_auth/` + `.wwebjs_cache/` are the live WhatsApp session — treat as
  secret and persistent.

## Docker

`docker compose up -d postgres` for DB-only dev. Full stack: create `.env`, then
`docker compose run --rm app node scripts/migrate.js` and `docker compose --profile app up -d --build`.
The image installs system Chromium; `PUPPETEER_EXECUTABLE_PATH` points puppeteer at it (set it
to a local Chrome/Edge path on Windows and use `PUPPETEER_SKIP_DOWNLOAD=true` during install).
Named volumes `postgres_data`, `whatsapp_auth`, `whatsapp_cache` hold all durable state — never
`docker compose down -v` unless you intend to wipe inventory and the WhatsApp login.
