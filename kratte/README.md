# Shopwise

A Next.js App Router + PostgreSQL/Drizzle workspace for local retail and wholesale operations. The existing dashboard and visual inventory board are unchanged by the production-hardening work.

## Quick start

Requirements: Node.js 22+, PostgreSQL 16+, npm.

1. `npm ci`
2. Copy `.env.example` to `.env` and set `DATABASE_URL`.
3. `node --conditions=react-server --import tsx scripts/migrate.ts`
4. `npm run dev`

For a database created by the original prototype, review the migration baseline and run the migration command **once** with `--adopt-existing`. Do not use this flag on unrelated databases. Back up production data first.

## Quality checks

```sh
npm run lint
node --import tsx --test tests/unit/*.test.ts
node --conditions=react-server --import tsx --test tests/integration/*.test.ts
npx next typegen
npm exec tsc -- --noEmit --pretty false
npm run build
```

Against an already running test/preview server:

```sh
node scripts/verify-production.mjs
node scripts/verify.mjs
node scripts/verify-inventory-board.mjs
node scripts/verify-reliability.mjs
```

Set `TEST_BASE_URL` for a different host. Set `PREVIEW_URL` when running the reliability suite to include the cross-site iframe tests. These tests create isolated demo/test workspaces: **do not run them against real customer accounts**.

## Focused interface

The workspace defaults to a quieter presentation without removing tools:

- The dashboard shows four metrics, one revenue chart, a review queue, and recent orders. **More insights** reveals channels and bestsellers; the choice is saved to the workspace.
- Inventory keeps its photo board. The **More inventory actions** menu contains export, bulk selection, card size, and the optional stock overview. Sorting and price/supplier controls are under **Filters**.
- Other resource tables offer **Show summary** on demand. All resource links remain in the sidebar; plan management is in the account menu and Settings.
- Action menus support arrow keys, Home/End, Escape, and focus restoration. Inventory collection tabs also support keyboard navigation.
- Less-used screens are loaded on demand. Preference writes are ordered so rapid changes cannot replace newer state with an older response.

Run `node scripts/verify-focused-ui.mjs` against a test server for disclosure, persistence, accessibility, and mobile-layout checks.

## Production changes

- Async, memory-hard scrypt passwords with bounded concurrency; legacy hashes are upgraded at successful sign-in.
- PostgreSQL-backed rate limiting shared across application instances.
- Atomic sign-up/demo conversion, password changes, session rotation, and revocation.
- Origin/fetch-metadata protection, bounded JSON requests, strict type validation, and safe error messages.
- Per-request support IDs and structured logs that exclude secrets, SQL parameters, and customer payloads.
- Nonce-based script CSP and standard security headers; explicit production embedding allowlists.
- Database constraints/indexes for unique SKUs, unique order references, valid stock, and tenant-scoped pagination.
- Transactional order sequences, cent-exact totals, authoritative catalog pricing, stock protections, and retry-safe writes.
- Optimistic version checks on full edit forms and `If-Match` support for API consumers.
- Append-only-through-the-application audit events committed with their data changes.
- Consistent, bounded workspace snapshots; keyset-paginated record and audit APIs.
- Database connection/query/lock timeouts, separate readiness/liveness probes, migrations, CI, and a non-root standalone Docker image.

## Deployment

Read [the production runbook](docs/PRODUCTION.md) and [security notes](SECURITY.md). A successful build is not the same as a configured production deployment.

**The sandbox intentionally stays in preview mode.** Real deployments must set `APP_MODE=production`, an HTTPS `APP_ORIGIN`, and a random `SECURITY_SECRET` of at least 32 bytes. Production defaults turn off automatic demos, seed data for new accounts, and unapproved embedding.

## Layout

- `src/app/api/`: thin authenticated route handlers
- `src/lib/auth.ts`, `passwords.ts`, `security.ts`, `rate-limit.ts`: session and request security
- `src/lib/validation.ts`, `money.ts`, `store.ts`: business rules and transactional writes
- `src/lib/workspace.ts`, `pagination.ts`: consistent reads and workspace settings
- `src/db/`: schema, bounded connection pool, and transaction types
- `drizzle/`: checked-in migration history; never edit an applied migration
- `src/components/`: client UI and optimistic state management
- `scripts/`: migration, maintenance, and end-to-end verification
- `tests/`: domain/security and database invariant tests

## Deliberate limitations

The current product is a **single-owner workspace**. Team entries are a staff directory, not invited authenticated users or role-based access control. Paid billing, email verification/password recovery, MFA, tax engines, and external fulfillment are not configured. The financial model uses two decimal places and is not a general ledger or jurisdiction-certified accounting package. These capabilities require separate implementation/configuration before promising them to customers.
