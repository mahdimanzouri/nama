# Security

**Status:** Implemented in part (M7, extended at M12): authentication, RBAC,
tenant isolation, credential encryption, SSRF range blocking, per-source query
limits, login/query rate limiting, the realtime connection cap, readiness and
metrics endpoints, request IDs and log redaction, enforced idempotency keys and
an authorized audit read/export API are live. DNS pinning and the production
review remain open (see technical debt). Reviewed again before production.

## Trust boundaries

```text
[ Browser: web app + SDK ]        -- untrusted input -->
[ Embedded host application ]     -- embed token -->
[ Fastify API ]                   -- trusted code -->
[ PostgreSQL ]                    -- credential boundary -->
[ Data-source plugins ]           -- constrained egress -->
[ External systems ]
```

- The browser is untrusted for every decision except rendering.
- The API is authoritative for authentication, authorization, tenant scope,
  validation and limits.
- The database enforces tenant scope again through RLS.
- Server-side plugins are trusted code but constrained by context, limits and
  egress policy.
- Visualization plugins are trusted installed code and run with application
  privileges (ADR-006).

## Assets

Dashboard configurations, credentials, API/session/embed tokens, audit logs,
query results (which may contain sensitive operational data), and availability of
the query/realtime path.

## Threat register

| # | Threat | Vector | Impact | Controls |
| --- | --- | --- | --- | --- |
| 1 | SSRF / internal network access | REST/MQTT/SQL data-source config | Access internal services, metadata endpoints | Private-range blocklist, DNS re-check after resolution and redirects, scheme allowlist, TLS verification, egress controls (ADR-010, plugin contract) |
| 2 | DNS rebinding | Hostname resolving to a public IP, then private | Bypass SSRF block | Resolve and pin the checked IP for the request; re-check redirects |
| 3 | Credential leakage | Logs, errors, API responses, dashboard JSON | Full data-source compromise | Encrypt at rest (`key_version`), decrypt just-in-time, never serialize, redact logs, no credentials in config |
| 4 | Cross-tenant IDOR | Guessed IDs or missing filter | Tenant data exposure | Service scoping + RLS + membership resolution + cross-tenant CI tests (ADR-008) |
| 5 | Embed-token escalation | Token scope or issuer permissions | Access to other dashboards or sources | Intersection with issuer's current permissions, expiry, revocation, per-subscription re-check (ADR-009) |
| 6 | Plugin code execution | Malicious third-party widget | Application compromise | Trusted install only, no remote loading, error boundaries, review checklist; sandbox deferred (ADR-006) |
| 7 | Unbounded query | Expensive SQL or huge result | Resource exhaustion, cost | 15 s timeout, 10,000 rows / 5 MiB cap, per-user query rate limit, in-flight query cap, read-only credentials, statement timeout |
| 8 | Session theft / fixation | XSS, token exposure, session fixation | Account takeover | httpOnly/Secure/SameSite cookie, hashed session IDs, rotation on login/privilege change, revocation (ADR-007) |
| 9 | CSRF | Cross-site mutation | Unauthorized changes | Double-submit CSRF token on mutations; SameSite=Lax cookies |
| 10 | Password brute force | Login/reset endpoints | Account takeover | Argon2id, fixed-window login rate limit per IP and account, generic error messages |
| 11 | SQL injection | Raw SQL or structured query compile | Data disclosure/modification | Parameterized compilation, server-owned dataset allowlist, raw SQL admin-only, read-only credentials, audit |
| 12 | Stored XSS via config/data | Widget titles, labels, data strings | Session compromise | React escaping by default; no untrusted `dangerouslySetInnerHTML`; plugin review |
| 13 | Token in logs/referrers | URLs, error payloads | Token replay | Tokens in headers/first message, never URL; redaction; audit references token ID only |
| 14 | Supply-chain dependency | Malicious npm package | Broad compromise | License/compat review, pinned versions, lockfile, review of new dependencies |
| 15 | Secret mishandling | Committed env files, migration scripts | Production compromise | Validated env config, secrets injected at deploy, no `.env` commits, key rotation procedure |
| 16 | Duplicate mutation on retry | Client or proxy retries a timed-out create | Duplicated dashboards, sources, members or roles | `Idempotency-Key` reservation with body fingerprint; replay returns the stored response, mismatches return `409`, failures release the key |
| 17 | Audit trail exposure or tampering | Unauthorized read/export or retention abuse | Covering tracks, leaking actor activity | `organization.audit.read` permission, tenant-only paths, RLS, export audited, retention limited to a background job |

## Control matrix (planning §15.1)

| Control | Where |
| --- | --- |
| Secure authentication and sessions | ADR-007, `modules/auth` |
| Organization tenant isolation | ADR-008, RLS policies |
| Resource-level authorization | RBAC in module services |
| Server-side validation | Zod route + domain schemas |
| Rate limiting | In-process fixed-window limiter on login (per IP + account) and query execution (per user); `429 RATE_LIMITED` with `Retry-After` |
| Audit logs for sensitive actions | `modules/audit`; writes on sensitive routes, reads/exports gated by `organization.audit.read` |
| Duplicate-request protection | `Idempotency-Key` reservations with body fingerprint and stored responses (`IDEMPOTENCY_TTL_HOURS`) |
| Encrypted credentials with rotation | `data_source_credentials`, key store |
| No secrets in dashboard config | Schema rules + validation |
| Embed tokens narrowed and checked per subscription | ADR-009, realtime gateway |
| Publish authorized separately from edit | `dashboard.publish` permission |
| Per-query timeouts and limits | Query service + plugin context |
| Connection pooling and limits | Infrastructure config; global realtime connection cap (`REALTIME_MAX_CONNECTIONS`) shared by WebSocket and SSE |
| Read-only DB credentials where possible | Data-source configuration |
| Realtime per-subscription authorization | Realtime gateway |
| Revocation handling | Session, token and subscription stores |
| Import/export validation | Schema caps and migrations |
| Plugin capability restrictions | Plugin contract + registry |
| Operational visibility | `GET /healthz` (liveness), `GET /readyz` (persistence probe), `GET /metrics` (Prometheus text, optional `METRICS_TOKEN` bearer), `x-request-id` on every response |
| Secret redaction | Logger redacts `cookie`, `authorization`, `x-csrf-token` and `set-cookie` |

## Authorization model

- RBAC permissions are evaluated server-side for every request.
- Publish is a separate permission from edit.
- A dashboard viewer does **not** automatically get data-source access; query
  execution checks the viewer's effective permissions.
- Embed tokens intersect with the issuer's current permissions.
- Hiding a UI control is a usability measure, never a security control.

Permissions (initial):

```text
dashboard.read, dashboard.create, dashboard.update, dashboard.delete,
dashboard.share, dashboard.publish
datasource.read, datasource.create, datasource.update, datasource.test,
datasource.execute, datasource.admin
organization.members.manage, organization.roles.manage,
organization.audit.read
```

`organization.audit.read` is granted to owner and administrator roles and to no
default role below them; it covers both the list and CSV export endpoints.

## Audit events

At minimum: login success/failure, logout, session revocation, member invite/
remove, role change, dashboard create/delete, draft save (metadata), publish,
version restore, share change, embed-token issue/revoke, data-source create/
update/delete/test, raw SQL execution, permission denial on sensitive routes.

The trail is readable and exportable through the API (see
[api/README.md](../api/README.md)). Both routes require
`organization.audit.read`, only accept the caller's organization ID, and record
`audit.export` with the requested format and counts. Retention is enforced by a
daily job (`AUDIT_RETENTION_DAYS`, default 365); routes cannot delete events.

Audit metadata excludes credentials, token values and full query results; it may
include a query hash and row count.

## Key management

- Credential encryption uses AEAD with a managed key and `key_version`.
- Keys are never committed; rotation re-encrypts on a scheduled job or on write.
- Session-signing material (if added later) follows the same rotation policy.
- Compromise procedure: revoke sessions/tokens, rotate keys, audit access.

## Residual risks (accepted in v1)

- Trusted plugins can execute arbitrary code in the application context.
- Rate limits and the realtime connection cap are per process; a multi-instance
  deployment needs a shared store (TD-054, TD-061).
- DNS rebinding is not yet prevented: the egress guard resolves once and the
  HTTP client resolves again; redirects are refused but the address is not
  pinned (TD-052).
- The LTR-only canvas may cause user errors in RTL layouts; disclosed in UI.
- Deployment selection (ADR-011) may weaken egress control if serverless hosting
  is chosen; the decision must be reviewed against this document.
- Raw SQL remains available to `datasource.admin`; it is audited but powerful.

## Related documents

- [decisions/ADR-007-auth-transport.md](decisions/ADR-007-auth-transport.md)
- [decisions/ADR-008-tenant-isolation-rls.md](decisions/ADR-008-tenant-isolation-rls.md)
- [decisions/ADR-009-embed-tokens.md](decisions/ADR-009-embed-tokens.md)
- [decisions/ADR-010-sql-query-model.md](decisions/ADR-010-sql-query-model.md)
- [../plugins/data-source-plugin-contract.md](../plugins/data-source-plugin-contract.md)
- [backend-architecture.md](backend-architecture.md)
