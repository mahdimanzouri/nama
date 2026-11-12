# Backend Architecture

**Status:** Proposed (M0). Topology-neutral pending
[ADR-011](decisions/ADR-011-deployment-topology.md).

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
  → business validation (Zod, caps, ownership)
  → handler
  → audit event (for sensitive actions)
  → commit
  → response envelope
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

- Retryable `POST` endpoints accept `Idempotency-Key`.
- The key is stored with the request hash and the response for a bounded window
  (proposed 24 hours), scoped to the authenticated principal.
- Replaying the same key with the same payload returns the stored response; a
  different payload is rejected with `409`.

## Realtime gateway

- Mounted in the same process in v1; behind a `RealtimeGateway` interface.
- Authenticates connections and each subscription (ADR-004).
- Owns subscription registry, sequence assignment, replay buffers and throttling.
- Authorizes through the `dashboards` and `data-sources` services.
- Cross-instance fan-out (Redis) is added only when a second instance exists.

## Eventual jobs

These are module services invoked by a scheduler or queue, not cron logic in
route handlers:

- Dashboard version pruning (last 50 per dashboard).
- Audit-log retention pruning (default 365 days).
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

## Observability

- Structured JSON logs with request ID, organization ID, user ID, route, latency
  and outcome. Secrets and tokens are never logged.
- Health endpoints: liveness and readiness (database reachable, migrations
  current).
- Metrics: request latency/error rate, query duration/rows/truncation, active
  realtime connections/subscriptions, reconnects, auth failures.
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
