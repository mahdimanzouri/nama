# Architecture Overview

**Status:** Proposed (M0)
**Date:** 2026-11-12

## Product

Nama is an extensible dashboard platform for monitoring and analytical
dashboards. It targets industrial and manufacturing monitoring, operational
dashboards, production/quality KPIs, business intelligence, administrative
dashboards, real-time telemetry and embedded dashboards.

The first vertical slice is **monitoring-first**: KPI and line widgets, HTTP
polling, one organization, a viewer and a visual editor with drag/resize,
draft/publish and version restore.

Supported presentation: English and Persian, RTL and LTR chrome, light, dark and
system themes. The dashboard canvas is LTR-only in v1 (ADR-005).

## Three independently defined parts

1. **Dashboard SDK** — reusable React packages for rendering and editing.
   Independent of Next.js and of the Nama backend.
2. **Web application** — Next.js product UI: locale routing, authentication
   experience, organizations, dashboard management, administration, embedding
   the SDK.
3. **Backend API** — Fastify modular monolith: persistence, authorization,
   data-source management, query execution, realtime gateway, audit.

## Current repository state (after M4)

The monorepo matches the target structure below:

```text
nama/
├── apps/
│   ├── web/             # Next.js 16.4.6, cacheComponents, login, editor, viewer
│   └── api/             # Fastify 5, auth, dashboards, versions, queries, /healthz
├── packages/            # four @nama/* packages with implemented SDK and editor
├── scripts/             # workspace boundary and consumer verification
├── turbo.json           # build, dev, typecheck, test, clean
├── tsconfig.base.json   # strict shared compiler options
└── pnpm-workspace.yaml  # apps/*, packages/*
```

All four initial packages export working code: `dashboard-types` contracts,
`dashboard-core` runtime, `dashboard-builder` provider/viewer/editor and the
hand-written `api-client`. Target-only packages are still absent, the API store
is in memory, and realtime remains a contract.

## Target monorepo structure

```text
nama/
├── apps/
│   ├── web/                       # Next.js App Router application
│   │   ├── src/app/[locale]/      # (auth), (dashboard), admin
│   │   ├── src/components/
│   │   ├── src/features/
│   │   ├── src/lib/
│   │   ├── src/i18n/              # next-intl configuration
│   │   ├── messages/en.json
│   │   └── messages/fa.json
│   └── api/                       # Fastify modular monolith
│       ├── src/modules/           # auth, users, organizations, memberships,
│       │                          # roles, permissions, dashboards,
│       │                          # dashboard-versions, data-sources, queries,
│       │                          # realtime, audit
│       ├── src/plugins/           # postgres, mysql, rest, mqtt
│       ├── src/infrastructure/    # database, queue, websocket, logging
│       └── src/server.ts
├── packages/
│   ├── dashboard-types/           # INITIAL
│   ├── dashboard-core/            # INITIAL
│   ├── dashboard-builder/         # INITIAL
│   ├── api-client/                # INITIAL
│   ├── dashboard-schemas/         # target-only
│   ├── dashboard-layout/          # target-only
│   ├── dashboard-widgets/         # target-only
│   ├── dashboard-data/            # target-only
│   ├── dashboard-realtime/        # target-only
│   ├── dashboard-ui/              # target-only
│   ├── dashboard-i18n/            # target-only
│   ├── dashboard-theme/           # target-only
│   ├── plugin-sdk/                # target-only
│   ├── eslint-config/             # tooling
│   └── tsconfig/                  # tooling
├── tooling/
├── docs/
├── AGENTS.md
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.json
```

Only the four **INITIAL** packages are created in M1 (ADR-001). The others are
the target decomposition and are split only on evidence.

## Runtime topology

```text
Browser
├── Next.js web app (server components + client islands)
│   └── @nama/dashboard-builder (client-only React)
│        ├── DataAdapter  ──HTTP──┐
│        └── RealtimeAdapter ─WS──┤
Browser (embedded in another React app)
└── @nama/dashboard-builder ──────┤
                                  v
                         Fastify API (modular monolith)
                         ├── session + RBAC + tenant scope (RLS)
                         ├── dashboards / versions / shares / embed tokens
                         ├── query execution ──> data-source plugin ──> external system
                         └── realtime gateway (/ws/v1)
                                  |
                                  v
                             PostgreSQL
                             (metadata + JSONB configs)
```

## Boundaries

| Concern | Owner |
| --- | --- |
| Locale routing, login UI, org management, dashboard listing | `apps/web` |
| Dashboard rendering/editing, layout, widget registry, editor state | SDK packages |
| Authentication and authorization decisions | `apps/api` (authoritative) |
| Dashboard configuration persistence, versions, shares | `apps/api` |
| Query execution and credential handling | `apps/api` + server-side plugins |
| Realtime connection and subscription fan-out | `apps/api` gateway |
| Server state (query cache, retries, deduplication) | TanStack Query in the SDK |
| Local editor state (selection, history, drag preview) | Zustand in the SDK |

The web app must not reimplement the editor. The SDK must not import Next.js,
open database connections or read cookies.

## Settled decisions (v1)

| Decision | Value |
| --- | --- |
| Canvas direction | LTR-only editing; RTL chrome everywhere else |
| First slice | Monitoring-first: KPI + line widgets, HTTP polling, one organization |
| SDK distribution | Private workspace only; consumer test installs a packed tarball |
| Editing model | Draft plus explicit publish |
| Configuration concurrency | Optimistic with `If-Match` and `409 Conflict` |
| Initial packages | `dashboard-types`, `dashboard-core`, `dashboard-builder`, `api-client` |
| Tenant isolation | Service-layer scoping plus PostgreSQL RLS |
| Authentication | Email/password + server sessions (ADR-007) |
| Embedding | Opaque, hashed, revocable embed tokens (ADR-009) |
| Deployment | Unresolved; self-hosted Docker recommended (ADR-011) |

## Non-goals for the first release

- Public marketplace for arbitrary third-party code.
- Unrestricted SQL from browsers.
- Full general-purpose page builder.
- Microservices per backend module.
- Custom charting engine.
- Alerting/incident-management product.
- Arbitrary code execution inside widgets.

## Related documents

- [package-dependencies.md](package-dependencies.md)
- [data-flow.md](data-flow.md)
- [backend-architecture.md](backend-architecture.md)
- [security.md](security.md)
- [implementation/roadmap.md](../implementation/roadmap.md)
