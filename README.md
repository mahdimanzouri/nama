# Nama Dashboard Platform

An extensible dashboard platform for monitoring and analytical dashboards:
a reusable React SDK, a Next.js web application and an independent Fastify API.
Supports English and Persian, RTL and LTR chrome, and light, dark and system
themes. The dashboard canvas is LTR-only in v1.

## Repository status

**Milestone M3.5 (walking skeleton) is complete (2026-11-12).** M4 (editor) is
next.

The workspace contains:

```text
apps/web                  Next.js 16 application: login, dashboard list, editor,
                          published viewer
apps/api                  Fastify 5 service: auth, dashboards, draft/publish,
                          queries, health endpoint
packages/dashboard-types  public contracts: constants plus Zod schemas (M2)
packages/dashboard-core   host-agnostic runtime: plugin contract, registry,
                          query keys, i18n, layout, theme (M3)
packages/dashboard-builder React provider, viewer, canvas, renderer, hooks (M3)
packages/api-client       hand-written typed transport and errors (M3.5)
examples/standalone-consumer  React app that renders a dashboard via packed
                              tarballs (M3)
```

The walking skeleton runs end to end: a user logs in, creates a dashboard with a
KPI and a line widget, saves and publishes it, and a viewer account sees the
published configuration only. State is in memory and reseeds on restart; drag and
resize, realtime and persistence land in M4–M8 — see the
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
pnpm verify:consumer   # packs the SDK and renders it in examples/standalone-consumer
pnpm clean
```

The API reads `HOST`, `PORT`, `NODE_ENV`, `LOG_LEVEL` and the demo-account
variables; see `apps/api/.env.example`. `GET /healthz` returns the service status.
The web app proxies `/api/*` to `NAMA_API_URL` (default `http://localhost:3001`).

Sign in at <http://localhost:3000/login> with the seeded accounts:

| Role   | Email               | Password          |
| ------ | ------------------- | ----------------- |
| Editor | `demo@nama.local`   | `nama-demo-123`   |
| Viewer | `viewer@nama.local` | `nama-viewer-123` |

The store is in memory: restarting the API discards dashboards and sessions.

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
