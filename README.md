# Nama Dashboard Platform

An extensible dashboard platform for monitoring and analytical dashboards:
a reusable React SDK, a Next.js web application and an independent Fastify API.
Supports English and Persian, RTL and LTR chrome, and light, dark and system
themes. The dashboard canvas is LTR-only in v1.

## Repository status

**Milestone M11 (plugin ecosystem) is complete and awaiting acceptance
(2026-11-12).** M12 (production readiness) is next.

The workspace contains:

```text
apps/web                  Next.js 16 application: login, dashboard list, editor,
                          published viewer
apps/api                  Fastify 5 service: PostgreSQL persistence, auth, RBAC,
                          dashboards, shares, embed tokens, data sources,
                          queries, realtime gateway (WebSocket + SSE), health
                          endpoint
packages/dashboard-types  public contracts: constants, Zod schemas (M2) and the
                          data-source plugin contract and registry (M11)
packages/dashboard-core   host-agnostic runtime: plugin contract, registry,
                          query keys, i18n, layout, theme, HTTP/static data
                          adapters (M3, adapters in M7), WebSocket/SSE realtime
                          adapters (M8)
packages/dashboard-builder React provider, viewer, editor, grid canvas, hooks,
                          stylesheet, built-in widgets behind `./widgets` and the
                          plugin registration surface behind `./plugins`
                          (M3, editor in M4, widgets in M5, plugins in M11)
packages/api-client       hand-written typed transport and errors (M3.5)
examples/standalone-consumer  React app that renders a dashboard via packed
                              tarballs (M3)
examples/plugin-kit       custom widget and `memory` data-source plugins
                          registered through the public contracts (M11)
```

The walking skeleton runs end to end, and the M4 editor adds direct manipulation:
a user logs in, creates a dashboard, adds and configures widgets, drags and
resizes them per breakpoint, saves a draft, publishes it, restores a retained
version, and a viewer account sees the published configuration only. Stale writes
are rejected with a visible 409 conflict. M5 adds seven built-in widgets (KPI,
line, area, bar, pie, gauge, table) on a tree-shaken ECharts 6 canvas with
validated settings, theme-aware colours and loading/error/empty/truncated states.
M6 moves state to PostgreSQL behind a `Persistence` facade: Prisma migrations,
row-level tenant isolation, Argon2id authentication, RBAC and organization
administration, sharing, scoped embed tokens, encrypted data-source credentials
and audit logging. M7 adds server-side connector plugins (`static`, `rest`) with
SSRF range blocking, tighten-only limits (15 s, 10,000 rows, 5 MiB, 4 concurrent)
and truncation reporting, plus query validate/schema/test endpoints and SDK HTTP
and static adapters used by the web app. M8 adds realtime: a `/ws/v1` WebSocket
gateway and an SSE fallback with pre-upgrade authentication, per-subscription
authorization, one shared connection per adapter, snapshot-then-stream delivery,
sequences with gap detection and 60-second replay, bounded buffers, heartbeats
and reconnect with backoff. The web app defaults to SSE behind the `/api` proxy
and switches to WebSocket when `NEXT_PUBLIC_NAMA_WS_URL` is set. M9 adds
variables, global filters, time-range controls, conditional visibility and
cross-widget selections resolved in the SDK, with template-seeded dashboards and
JSON import/export. M10 completes English/Persian support: every page and state
is translated, dates display in the Solar Hijri calendar, Persian digits are
accepted in controls, and the header switches language and light/dark/system
themes with persisted preferences. The canvas stays LTR-only inside RTL chrome
and the editor says so. M11 opens the plugin surface: `@nama/dashboard-types`
publishes the validated data-source plugin contract and registry,
`@nama/dashboard-builder/plugins` exports widget registration, and
`examples/plugin-kit` adds a custom widget (with a `configVersion` migration) and
a `memory` connector that `pnpm verify:consumer` registers against the packed
tarballs. An in-memory persistence adapter remains for tests — see the
[roadmap](docs/implementation/roadmap.md).

## Architecture documentation

Start at [docs/README.md](docs/README.md):

- [Architecture overview](docs/architecture/overview.md)
- [Decision records](docs/architecture/decisions/)
- [Dashboard schema](docs/architecture/dashboard-schema.md)
- [SDK API proposal](docs/architecture/sdk-api.md)
- [Realtime protocol](docs/architecture/realtime-protocol.md)
- [Security assessment](docs/architecture/security.md)
- [API contract](docs/api/openapi.yaml)
- [Roadmap](docs/implementation/roadmap.md) and [current phase](docs/implementation/current-phase.md)

## Development

Requires Node 24 and pnpm 10.33.2 (both pinned by `engines` and `packageManager`).

```bash
pnpm install

pnpm dev               # web on :3000, API on :3001
pnpm build             # packages, web and API
pnpm typecheck
pnpm test
pnpm lint              # ESLint over the whole workspace
pnpm format            # Prettier
pnpm verify:workspace  # package boundaries and single React version
pnpm verify:consumer   # packs the SDK, renders examples/standalone-consumer and runs examples/plugin-kit
pnpm verify:openapi    # Fastify routes vs docs/api/openapi.yaml
pnpm test:e2e          # Playwright locale/theme/screenshot suite (dev servers)
pnpm clean
```

The browser suite starts or reuses the dev servers with
`NEXT_PUBLIC_NAMA_WS_URL` so realtime uses one WebSocket; six SSE streams would
exhaust the browser's HTTP/1.1 connections (TD-060). If the Playwright browser
download is unavailable, point `PLAYWRIGHT_CHROMIUM_EXECUTABLE` at a local
Chromium build. CI runs the suite in a dedicated `browser` job.

The API reads `HOST`, `PORT`, `NODE_ENV`, `LOG_LEVEL`, `APP_DATABASE_URL`,
`CREDENTIAL_ENCRYPTION_KEY`, `REALTIME_POLL_INTERVAL_MS`,
`REALTIME_MAX_CONNECTIONS`, `LOGIN_RATE_LIMIT`, `QUERY_RATE_LIMIT`,
`METRICS_TOKEN` and the demo-account variables; see `apps/api/.env.example`.
`GET /healthz` reports liveness, `GET /readyz` probes persistence and
`GET /metrics` exposes Prometheus text (bearer-protected when `METRICS_TOKEN` is
set). The web app proxies `/api/*` to `NAMA_API_URL` (default
`http://localhost:3001`), which also carries the SSE fallback at
`/api/v1/stream`. Next.js rewrites cannot upgrade WebSocket connections, so live
sockets need `NEXT_PUBLIC_NAMA_WS_URL` (for example `ws://localhost:3001/ws/v1`)
pointing directly at the API.

### PostgreSQL

```bash
docker compose -f docker-compose.dev.yml up -d
# copy apps/api/.env.example and set DATABASE_URL (owner) and
# APP_DATABASE_URL (runtime role)
pnpm --filter @nama/api exec prisma migrate deploy
pnpm --filter @nama/api exec prisma db seed
```

The runtime role is not a table owner and has no `BYPASSRLS`, so row-level
security applies. Without `APP_DATABASE_URL` the API uses the seeded in-memory
adapter in development and tests. The Postgres integration suite runs when
`NAMA_TEST_DATABASE_URL` is set:

```bash
NAMA_TEST_DATABASE_URL=postgresql://nama_app:nama-app-dev@127.0.0.1:5433/nama pnpm test
```

Sign in at <http://localhost:3000/login> with the seeded accounts:

| Role   | Email               | Password          |
| ------ | ------------------- | ----------------- |
| Editor | `demo@nama.local`   | `nama-demo-123`   |
| Viewer | `viewer@nama.local` | `nama-viewer-123` |

With PostgreSQL configured, dashboards, sessions and audit records survive
restart. Without `APP_DATABASE_URL` the API reseeds the in-memory store on every
start.

## Architectural rules (summary)

- The SDK must not depend on Next.js, the database, or a specific backend.
- Authentication, data and realtime are injected through documented interfaces.
- TanStack Query owns server state; Zustand owns local editor state.
- Backend authorization is authoritative; viewers only see published configs.
- Configuration writes are conditional on the last known revision.
- Support English and Persian; RTL chrome with a disclosed LTR-only canvas.
- Support light, dark and system themes.
- No circular dependencies; no abstraction without a concrete use case.

See the full rules in [AGENTS.md](AGENTS.md).
