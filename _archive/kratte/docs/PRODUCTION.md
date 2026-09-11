# Production runbook

## 1. Configure the deployment, not just the build

Use Node.js 22+ and a supported PostgreSQL release (tested with 16). Inject credentials through the hosting platform's secret manager; never copy `.env` into an image.

Required production settings:

| Setting | Purpose |
| --- | --- |
| `APP_MODE=production` | Fail-closed production defaults |
| `APP_ORIGIN=https://shop.example.com` | Canonical origin for CSRF checks |
| `SECURITY_SECRET` | At least 32 random bytes; hashes rate-limit identities |
| `DATABASE_URL` | Application DB role connection string |
| `DATABASE_SSL=true` | Certificate-verified TLS; production default |

Generate the security secret with a cryptographic generator, for example `openssl rand -hex 32`. Never log it. Set `DATABASE_CA_CERT` if the database uses a private CA. Disabling TLS is an explicit override intended only for a secured private/local network after infrastructure review.

Other defaults in production:

- `ALLOW_DEMO_WORKSPACES=false`
- `SEED_NEW_ACCOUNTS=false`
- `EMBEDDED_PREVIEW=false`
- `TRUST_PROXY=false`
- `ALLOW_SIGNUP=true` (set false for an invitation-only rollout)

The sandbox defaults to `APP_MODE=preview` so the demo and iframe remain usable. Startup logs identify this mode. Do not expose a public customer deployment with preview defaults.

### Proxies and embedding

Terminate TLS at your trusted load balancer. It must **overwrite**, not append untrusted values to, forwarded host/protocol headers. Only then set `TRUST_PROXY=true` and `TRUST_PROXY_HOPS` to the trusted hop count for client-IP extraction. Account-based throttling remains effective when proxy trust is disabled; network requests share a conservative bucket in that configuration.

The embedded-preview cookie uses CHIPS/Partitioned with `Secure`, `HttpOnly`, and `SameSite=None`. Normal production mode uses `SameSite=Lax`. For a real embedded deployment, set `EMBEDDED_PREVIEW=true` and exact comma-separated HTTPS origins in `ALLOWED_FRAME_ORIGINS`. Test the parent app and browsers you support. Top-level and embedded sessions may be partitioned separately by the browser.

Configure your ingress with request-body limits, header limits, connection/read timeouts, and a global rate limit. Application parsing is bounded to 128 KiB (16 KiB for auth) and a 10-second body-read deadline, but application controls do not replace ingress DDoS protection.

## 2. Database access and migrations

Use separate roles:

- **Application role:** DML access only to the application tables; no schema/role/database creation.
- **Migration role:** DDL privileges, used only by the release job.
- **Backup role:** only the permissions needed by the backup system.

For the audit table, grant the application role `SELECT, INSERT`, not `UPDATE, DELETE`. Administrative DB owners can still alter history; send audit exports to immutable storage if tamper evidence is a compliance requirement.

Migration command:

```sh
node --conditions=react-server --import tsx scripts/migrate.ts
```

`MIGRATION_DATABASE_URL` can override the connection for this job. The runner holds a PostgreSQL advisory lock on a pinned connection, applies the checked-in Drizzle migrations transactionally, and can be run repeatedly. Do **not** run migrations during every app request or replica startup.

### Adopting an original prototype database

1. Take a backup and verify it is restorable.
2. Compare the existing schema and foreign keys with `drizzle/0000_baseline.sql`.
3. Run `scripts/migrate.ts --adopt-existing` with the same Node flags above.
4. The runner verifies baseline columns/types/nullability before recording the baseline; it then applies only the additive hardening migration.
5. A constraint or duplicate-SKU/order failure aborts migration. Resolve the data deliberately; never reset or delete production tables to make a migration pass.

The first hardening migration adds indexes and validates constraints, which can lock tables. Schedule a maintenance window for existing large stores. Later large-table index changes should use a reviewed online/concurrent migration strategy. Never edit a migration after it has been applied.

### Rollback policy

Back up before release. Prefer roll-forward fixes for data changes. Roll back the application image only when its schema expectations remain compatible. Restoring a database backup can lose subsequent transactions; that is an incident decision, not an automatic deployment action.

## 3. Build and release

Use the committed lockfile:

```sh
npm ci
npm run lint
node --import tsx --test tests/unit/*.test.ts
npx next typegen
npm exec tsc -- --noEmit --pretty false
npm audit --omit=dev --audit-level=high
npm run build
```

The included CI workflow runs migrations twice on a fresh test DB, unit/security checks, and the business/inventory/reliability browser suites. Pin CI actions/images by immutable digest in your organization-managed release policy if required.

Container deployment:

```sh
docker build -t shopwise:release .
```

The Dockerfile builds a standalone Next.js server and runs as an unprivileged user. The final image excludes development tooling, source migration credentials, and environment files. Run the migration job using the source/deployment tooling image before shifting traffic to the runtime image. Runtime secrets are required: the final image defaults to production mode and refuses incomplete configuration.

The managed sandbox continues using the normal Next.js production runtime; `NEXT_STANDALONE=true` is only needed for standalone builds.

## 4. Health, logging, and operational limits

- `/api/live`: process liveness; does not touch PostgreSQL.
- `/api/health`: readiness; validates connectivity and the tables/columns required by the release. Returns non-2xx when the app is not ready.
- `X-Request-ID`: returned on API responses and error payloads for support correlation.
- Structured JSON logs include operation, status, timing, and safe error codes. Passwords, auth cookies, connection strings, request bodies, and Drizzle SQL parameters are never intentionally serialized.

Ship stdout/stderr to your logging provider. Alert on sustained readiness failures, elevated 5xx/429 rates, authentication anomalies, DB pool saturation, lock timeouts, and backup failures. Configure retention and access controls for your logs and audit records. No external monitoring account has been connected in the sandbox.

Default per-process DB pool: 10 connections, 5-second connection timeout, 10-second statement timeout, 3-second lock timeout. Budget `replica count × pool size` against your database capacity. Use a compatible connection pooler for high replica counts.

## 5. Data integrity and API contracts

- Every request is scoped to the authenticated workspace. The UI sends `X-Shopwise-Workspace`; a stale tab cannot save into a different active account.
- Full editors submit `expectedVersion`. API clients may use `If-Match: "<version>"`. Conflicts return `409 VERSION_CONFLICT`; reload and reconcile rather than automatically overwriting.
- Inventory quick edits merge only selected fields. Stock corrections include `expectedStock`.
- Use a UUID `Idempotency-Key` for writes. Reusing a key for a different payload is rejected. Successful replays return current record/stock snapshots and do not reapply stock movements or duplicate audit events.
- Idempotency records are intentionally retained. Deleting old keys would make very late retries unsafe; establish an archival/tombstone policy before changing retention.
- Order references are assigned under a workspace lock and are unique. The server uses catalog/historical unit prices, ignores client totals, and calculates totals in integer minor units.
- Currency is locked after the first sale, purchase, or expense for registered workspaces. Demo currency changes remain available. Multi-currency books and FX conversion are not implemented.

Pagination:

- `GET /api/records/inventory?limit=50&cursor=...` returns `{records, nextCursor}`.
- The same contract applies to other resource collections.
- `GET /api/records/:resource/:id` returns a record and its version ETag.
- `GET /api/audit?limit=50&cursor=...` returns `{events, nextCursor}`.
- Page sizes are 1–200. Cursors do not authorize access; ownership checks always apply.

The existing UI uses a consistent repeatable-read workspace snapshot. It is bounded by `WORKSPACE_SNAPSHOT_LIMIT` (default 10,000 records) and 16 MiB serialized size. Oversized workspaces fail explicitly rather than showing incomplete financial totals. Before onboarding larger stores, move the UI to server-side aggregates/pagination and load-test realistic transaction volume. Simply raising limits is not a scaling strategy.

## 6. Maintenance and backups

Schedule hourly:

```sh
node --conditions=react-server --import tsx scripts/maintenance.ts
```

Each run deletes at most 1,000 expired sessions and 1,000 stale rate-limit buckets. Runs are advisory-lock protected. Repeat more frequently if needed.

Optional demo cleanup:

```sh
node --conditions=react-server --import tsx scripts/maintenance.ts --prune-expired-demos
```

This explicitly deletes at most 20 demo workspaces older than 30 days that have no active sessions. Registered accounts are never selected. Demo deletions cascade to their demo records. Take backups first and review your retention policy.

Enable managed PostgreSQL backups and point-in-time recovery. Encrypt backup storage, restrict access, retain off-site copies, and run scheduled restore drills into an isolated environment. CSV exports are **not** a substitute for a complete database backup. Backup credentials/schedules are infrastructure-specific and are not enabled here.

## 7. Before accepting real customers

- Run the release/security suites against staging and verify embedded login if applicable.
- Verify secrets, HTTPS, proxy trust, CSP frame origins, and DB least privilege.
- Perform a backup/restore drill and verify alert delivery.
- Add email verification/recovery and MFA if required by your access/security policy.
- Implement authenticated multi-user roles before granting staff account access; the existing team directory is not RBAC.
- Connect and verify a real billing provider before charging subscriptions.
- Review tax/accounting, privacy, data retention, accessibility, and local legal requirements.
- Commission an independent security review and load test for your expected workload.
