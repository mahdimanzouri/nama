# Backend Architecture

**Status:** Accepted (M0). Implements
[ADR-011](decisions/ADR-011-deployment-topology.md): a self-hosted Docker
deployment with an in-process realtime gateway behind an interface.

## Strategy

A single independently deployed **Fastify modular monolith**:

- One API application with clear module boundaries.
- Query execution isolated behind the data-source plugin interface.
- Realtime gateway isolated behind an interface.
- Shared infrastructure for database, logging and configuration.
- Ability to extract workers/services later without changing module contracts.
- No microservices in v1.

## Module layout

```text
apps/api/src/
├── modules/
│   ├── auth/                # login, logout, sessions, CSRF
│   ├── users/               # profile, preferences
│   ├── organizations/
│   ├── memberships/
│   ├── roles/               # roles, permissions, assignments
│   ├── dashboards/          # CRUD, draft, publish, shares
│   ├── dashboard-versions/  # list, restore, pruning
│   ├── data-sources/        # metadata, credentials, test, schema
│   ├── queries/             # validate, execute, cancellation
│   ├── realtime/            # /ws/v1 gateway, subscriptions
│   └── audit/
├── plugins/                 # postgres, mysql, rest, mqtt
├── infrastructure/
│   ├── database/            # Prisma client, transaction helpers, RLS context
│   ├── websocket/
│   ├── cache/               # introduced only when measured
│   ├── queue/               # introduced only when measured
│   └── logging/
├── config/                  # validated environment configuration
└── server.ts
```

Each module has:

```text
routes.ts        # HTTP schema (Zod/TypeBox) and route registration
service.ts       # business rules, authorization checks, transactions
repository.ts    # SQL/Prisma queries, always organization-scoped
schemas.ts       # module-local request/response schemas
```

## Cross-module rules

- Modules call other modules' **services**, never their repositories.
- A module owns its tables. Reading another module's table directly is forbidden.
- Shared value types live in `@nama/dashboard-types`; shared runtime utilities in
  `infrastructure/`.
- `dashboards` may ask `queries` to validate a widget query, but `queries` does
  not write dashboard rows.
- `realtime` asks `dashboards` and `data-sources` for authorization decisions; it
  does not duplicate RBAC logic.
- No module imports `apps/web`.

## Request pipeline

```text
request
  → request ID + structured log context
  → route schema validation (shape only)
  → session or embed-token authentication
  → active organization resolution (membership check)
  → transaction begins
  → SET LOCAL app.organization_id / app.user_id
  → RBAC permission check (resource-level)
  → rate limit where configured (login, query execution)
  → idempotency reservation where an `Idempotency-Key` is supplied
  → business validation (Zod, caps, ownership)
  → handler
  → audit event (for sensitive actions)
  → commit
  → response envelope (+ stored response for idempotent replays)
```

Error mapping:

| Condition | HTTP |
| --- | --- |
| Missing/invalid session | `401` |
| Authenticated but not permitted | `403` |
| Resource outside tenant or absent | `404` |
| Validation failure | `422` with field paths |
| Stale `If-Match` | `409` with current revision |
| Rate limited | `429` with `Retry-After` |
| Upstream data-source failure | `502`/`504` mapped from the plugin taxonomy |
| Unexpected | `500` with request ID, no internals |

## Optimistic concurrency

Save draft:

```sql
UPDATE dashboards
SET draft_config = $1,
    revision = revision + 1,
    updated_at = now()
WHERE id = $2
  AND organization_id = current_setting('app.organization_id')::uuid
  AND revision = $3
RETURNING revision;
```

Zero rows updated means either the revision is stale or the row is out of scope;
the service distinguishes by a scoped read and returns `409` with the current
revision, or `404`.

Publish (single transaction):

```sql
BEGIN;
SELECT id, draft_config, revision
FROM dashboards
WHERE id = $1 AND organization_id = current_setting('app.organization_id')::uuid
FOR UPDATE;

UPDATE dashboards
SET published_config = draft_config,
    revision = revision + 1,
    published_at = now(),
    updated_at = now()
WHERE id = $1 AND revision = $2
RETURNING revision;

INSERT INTO dashboard_versions (id, dashboard_id, organization_id, revision, config, created_by, created_at)
VALUES (..., $3, ...);
COMMIT;
```

All three steps succeed or none do. A `409` leaves data unchanged.

## Idempotency

- The create endpoints (`POST /v1/dashboards`, `POST /v1/data-sources`, member
  invites and role creation) accept `Idempotency-Key` (1–128 characters).
- A `idempotency_keys` row stores the method, route, a SHA-256 fingerprint of the
  body and, once settled, the status code and response, for
  `IDEMPOTENCY_TTL_HOURS` (default 24). It is unique per organization, principal
  and key, and protected by row-level security like every tenant table.
- The request reserves the key (`in-flight`) before the handler runs. A replay of
  the same key and payload returns the stored response with
  `idempotent-replayed: true` and performs no write; a different payload returns
  `409 IDEMPOTENCY_MISMATCH`; a still-running reservation returns
  `409 IDEMPOTENCY_IN_PROGRESS` with `retryAfterMs`.
- A failed response (`4xx`/`5xx`) releases the reservation so the caller can retry
  with the same key; the settlement runs from an `onSend` hook so it covers error
  envelopes too.
- `POST /v1/dashboards/{id}/embed-tokens` is excluded because its response holds a
  plaintext token that must never be persisted for replay.
- Dashboard writes keep `If-Match` for concurrency; idempotency only prevents
  duplicated creates and is not a substitute for the revision check.

## Audit trail

- `modules/audit` owns the `audit_logs` table and its read side.
- `GET /v1/organizations/{id}/audit-events` lists events newest first with
  `action`, `resourceType`, `resourceId`, `actorId`, `from` and `to` filters and
  standard pagination. `GET .../audit-events/export` streams the same filter as
  CSV, capped at 10,000 entries with `x-audit-export-truncated`.
- Both routes require `organization.audit.read` (owner and administrator by
  default) and only accept the caller's own organization; anything else is `404`.
- Exporting the trail is itself audited (`audit.export` with format/count
  metadata). Audit metadata never contains credentials, tokens or query results.

## Realtime gateway

- Mounted in the same process in v1 (ADR-011 Option A).
- `GET /ws/v1` upgrades are handled on the raw HTTP server so an invalid session
  or token is rejected with HTTP 401 before a socket exists; `GET /v1/stream`
  serves the SSE fallback through normal Fastify routing.
- Authenticates connections and each subscription (ADR-004, ADR-009). Embed
  sources are accepted only when a published dashboard inside the token scope
  references them, and issuer permissions are rechecked on every heartbeat.
- Owns the subscription registry, sequence assignment, replay buffers and
  throttling. Channels keyed by organization + query request share one poller;
  resume threads survive disconnects for the 60 s replay window.
- Reuses `QueryService`, so connector plugins, limits, credential decryption and
  cancellation behave exactly as on the REST path.
- Cross-instance fan-out (Redis) is added only when a second instance exists.

## Eventual jobs

These are module services invoked by a scheduler or queue, not cron logic in
route handlers:

- Dashboard version pruning (last 50 per dashboard).
- Audit-log retention pruning (default 365 days) and expired idempotency keys;
  both run per organization inside a tenant transaction because row-level
  security rejects an unscoped delete.
- Session expiry cleanup.
- Embed-token expiry cleanup.

Queue/cache infrastructure is introduced only when measurements justify it.

## Configuration

- All environment variables are validated at startup with Zod.
- Secrets are injected at deploy time, never committed.
- Credential-encryption keys live in a managed key store with `key_version`
  rotation support.
- Required configuration includes database URL, session secret, credential-KEK,
  allowed origins, and rate-limit defaults.
- M12 knobs: `REALTIME_MAX_CONNECTIONS` (default 500, shared by WebSocket and
  SSE), `LOGIN_RATE_LIMIT` (default 30 requests per 5 minutes per IP + account),
  `QUERY_RATE_LIMIT` (default 300 requests per minute per user),
  `AUDIT_RETENTION_DAYS` (default 365) and `IDEMPOTENCY_TTL_HOURS` (default 24).

## Observability

- Structured JSON logs with request ID, organization ID, user ID, route, latency
  and outcome. The logger redacts `cookie`, `authorization`, `x-csrf-token` and
  `set-cookie`; secrets and tokens are never logged.
- Every response carries `x-request-id` (generated when the client sends none) so
  logs and client errors can be correlated.
- `GET /healthz` is liveness only; `GET /readyz` probes persistence (`SELECT 1`)
  and returns `503 SERVICE_UNAVAILABLE` when it fails.
- `GET /metrics` renders Prometheus text: HTTP request counts and latency sums,
  query executions by outcome, rate-limited requests, realtime connections and
  uptime. When `METRICS_TOKEN` is set the endpoint requires a bearer token;
  otherwise it is open to the network and must be firewalled at deploy time.
- These three endpoints are operational and intentionally outside the public
  OpenAPI contract (they are excluded from the drift check).
- Error tracking with release identity; no credentials or dashboard contents in
  payloads.

## Deployment neutrality

The module boundaries and request pipeline are independent of the hosting model.
Migrations are owned by the API and run as a release step with a rollback path;
destructive changes use expand/contract. Choosing self-hosted, hybrid or
serverless hosting requires ADR-011 to be accepted first.

## Related documents

- [overview.md](overview.md)
- [data-model.md](data-model.md)
- [security.md](security.md)
- [realtime-protocol.md](realtime-protocol.md)
- [decisions/ADR-007-auth-transport.md](decisions/ADR-007-auth-transport.md)
- [decisions/ADR-011-deployment-topology.md](decisions/ADR-011-deployment-topology.md)
