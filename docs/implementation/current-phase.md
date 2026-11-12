# Current Phase

**Current milestone:** M9 — Advanced dashboard capabilities (next)
**Status:** M8 complete, awaiting acceptance (2026-11-12)
**Date:** 2026-11-12

## What the repository looks like now

```text
nama/
├── apps/
│   ├── web/                    # Next.js 16 app: login, dashboard list, editor, viewer
│   │   └── lib/
│   │       ├── data-adapter.ts # SDK HTTP adapter pointed at the /api proxy
│   │       └── realtime-adapter.ts # SSE over /api, or WS via NEXT_PUBLIC_NAMA_WS_URL
│   └── api/                    # Fastify 5 service with PostgreSQL persistence
│       ├── prisma/             # schema, migrations, seed
│       ├── scripts/            # OpenAPI drift check
│       └── src/
│           ├── http/           # auth hooks and request helpers
│           ├── infrastructure/ # persistence, RLS scoping, credentials, RBAC, sessions
│           └── modules/        # auth, dashboards, data-sources, organizations,
│               │               # preferences, queries
│               ├── queries/    # QueryService, limits, plugins/{static,rest,egress}
│               └── realtime/   # /ws/v1 gateway, SSE stream, authorizer, hub, buffers
├── packages/
│   ├── dashboard-types/        # platform constants + runtime contracts (M2)
│   ├── dashboard-core/         # host-agnostic runtime, HTTP/static data adapters (M3/M7)
│   │                           # and WebSocket/SSE realtime adapters (M8)
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

## Delivered in M8

### Server realtime gateway

| Area | Contents |
| --- | --- |
| WebSocket | Raw `upgrade` handler on `/ws/v1`; cookie or `nama.embed.<token>` subprotocol authenticated before the upgrade, HTTP 401 otherwise; `ws` 8.18.3 with a 256 KiB payload cap |
| SSE | `GET /v1/stream` with cookie or Bearer auth, Zod-validated query parameters, `reply.hijack()` streaming, `id:` sequence per frame, `Last-Event-ID` resume, keep-alive comments |
| Connection | 5 s auth timeout (`4401`), JSON + Zod validation, 50 subscriptions and 120 messages per 10 s per connection, heartbeat every 30 s with permission revalidation, `4408` on missed heartbeats |
| Authorization | Session or embed principal; `datasource.execute` required per subscription; embed sources must be referenced by a published dashboard inside the token scope; token variables override parameters |
| Hub | Channels keyed by organization + query request share one poller; resume threads keyed by principal + client subscription id survive disconnect for 60 s and are taken over by a reconnect |
| Sequences | Allocated at send time; `snapshot-then-stream` emits an authoritative snapshot per poll, `stream` emits throttled `data` (250 ms default) |
| Replay | `ReplayBuffer` per subscription: 60 s or 1,000 events, whichever is smaller; stale `resumeFrom` or an age-out emits `gap` before the next snapshot |
| Config | `REALTIME_POLL_INTERVAL_MS` (250–60,000, default 5,000); other knobs default from `REALTIME_DEFAULTS` and are overridable per app build |

### SDK realtime clients

| Area | Contents |
| --- | --- |
| WebSocket adapter | `createWebSocketRealtimeAdapter`: one shared socket per adapter, lazy open, resubscribe on `connected`, 500 ms → 30 s exponential backoff with ±20% jitter, heartbeat send plus watchdog, duplicate/gap handling, embed token as subprotocol |
| SSE adapter | `createSseRealtimeAdapter`: one `EventSource` per subscription, `withCredentials`, named event listeners, same sequence/duplicate/gap rules |
| Sequence baseline | `subscribed.firstSequence` seeds the expected sequence, so the first snapshot is not mistaken for a gap; `resumeFrom` is sent after reconnect |
| Cleanup | Unsubscribe sends the frame and closes the socket when the last subscription leaves; `close()` stops reconnection |
| Widgets | `useWidgetQuery` subscribes only when the plugin declares `capabilities.realtime` and an adapter is injected; snapshots replace the TanStack cache, stream events go into a 500-sample buffer flushed at most every 250 ms |
| Built-ins | KPI, line/area/bar, pie and gauge declare `realtime: true`; table stays snapshot-oriented |

### Web wiring

| Area | Contents |
| --- | --- |
| Default transport | SSE through the same-origin `/api` proxy, because Next.js rewrites stream responses but cannot proxy WebSocket upgrades |
| WebSocket option | `NEXT_PUBLIC_NAMA_WS_URL` (for example `ws://localhost:3001`) switches to the direct `/ws/v1` gateway |
| Editor and viewer | Both pass `realtimeAdapter` to `DashboardProvider` next to `dataAdapter` |

## Delivered in M7 (unchanged summary)

| Area | Contents |
| --- | --- |
| Connectors | `ServerDataSourcePlugin` registry with `static` and `rest`; egress guard rejects loopback/private/metadata ranges |
| Execution | `QueryService.execute` with 15 s / 10,000 rows / 5 MiB / 4 concurrent limits, binary-search truncation, cancellation and error mapping |
| Endpoints | `POST /v1/queries/execute`, `POST /v1/queries/validate`, `GET /v1/data-sources/:id/schema`, `POST /v1/data-sources/:id/test` |
| SDK adapters | `createHttpDataAdapter` and `createStaticDataAdapter` used by tests, demos and the web app |

## Delivered in M6 (unchanged summary)

| Area | Contents |
| --- | --- |
| Persistence | PostgreSQL 17, Prisma 7.10.1, `Persistence.withTenant`, RLS with `SET LOCAL app.organization_id`, owner/runtime role split |
| Auth | Argon2id, hashed opaque sessions, CSRF cookies, 14 permissions and five system roles, membership/role administration |
| Dashboards | Draft/publish/restore with `If-Match` and `409 REVISION_CONFLICT`, 50-version retention, shares, scoped embed tokens |
| Data sources | Metadata CRUD and AES-256-GCM credentials; M6 shipped the test endpoint as a `501` placeholder that M7 replaced |
| Contracts | OpenAPI marked implemented with a route-inventory drift check; typed client and CI with a PostgreSQL service |

## Decisions taken during M8

| Decision | Choice | Why |
| --- | --- | --- |
| Transport inside the web app | SSE through `/api` by default | Next rewrites cannot upgrade WebSocket; cookies stay first-party and the session works without an extra origin |
| WebSocket option | `NEXT_PUBLIC_NAMA_WS_URL` escape hatch | Hosts that can expose the API origin get true bidirectional control without changing the SDK |
| Poll model | Re-execute the query on `REALTIME_POLL_INTERVAL_MS` | Connectors are pull-based; push/CDC needs source-specific work |
| Snapshot semantics | `snapshot-then-stream` snapshots replace the TanStack cache | Existing widgets render live data without per-widget stream code |
| Sequence allocation | At send time | Coalesced/dropped stream samples never produce false gaps |
| Resume state | Hub thread retained 60 s after disconnect | Resume works without client-held buffers or a database write per event |
| Subscription takeover | A new subscription on the same resume key closes the previous one | Reloads and editor remounts cannot leak duplicate pollers |
| Embed auth | Token in subprotocol (WS) or Bearer (SSE), never the URL | Tokens stay out of logs and referrers |
| Per-subscription authorization | Data source must be reachable for the principal; embed tokens scope to published dashboards | A valid token cannot widen access |
| Stream buffer | 500 samples client-side (`REALTIME_DEFAULTS.maxBufferedSamples`) | Bounds memory while matching the protocol default |
| Widget flush | 250 ms coalescing | Enforces the 4 updates/sec/widget ceiling |
| Fan-out | In-process hub | Single API instance in v1 (ADR-011); Redis behind the hub when a second instance exists |

## Open decisions

| Decision | Status | Blocks | Notes |
| --- | --- | --- | --- |
| Deployment topology | Resolved — ADR-011 Option A (self-hosted Docker) | — | Single long-lived API process hosts WS + SSE |
| Prisma major version | Resolved — pinned 7.10.1 | — | Stable release |
| Source push / CDC | Open | — | Realtime polls connectors; webhooks or CDC would need connector work |
| Cross-process realtime fan-out | Open | — | Channels, replay threads and connection limits are per process |
| SSE multiplexing | Open | — | One stream per subscription; browsers cap HTTP/1.1 connections per origin |
| Widget stream rendering | Open | — | Built-ins update from snapshots; raw `stream.latest` is available but unused (TD-058) |
| SQL/MQTT connectors | Open | — | Kinds are declared but return `501`; execution is not scheduled |
| DNS pinning / egress proxy | Open | — | The guard resolves once; rebinding between resolution and connect is not prevented (TD-052) |
| Query rate limiting | Open | — | Only per-source concurrency is bounded |
| Persian calendar library | Open | M10 | Display-only strategy decided; library selection deferred |
| API code generation | Deferred to M12 | — | `api-client` remains hand-written; drift check covers paths |
| Public/anonymous sharing | Deferred | — | Organization-scoped sharing only in v1 |
| External time-series store | Deferred | — | Telemetry stays out of Postgres |
| Plugin sandbox/marketplace | Deferred | — | Trusted install only (ADR-006) |
| Viewer/editor pixel parity | Open | — | Editor uses RGL; viewer canvas uses CSS grid; re-targeted to M9 |

## What M9 must not assume

- That connectors push. Realtime re-executes queries every 5 s by default; a
  faster interval is configuration, not a push channel.
- That realtime state survives a restart or a second instance. Channels, replay
  buffers and connections are in memory in one process.
- That built-in widgets consume raw stream samples. They render snapshots; only
  custom widgets read `data.stream.latest`.
- That SSE multiplexes. Each subscription is its own HTTP stream and each socket
  is limited to 50 subscriptions / 120 messages per 10 s.
- That the web app proxies WebSocket upgrades. It uses SSE unless
  `NEXT_PUBLIC_NAMA_WS_URL` is set.
- That realtime subscriptions are per-view. Widgets subscribe only when the
  plugin declares `capabilities.realtime`.
- That SQL, MySQL or MQTT queries work; those kinds return `501`.
- That query or realtime limits are cluster-wide; concurrency, connection and
  rate limits are per process.
- That the egress guard is DNS-rebinding proof; it resolves once and relies on
  disabled redirects.
- That there is an end-to-end browser test; realtime is covered by gateway and
  adapter suites, not Playwright (TD-036).
- That `dashboard-core` may import React at runtime, ECharts, a database driver
  or Next.js.

## Verification (M8)

All commands were run from the repository root on Node 24.22.1 with pnpm 10.33.2.

| Check | Command | Result |
| --- | --- | --- |
| Boundaries | `pnpm verify:workspace` | Passes: approved graph, no host imports, single React version |
| Lint | `pnpm lint` | Clean |
| Format | `pnpm format:check` | All files match (generated Prisma output ignored) |
| Typecheck | `pnpm typecheck` | 10 tasks successful |
| Test | `pnpm test` | 230 passed, 6 skipped in 25 files: types 72, core 51, builder 44, api-client 14, api 49 (+6 Postgres skipped) |
| Build | `pnpm build` | 6 tasks successful, 8 routes |
| Consumer | `pnpm verify:consumer` | Passes: `"use client"` preserved, 12.5 KiB and 6.9 KiB gzipped (16 KiB budgets), SSR render, single React copy |
| OpenAPI drift | `pnpm verify:openapi` | In sync: 39 served operations, 39 documented (includes `GET /v1/stream`) |

The M8 suites cover a shared socket with two subscriptions, replay after
reconnect, `gap` on a stale resume point, the 5 s auth timeout, embed-token
scoping and refusal, HTTP 401 for a bad token, SSE snapshot plus
`Last-Event-ID` resume, and the heartbeat close path. Client tests cover
connection sharing, per-subscription cleanup, reconnect with `resumeFrom`,
duplicate and gap handling, heartbeat watchdog, embed subprotocol and revocation.
The 6 Postgres tests still skip without `NAMA_TEST_DATABASE_URL` and always run
in CI.

## Next action

M8 is complete and awaiting acceptance. The next milestone is M9 (advanced
dashboard capabilities): variables and filters, import/export, templates and the
data-source picker, plus the viewer/editor parity work deferred from M4.
