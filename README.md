# Nama Dashboard Platform

An extensible dashboard platform for monitoring and analytical dashboards:
a reusable React SDK, a Next.js web application and an independent Fastify API.
Supports English and Persian, RTL and LTR chrome, and light, dark and system
themes. The dashboard canvas is LTR-only in v1.

## Repository status

**Milestone M6 (backend and persistence) is complete and awaiting acceptance
(2026-11-12).** M7 (data infrastructure) is next.

The workspace contains:

```text
apps/web                  Next.js 16 application: login, dashboard list, editor,
                          published viewer
apps/api                  Fastify 5 service: PostgreSQL persistence, auth, RBAC,
                          dashboards, shares, embed tokens, data sources,
                          queries, health endpoint
packages/dashboard-types  public contracts: constants plus Zod schemas (M2)
packages/dashboard-core   host-agnostic runtime: plugin contract, registry,
                          query keys, i18n, layout, theme (M3)
packages/dashboard-builder React provider, viewer, editor, grid canvas, hooks,
                          stylesheet and built-in widgets behind `./widgets`
                          (M3, editor in M4, widgets in M5)
packages/api-client       hand-written typed transport and errors (M3.5)
examples/standalone-consumer  React app that renders a dashboard via packed
                              tarballs (M3)
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
and audit logging. An in-memory adapter remains for tests; realtime lands in M8 —
see the [roadmap](docs/implementation/roadmap.md).

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
pnpm verify:consumer   # packs the SDK and renders it in examples/standalone-consumer
pnpm verify:openapi    # Fastify routes vs docs/api/openapi.yaml
pnpm clean
```

The API reads `HOST`, `PORT`, `NODE_ENV`, `LOG_LEVEL`, `APP_DATABASE_URL`,
`CREDENTIAL_ENCRYPTION_KEY` and the demo-account variables; see
`apps/api/.env.example`. `GET /healthz` returns the service status. The web app
proxies `/api/*` to `NAMA_API_URL` (default `http://localhost:3001`).

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
