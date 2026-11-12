# API Conventions

**Status:** M7 implemented (2026-11-12). [`openapi.yaml`](openapi.yaml) describes
the contract; operations marked `x-m0-status: implemented` are served by
`apps/api` today and verified by `pnpm verify:openapi`.

## Implemented endpoints (M7)

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/v1/auth/login` | Argon2id credentials; sets `nama_session` + `nama_csrf` cookies |
| `GET` | `/v1/auth/session` | Current user, organization, roles and permissions |
| `POST` | `/v1/auth/logout` | CSRF-protected; revokes the session and clears cookies |
| `GET` | `/v1/dashboards` | Tenant-scoped list, `page`/`pageSize` |
| `POST` | `/v1/dashboards` | Creates an empty `schemaVersion: 1` draft at revision 1 |
| `GET` | `/v1/dashboards/{id}` | Published configuration and permissions only; never the draft |
| `PATCH` | `/v1/dashboards/{id}` | `If-Match` required; updates name/metadata title without touching the draft |
| `DELETE` | `/v1/dashboards/{id}` | `If-Match` required |
| `GET` | `/v1/dashboards/{id}/draft` | Editor-only draft |
| `PUT` | `/v1/dashboards/{id}/draft` | `If-Match` required; validates the full config |
| `POST` | `/v1/dashboards/{id}/publish` | Copies draft, increments revision, records version |
| `GET` | `/v1/dashboards/{id}/versions` | Paginated version summaries, newest first, retained to 50 |
| `POST` | `/v1/dashboards/{id}/restore` | `If-Match` required; copies a version into the draft and increments revision |
| `GET` | `/v1/dashboards/{id}/shares` | Tenant-scoped shares |
| `PUT` | `/v1/dashboards/{id}/shares` | Replaces shares; `If-Match` required |
| `POST` | `/v1/dashboards/{id}/embed-tokens` | Published dashboards only; returns the plaintext token once |
| `DELETE` | `/v1/dashboards/{id}/embed-tokens/{tokenId}` | Revokes a token |
| `GET` | `/v1/data-sources` | Metadata only; credentials never returned |
| `POST` | `/v1/data-sources` | Encrypts credentials with AES-256-GCM |
| `GET` | `/v1/data-sources/{id}` | Metadata only |
| `PATCH` | `/v1/data-sources/{id}` | Metadata, credentials or status |
| `DELETE` | `/v1/data-sources/{id}` | Deletes the source and its credential row |
| `POST` | `/v1/data-sources/{id}/test` | Runs the connector test and audits `datasource.test`; unknown kinds return `501` |
| `GET` | `/v1/data-sources/{id}/schema` | Discovered datasets and fields; connectors without discovery return `501` |
| `GET` | `/v1/organizations/{id}/members` | Requires `organization.members.manage` |
| `POST` | `/v1/organizations/{id}/members` | Invites a user with roles |
| `PATCH` | `/v1/organizations/{id}/members/{memberId}` | Roles and status |
| `DELETE` | `/v1/organizations/{id}/members/{memberId}` | Self-removal returns `409` |
| `GET` | `/v1/organizations/{id}/roles` | System and custom roles |
| `POST` | `/v1/organizations/{id}/roles` | Custom role; unknown permissions rejected |
| `PATCH` | `/v1/organizations/{id}/roles/{roleId}` | System roles are immutable (`404`) |
| `DELETE` | `/v1/organizations/{id}/roles/{roleId}` | Assigned/system roles return `409` |
| `GET` | `/v1/organizations/{id}/permissions` | Caller's effective permissions |
| `GET` | `/v1/me/preferences` | Locale, theme, timezone, default organization |
| `PATCH` | `/v1/me/preferences` | Validated IANA timezone and membership |
| `POST` | `/v1/queries/execute` | Connector execution; 15 s / 10,000 rows / 5 MiB / 4-concurrent limits, truncation flagged |
| `POST` | `/v1/queries/validate` | Connector validation without execution; `200 { valid, issues }` |

With `APP_DATABASE_URL` set the API uses Postgres and enforces tenant isolation
with row-level security; without it the seeded in-memory adapter is used for
tests and demos (`/healthz` reports which adapter is active).

## Drift check

`pnpm verify:openapi` builds the app with the in-memory adapter, records every
registered Fastify route, and compares it with `openapi.yaml`:

- A served method+path missing from the spec fails the check.
- An operation marked `x-m0-status: implemented` that is not served fails.
- Every operation must declare `x-m0-status: implemented | proposed | stub`.
- `/healthz` is operational and intentionally absent from the public spec.

Run it after touching routes or the specification. It is not part of `pnpm test`
because it reads `docs/api/openapi.yaml` outside the package build graph.


## Versioning and scope

- Base path `/v1`. Breaking changes create a new major path.
- Management operations are REST; live updates use `/ws/v1`.
- `x-m0-status: implemented` is served by `apps/api`. `proposed` means the
  contract is reviewed but shapes may change until the owning milestone.
  `stub` reserves the path; detailed schemas arrive with that milestone.
- Dashboard and query shapes must match the implemented Zod schemas in
  `@nama/dashboard-types`; those schemas win any disagreement.

## Authentication

- `POST /v1/auth/login` verifies the password, creates an opaque 256-bit session
  stored hashed, and sets two cookies: `nama_session` (`httpOnly`, `Secure`
  outside localhost, `SameSite=Lax`) and `nama_csrf` (readable, same scope).
- Mutating cookie-authenticated requests send `X-CSRF-Token` with the value of
  the `nama_csrf` cookie; the API rejects mismatches with `403`.
- The web app calls the API through its own origin (`/api/*` rewrite to
  `NAMA_API_URL`), so both cookies stay first-party.
- Embedded clients use `Authorization: Bearer <embed token>`.
- Embed tokens are scoped to dashboards and never widen the issuer's
  permissions. See [ADR-009](../architecture/decisions/ADR-009-embed-tokens.md).
- The API is authoritative for authorization. UI visibility is not a control.

## Concurrency

- Every mutating **dashboard** request carries `If-Match` with the last known
  revision, formatted as a quoted integer (`"12"`).
- A stale write returns `409` with the current revision:

```json
{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Dashboard was modified by another session.",
    "requestId": "req_01J...",
    "fieldPaths": [],
    "currentRevision": 13
  }
}
```

- Publish copies the draft, increments the revision and inserts a version row in
  one transaction. There is no partial publish.
- The client never force-overwrites a newer revision.

## Idempotency

- Retryable `POST` endpoints accept `Idempotency-Key` (≤ 128 characters).
- **Not enforced yet.** The header is accepted and documented, but storage and
  replay protection are deferred (tracked in
  [technical-debt.md](../implementation/technical-debt.md)). Until then,
  dashboard writes are protected by `If-Match` rather than idempotency keys.
- The intended policy: the key is stored with a hash of the request and the
  response for a bounded window (proposed 24 hours), scoped to the authenticated
  principal; replaying the same key and payload returns the stored response and
  reusing a key with a different payload returns `409`.

## Pagination

- Lists use `page` (1-based) and `pageSize` (default 25, maximum 100).
- Responses include `pagination: { page, pageSize, total }`.
- Stable sort order is defined per endpoint; dashboards sort by `updatedAt`
  descending.

## Errors

Every error uses one envelope:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The payload failed validation",
    "requestId": "0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b21",
    "fieldPaths": ["widgets.2.config.valueField"],
    "issues": [
      {
        "code": "invalid_type",
        "path": ["widgets", 2, "config", "valueField"],
        "message": "Expected string, received number"
      }
    ]
  }
}
```

Rules:

- `code` is stable and machine-readable; `message` is human-readable and may be
  localized by the client.
- `fieldPaths` is present for validation errors and never contains free text.
- `issues` carries structured, array-indexed validation detail.
- `currentRevision` is present on `409 REVISION_CONFLICT` so the client can
  reload the latest draft.
- `requestId` correlates with server logs and audit records.
- `retryAfterMs` is present for rate limits and transient upstream failures.
- Internal details, credentials, stack traces and query text are never returned.

Common codes:

| Code | HTTP | Meaning |
| --- | --- | --- |
| `UNAUTHENTICATED` | 401 | Missing or expired session/token |
| `FORBIDDEN` | 403 | Authenticated but not permitted |
| `NOT_FOUND` | 404 | Absent or outside tenant |
| `REVISION_CONFLICT` | 409 | Stale `If-Match` |
| `IDEMPOTENCY_MISMATCH` | 409 | Same key, different payload |
| `VALIDATION_FAILED` | 422 | Domain validation with field paths |
| `CONFIG_TOO_LARGE` | 413 | Over 1 MiB or 100 widgets |
| `RATE_LIMITED` | 429 | Retry after the hint |
| `DATASOURCE_UNREACHABLE` | 502 | Upstream connection failure |
| `QUERY_TIMEOUT` | 504 | Exceeded the 15 s limit |
| `RESULT_TOO_LARGE` | 422 | Result exceeded 10,000 rows or 5 MiB |
| `RAW_SQL_FORBIDDEN` | 403 | Raw SQL not permitted |
| `MEMBER_EXISTS` | 409 | The user already belongs to the organization |
| `ROLE_EXISTS` | 409 | A role with that name already exists |
| `ROLE_IN_USE` | 409 | System or assigned role cannot be deleted |
| `CANNOT_REMOVE_SELF` | 409 | Members cannot remove their own membership |
| `CREDENTIALS_NOT_CONFIGURED` | 503 | Credentials supplied but `CREDENTIAL_ENCRYPTION_KEY` is unset |
| `NOT_IMPLEMENTED` | 501 | Endpoint reserved for a later milestone |

## Limits enforcement

- Configuration: 1 MiB → `413 CONFIG_TOO_LARGE`; 100 widgets → `422`.
- Queries: 15 s → `504 QUERY_TIMEOUT`; 10,000 rows or 5 MiB →
  `RESULT_TOO_LARGE` with truncation metadata where partial results are valid.
- Rate limits return `429` with `Retry-After` and `retryAfterMs`.

## Types and time

- IDs are UUIDv7 strings.
- Timestamps are UTC ISO-8601 (`2026-11-12T06:00:00Z`).
- Durations are milliseconds unless the field name says otherwise.
- `refreshInterval` is in seconds.
- Data-source credentials are write-only and never appear in responses.

## Realtime

REST does not stream dashboard data. Live updates use `/ws/v1` with the same
session cookie or embed token. See
[realtime-protocol.md](../architecture/realtime-protocol.md).

## Typed client

- `@nama/api-client` exposes the typed transport (`createApiClient` plus
  `ApiError`/`RevisionConflictError`).
- M6 extended it to every implemented endpoint: dashboard metadata update and
  delete, shares, embed tokens, data sources, organization members/roles/
  permissions and preferences. Pagination options are shared via `ListOptions`.
- It remains hand-written against `openapi.yaml`; `pnpm verify:openapi` is the
  drift control. Full code generation from the specification is deferred
  (tracked in [technical-debt.md](../implementation/technical-debt.md)).
- Authentication travels as cookies; the client never stores tokens.
- No endpoint types are duplicated by hand in applications.

## Security headers and transport

- HTTPS only in non-local environments.
- Cookies are `Secure` outside localhost.
- CORS allows only configured application origins; embed origins are explicit.
- Responses do not include credentials or internal identifiers beyond UUIDs.

## Related documents

- [../architecture/backend-architecture.md](../architecture/backend-architecture.md)
- [../architecture/security.md](../architecture/security.md)
- [../architecture/decisions/ADR-009-embed-tokens.md](../architecture/decisions/ADR-009-embed-tokens.md)
- [../architecture/data-source-contracts.md](../architecture/data-source-contracts.md)
