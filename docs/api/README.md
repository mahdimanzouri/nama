# API Conventions

**Status:** Proposed (M0). [`openapi.yaml`](openapi.yaml) is a contract
proposal; code generation begins in M6.

## Versioning and scope

- Base path `/v1`. Breaking changes create a new major path.
- Management operations are REST; live updates use `/ws/v1`.
- `x-m0-status: proposed` means the contract is reviewed but shapes may change
  in M2. `x-m0-status: stub` reserves the path; detailed schemas arrive with the
  owning milestone.
- Dashboard, query and embed-token schemas are detailed in M0. Organization,
  member, role and preference shapes are indicative.

## Authentication

- Web clients use the opaque `nama_session` cookie (`httpOnly`, `Secure`,
  `SameSite=Lax`).
- Mutating cookie-authenticated requests also send `X-CSRF-Token`.
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
- The key is stored with a hash of the request and the response for a bounded
  window (proposed 24 hours), scoped to the authenticated principal.
- Replaying the same key and payload returns the stored response.
- Reusing a key with a different payload returns `409`.

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
    "message": "Configuration is invalid.",
    "requestId": "req_01J...",
    "fieldPaths": ["widgets", 2, "config", "valueField"],
    "retryAfterMs": null
  }
}
```

Rules:

- `code` is stable and machine-readable; `message` is human-readable and may be
  localized by the client.
- `fieldPaths` is present for validation errors and never contains free text.
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

- `@nama/api-client` is generated from `openapi.yaml`.
- CI fails when the checked-in generated client differs from a fresh generation.
- Authentication is injected per client instance so the web app, embed runtime
  and tests share one implementation.
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
