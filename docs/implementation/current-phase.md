# Current Phase

**Current milestone:** M8 — Realtime infrastructure (next)
**Status:** M7 complete, awaiting acceptance (2026-11-12)
**Date:** 2026-11-12

## What the repository looks like now

```text
nama/
├── apps/
│   ├── web/                    # Next.js 16 app: login, dashboard list, editor, viewer
│   │   └── lib/data-adapter.ts # SDK HTTP adapter pointed at the /api proxy
│   └── api/                    # Fastify 5 service with PostgreSQL persistence
│       ├── prisma/             # schema, migrations, seed
│       ├── scripts/            # OpenAPI drift check
│       └── src/
│           ├── http/           # auth hooks and request helpers
│           ├── infrastructure/ # persistence, RLS scoping, credentials, RBAC, sessions
│           └── modules/        # auth, dashboards, data-sources, organizations,
│               │               # preferences, queries
│               └── queries/    # QueryService, limits, plugins/{static,rest,egress}
├── packages/
│   ├── dashboard-types/        # platform constants + runtime contracts (M2)
│   ├── dashboard-core/         # host-agnostic runtime + HTTP/static adapters (M3/M7)
│   ├── dashboard-builder/      # public React API, editor and CSS (M3/M4);
│   │                           # built-in widgets behind the `./widgets` entry (M5)
│   └── api-client/             # hand-written typed transport (M3.5, extended in M6/M7)
├── examples/standalone-consumer/  # SSR consumer with a custom widget (M3)
├── infra/postgres/init.sql     # owner role, runtime role grants
├── docker-compose.dev.yml      # PostgreSQL 17 on host port 5433
├── scripts/                    # workspace, consumer and OpenAPI verification
├── docs/                       # architecture, decisions, implementation state
├── turbo.json
├── tsconfig.base.json
├── eslint.config.mjs           # single root config for the whole workspace
├── .github/workflows/ci.yml
└── pnpm-workspace.yaml
```

## Delivered in M7

### Server connector runtime

| Area | Contents |
| --- | --- |
| Contract | `ServerDataSourcePlugin` with manifest, capability flags, `configSchema`/`credentialSchema`, `test`, `validate`, `execute` and optional `discover`; `PluginContext` carries config, just-in-time credentials, limits, `AbortSignal`, transport and logger |
| Registry | `createPluginRegistry()` with `static` and `rest` connectors; unknown kinds return `501 NOT_IMPLEMENTED` |
| Static connector | Deterministic metrics behind the internal `demo-source`; local filter/order/limit/aggregation evaluation shared with the REST connector |
| REST connector | `GET`/`POST` JSON over HTTP, optional `rowsPath` and configured columns, credential headers (host/content-length/etc. refused), 401/403 → `DATASOURCE_AUTH_FAILED`, 429 → `RATE_LIMITED`, ≥500 → `DATASOURCE_UNREACHABLE`, redirects refused |
| Egress guard | http/https only; loopback, private, link-local, multicast and metadata ranges rejected after DNS resolution; test-only `ALLOW_PRIVATE_DATA_SOURCES` escape hatch |

### Query execution

| Area | Contents |
| --- | --- |
| Service | `QueryService.execute` loads tenant-scoped sources through `withTenant`, refuses disabled sources, decrypts credentials only when the plugin asks, validates the result with `queryResultSchema` |
| Limits | Platform maxima 15 s / 10,000 rows / 5 MiB / 4 concurrent; per-source `limits` may only tighten them and are clamped when stored |
| Truncation | Rows cut at `maxRows`; over-budget payloads cut to the largest row prefix within `maxBytes` by binary search, with an accurate `truncated` flag |
| Cancellation | Timeout aborts the plugin; a client disconnect aborts via `AbortSignal`; timeout → `504 QUERY_TIMEOUT`, disconnect → `408 CANCELLED` |
| Concurrency | In-process `ConcurrencyGate` keyed by `organization:dataSource`; excess requests get `429 RATE_LIMITED` with `retryAfterMs` |
| Endpoints | `POST /v1/queries/execute`, `POST /v1/queries/validate`, `GET /v1/data-sources/:id/schema`, `POST /v1/data-sources/:id/test` (audited as `datasource.test`) |

### SDK adapters

| Area | Contents |
| --- | --- |
| HTTP | `createHttpDataAdapter` in `@nama/dashboard-core`: host-injected base URL, `fetch`, headers and CSRF token; posts to `/v1/queries/execute`, parses `QueryResult`, surfaces `DataAdapterError` with the server code |
| Static | `createStaticDataAdapter`: in-memory datasets evaluated locally (time range, filters, ordering, limit, aggregation) for demos and tests |
| Web wiring | `apps/web` now builds `DataAdapter` from the SDK adapter over the `/api` proxy and reads the `nama_csrf` cookie itself |
| Typed client | `validateQuery` and `getDataSourceSchema` added; data-source `limits` accepted on create/update |

## Delivered in M6 (unchanged summary)

| Area | Contents |
| --- | --- |
| Persistence | PostgreSQL 17, Prisma 7.10.1, `Persistence.withTenant`, RLS with `SET LOCAL app.organization_id`, owner/runtime role split |
| Auth | Argon2id, hashed opaque sessions, CSRF cookies, 14 permissions and five system roles, membership/role administration |
| Dashboards | Draft/publish/restore with `If-Match` and `409 REVISION_CONFLICT`, 50-version retention, shares, scoped embed tokens |
| Data sources | Metadata CRUD and AES-256-GCM credentials; M6 shipped the test endpoint as a `501` placeholder that M7 replaced |
| Contracts | OpenAPI marked implemented with a route-inventory drift check; typed client and CI with a PostgreSQL service |

## Decisions taken during M7

| Decision | Choice | Why |
| --- | --- | --- |
| Plugin location | In-process registry in the API; no remote code | Trusted bundles only (ADR-006); keeps the contract testable without a worker |
| Demo source | Synthetic `static` record, not a database row | Keeps demo dashboards working in every environment without seeding a special row |
| Limit ownership | Platform maxima; per-source limits clamp down only | A tenant cannot raise the 15 s/10k/5 MiB ceiling |
| Byte budgeting | Binary search over the row prefix | Exact truncation without re-serializing every prefix linearly |
| Concurrency | Per-process gate keyed by organization and source | Bounds fan-out per connector now; a cross-process limiter is deferred |
| Egress | Resolve + reject private ranges, redirects disabled | Blocks SSRF into loopback/metadata; DNS pinning against rebinding remains debt |
| Validate response | `200 { valid, issues }` rather than `422` | Validation is a successful request whose payload reports problems |
| SDK HTTP adapter | Host injects base URL, headers and CSRF | The SDK never reads cookies or owns authentication |
| Static SDK adapter | Local evaluation of the query contract | Offline previews and adapter tests need no API |
| SQL/MQTT kinds | Declared metadata, no connector yet | `501 NOT_IMPLEMENTED` is honest; connectors are scheduled later |

## Open decisions

| Decision | Status | Blocks | Notes |
| --- | --- | --- | --- |
| Deployment topology | Resolved — ADR-011 Option A (self-hosted Docker) | — | M8 uses the long-lived API process |
| Prisma major version | Resolved — pinned 7.10.1 | — | Stable release |
| SQL/MQTT connectors | Open | — | Kinds are declared but return `501`; PostgreSQL/MySQL/MQTT execution is not scheduled in this milestone |
| DNS pinning / egress proxy | Open | — | The guard resolves once; rebinding between resolution and connect is not prevented (TD) |
| Cross-process query limits | Open | — | Concurrency gate and byte caps are per process; no Redis or shared counter |
| Query rate limiting | Open | — | Only per-source concurrency is bounded |
| Persian calendar library | Open | M10 | Display-only strategy decided; library selection deferred |
| API code generation | Deferred to M12 | — | `api-client` remains hand-written; drift check covers paths |
| Public/anonymous sharing | Deferred | — | Organization-scoped sharing only in v1 |
| External time-series store | Deferred | — | Telemetry stays out of Postgres |
| Plugin sandbox/marketplace | Deferred | — | Trusted install only (ADR-006) |
| Viewer/editor pixel parity | Open | — | Editor uses RGL; viewer canvas uses CSS grid; re-targeted to M9 |

## What M8 must not assume

- That any realtime transport exists. There is no WebSocket gateway, no SSE
  endpoint and no `subscribe` implementation on the SDK adapters.
- That the protocol is implemented. `/ws/v1`, sequences, resume, gap detection
  and replay buffers are design-only.
- That connection sharing exists. Each widget would open its own connection if
  one were available; the shared manager is M8.
- That streaming limits are enforced. The 250 ms server throttle, 4
  updates/sec/widget and ring buffers are not implemented.
- That SQL, MySQL or MQTT queries work; those kinds return `501`.
- That query limits are cluster-wide; the concurrency gate is per process.
- That the egress guard is DNS-rebinding proof; it resolves once and relies on
  disabled redirects.
- That credentials can be used for anything other than REST headers.
- That `dashboard-core` may import React at runtime, ECharts, a database driver
  or Next.js.

## Verification (M7)

All commands were run from the repository root on Node 24.22.1 with pnpm 10.33.2.

| Check | Command | Result |
| --- | --- | --- |
| Boundaries | `pnpm verify:workspace` | Passes: approved graph, no host imports, single React version |
| Lint | `pnpm lint` | Clean |
| Format | `pnpm format:check` | All files match (generated Prisma output ignored) |
| Typecheck | `pnpm typecheck` | 10 tasks successful |
| Test | `pnpm test` | 212 passed, 6 skipped in 23 files: types 70, core 43, builder 44, api-client 14, api 41 (+6 Postgres skipped) |
| Build | `pnpm build` | 6 tasks successful, 8 routes |
| Consumer | `pnpm verify:consumer` | Passes: `"use client"` preserved, 12.5 KiB and 6.9 KiB gzipped (16 KiB budgets), SSR render, single React copy |
| OpenAPI drift | `pnpm verify:openapi` | In sync: 38 served operations, 38 documented |

The M7 suites cover REST execution with local filters, row-cap truncation,
private-target rejection, 504 timeout, byte-limit rejection, validate, schema
discovery, the audited connectivity test and the `501` path for connectors
without discovery, plus SDK adapter request/error behavior and static
evaluation. The 6 Postgres tests still skip without `NAMA_TEST_DATABASE_URL`
and always run in CI.

## Next action

M7 is complete and awaiting acceptance. The next milestone is M8 (realtime
infrastructure): shared WebSocket manager, subscription registry and cleanup,
SSE fallback, authentication and per-subscription authorization, reconnect with
backoff, resume/snapshot/gap recovery, heartbeats, sequence validation, bounded
buffers and server throttling. ADR-011 is accepted, so M8 is unblocked.
