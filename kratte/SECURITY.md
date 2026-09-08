# Security notes

## Reporting

Do not publish vulnerabilities, tokens, or customer data in a public issue. Contact the deployment owner through their private support/security channel. Include a minimal reproduction and the response's `X-Request-ID`, not passwords or live customer payloads. A public security-contact address has not been configured in this sandbox.

## Trust boundaries

- The browser never determines workspace ownership. Authenticated sessions map to an owner on the server.
- Session tokens are random, stored as SHA-256 digests in PostgreSQL, and sent in HttpOnly cookies. Passwords use versioned async scrypt hashes; legacy hashes remain readable and are upgraded on sign-in.
- New sign-ins rotate the current session. Password changes revoke prior sessions in the same transaction. Sensitive writes recheck session validity after taking the workspace lock.
- PostgreSQL rate-limit counters survive process restarts and work across replicas. Production identities are keyed with `SECURITY_SECRET`; raw emails/IP addresses are not stored in those counters.
- JSON inputs are size/depth/type bounded. Only allowlisted fields reach domain writes; prices and totals are authoritative server-side values.
- Explicit errors are safe for users. Unexpected errors are replaced with a generic response and a support reference.
- CSP uses a per-response script nonce. Inline style attributes remain allowed for charts/masonry; arbitrary inline scripts and `eval` are not allowed in production builds.
- Remote product images are loaded directly by the browser with `next/image` in unoptimized mode. They are not fetched through a server-side optimizer, avoiding an arbitrary-URL image proxy. Review tracking/privacy implications of external image hosts before enabling arbitrary URLs for customers.

## Deployment requirements

`APP_MODE=production` is separate from Next.js's build mode. It requires `APP_ORIGIN` and a strong `SECURITY_SECRET`; disables auto demos/seeding/embedding by default; and enables verified DB TLS by default. Read [the runbook](docs/PRODUCTION.md).

Set `TRUST_PROXY` only when your proxy rewrites forwarded headers and the application cannot be reached through an untrusted bypass. Protect the service with ingress limits. Do not expose PostgreSQL to the public internet. Use a DML-only application role and separate migration/backup roles.

## Scope and remaining work

This hardening is not an independent penetration test or compliance certification. Staff-role authentication, MFA, email verification/recovery, payment-provider integration, managed monitoring, and backup automation remain deployment/product work. Existing demo transactions are illustrative, not an auditable opening ledger. Audit rows are append-only through the app; enforce DB privileges and immutable export storage for stronger tamper resistance.

Run `npm audit --omit=dev` for the deployed dependency graph. Development-tool findings should also be reviewed; do not blindly force a major downgrade of the migration tool to satisfy an automated advisory suggestion. CI uses a clean install, and the standalone runtime excludes build/test tooling that is not traced by the application.
