# Nama Dashboard Platform — Architecture Package

**Status:** M0 approved; M1, M2, M3, M3.5, M4, M5, M6, M7 and M8 complete ([current phase](implementation/current-phase.md))
**Date:** 2026-11-12
**Scope:** Architecture and decisions, plus the implemented walking skeleton.
**Source:** [`dashboard-platform-full-planning.md`](../dashboard-platform-full-planning.md)

## Purpose

This package records the architecture, contracts and decisions that M1–M12 will
implement. It exists so the dashboard SDK, web application and backend API can
evolve independently without re-deciding fundamentals or requiring a rewrite.

## Current repository state

M1 created the monorepo this package describes:

- `apps/web` — the Next.js 16.4.6 application (moved from the repository root)
- `apps/api` — Fastify 5 service with auth, dashboards, draft/publish, queries and
  `GET /healthz`
- `packages/{dashboard-types,dashboard-core,dashboard-builder,api-client}`
- pnpm workspace, Turborepo task graph, shared strict TypeScript and ESLint

M2 added the shared contracts in `dashboard-types`. M3 added the host-agnostic
runtime in `dashboard-core`, the React provider/viewer/hooks in
`dashboard-builder`, a stylesheet export, and the standalone consumer verified by
`pnpm verify:consumer`. M3.5 wired the web app to `api-client` and the SDK:
login, dashboard list/create, editor save/publish with `If-Match`, KPI and line
widgets over HTTP, and a published-only viewer. M4 moved the editor into
`dashboard-builder`: a React Grid Layout canvas with drag/resize, undo/redo,
per-breakpoint editing, save/publish callbacks and visible 409 conflict handling,
plus version listing and restore. M5 added seven built-in widgets behind the
`@nama/dashboard-builder/widgets` subpath: a shared tree-shaken ECharts 6 canvas,
per-widget Zod config schemas with settings-time validation feedback, and
loading/error/empty/truncated states; the main entry stays ECharts-free.
M6 replaced the in-memory store with PostgreSQL behind the `Persistence` facade:
Prisma migrations, per-request tenant scoping under `SET LOCAL` and row-level
security, Argon2id authentication with hashed server sessions, RBAC and
organization administration, dashboard sharing, scoped embed tokens, encrypted
data-source credentials and audit logging. The OpenAPI document marks every
served operation `implemented`, and `pnpm verify:openapi` fails on drift.
`api-client` remains hand-written; code generation is deferred (technical debt).
M7 added server-side connector plugins (`static`, `rest`) with SSRF range
blocking, per-source limits and truncation, query execution/validation/schema
endpoints, and SDK HTTP/static adapters used by the web app.
M8 added the realtime gateway: `/ws/v1` with pre-upgrade authentication and
per-subscription authorization, `GET /v1/stream` as an SSE fallback, a shared
subscription hub with 60 s replay threads, sequence and gap handling, 250 ms
stream throttling, and SDK WebSocket/SSE connection managers wired into the web
app and built-in live widgets.
Documents describing target-only packages list them as such.

## Status legend

| Status | Meaning |
| --- | --- |
| Accepted | Decided in M0; implementation may rely on it |
| Proposed | Recommended but requiring approval or external input |
| Unresolved | Deliberately open; a milestone is blocked until decided |
| Target-only | Described package/module that M1 does not create |

## §19 first-assignment coverage

| # | Required output | Document |
| --- | --- | --- |
| 1 | Detailed monorepo structure | [architecture/overview.md](architecture/overview.md), [architecture/package-dependencies.md](architecture/package-dependencies.md) |
| 2 | Package dependency graph | [architecture/package-dependencies.md](architecture/package-dependencies.md) |
| 3 | Public SDK API proposal | [architecture/sdk-api.md](architecture/sdk-api.md) |
| 4 | Dashboard configuration schema | [architecture/dashboard-schema.md](architecture/dashboard-schema.md) |
| 5 | Widget plugin contract | [plugins/widget-plugin-contract.md](plugins/widget-plugin-contract.md) |
| 6 | Data-source plugin contract | [plugins/data-source-plugin-contract.md](plugins/data-source-plugin-contract.md) |
| 7 | Realtime protocol proposal | [architecture/realtime-protocol.md](architecture/realtime-protocol.md) |
| 8 | Backend module architecture | [architecture/backend-architecture.md](architecture/backend-architecture.md) |
| 9 | Database entity relationship proposal | [architecture/data-model.md](architecture/data-model.md) |
| 10 | Internationalization and theme strategy | [architecture/i18n-theme.md](architecture/i18n-theme.md) |
| 11 | Security risk assessment | [architecture/security.md](architecture/security.md) |
| 12 | Decision records (auth, RLS, embed tokens, SQL model, deployment) | [architecture/decisions/](architecture/decisions/) |
| 13 | Milestone acceptance criteria and recalibrated estimate | [implementation/roadmap.md](implementation/roadmap.md) |

## §18.4 required progress files

| Required path | Present |
| --- | --- |
| `architecture/overview.md` | yes |
| `architecture/package-dependencies.md` | yes |
| `architecture/data-flow.md` | yes |
| `architecture/security.md` | yes |
| `architecture/plugin-system.md` | yes |
| `architecture/decisions/ADR-001..006` | yes |
| `implementation/roadmap.md` | yes |
| `implementation/current-phase.md` | yes |
| `implementation/technical-debt.md` | yes |
| `api/openapi.yaml` | yes |
| `plugins/` | yes |

## Invariants

These values are normative. Every document that mentions them must use these
exact values. A change requires an ADR amendment.

1. **Initial packages:** exactly `@nama/dashboard-types`, `@nama/dashboard-core`,
   `@nama/dashboard-builder`, `@nama/api-client`. All other packages in the
   target tree are target-only; M1 does not create them.
2. **Independent versions:** configuration `schemaVersion`, per-widget
   `configVersion`, and plugin package `version` move independently.
3. **Concurrency:** every configuration write carries `If-Match` with the last
   known `revision`. A stale write returns `409 Conflict` with the current
   revision. Publishing copies `draftConfig` to `publishedConfig`, increments
   `revision`, and inserts a `DashboardVersion` in one transaction.
4. **Draft versus published:** viewers read `publishedConfig` only. The draft
   endpoint is editor-only.
5. **Caps:** 1 MiB configuration, 100 widgets per dashboard (warn above 50),
   15 s query timeout, 10,000 rows or 5 MiB per result, 12 live chart instances
   per viewport, 50 undo/redo entries, 50 retained published versions.
6. **Realtime:** endpoint `/ws/v1`; per-subscription `sequence`; replay buffer
   is 60 s or 1,000 events, whichever is smaller; server-side stream throttle
   250 ms; client coalesces to 4 UI updates per second per widget; ten message
   types (`connected`, `subscribe`, `subscribed`, `snapshot`, `data`, `gap`,
   `unsubscribe`, `unsubscribed`, `error`, `heartbeat`); a snapshot replaces
   client state.
7. **Localization and themes:** locales `en` and `fa`; RTL chrome with an
   LTR-only canvas (disclosed to users); themes `light`, `dark`, `system`;
   message fallback is host → SDK built-in → English.
8. **Identifiers and time:** UUIDv7 identifiers; UTC ISO-8601 timestamps;
   timezone precedence is user preference → dashboard setting → organization
   default.
9. **Breakpoints:** `desktop`, `tablet`, `mobile`; `LayoutItem` entries are the
   only source of widget position; a missing breakpoint inherits the next wider
   breakpoint and materializes on first edit.
10. **Tenancy:** organization scoping in repository/service layers **and**
    PostgreSQL row-level security with per-request `SET LOCAL`; permission names
    use the `dashboard.read`, `datasource.update` form; embed tokens narrow the
    issuer's permissions, never widen them.
11. **Stack pins:** React Grid Layout 2.x (1.5.x documented fallback), Apache
    ECharts v6 with module-level imports, `cacheComponents` enabled, built SDK
    output preserves `"use client"`.

## Reading order

1. [overview.md](architecture/overview.md) — product, current state, target topology
2. [decisions/](architecture/decisions/) — ADR-001..011
3. [package-dependencies.md](architecture/package-dependencies.md)
4. [dashboard-schema.md](architecture/dashboard-schema.md) and [data-model.md](architecture/data-model.md)
5. [sdk-api.md](architecture/sdk-api.md), [plugin-system.md](architecture/plugin-system.md), [plugins/](plugins/)
6. [data-source-contracts.md](architecture/data-source-contracts.md), [realtime-protocol.md](architecture/realtime-protocol.md)
7. [backend-architecture.md](architecture/backend-architecture.md), [security.md](architecture/security.md)
8. [data-flow.md](architecture/data-flow.md), [i18n-theme.md](architecture/i18n-theme.md)
9. [api/](api/), [implementation/](implementation/)

## Notes

- Documents are written in English. The product ships English and Persian; the
  documentation-language decision is recorded in
  [implementation/technical-debt.md](implementation/technical-debt.md).
- `docs/guides/` is deliberately absent in M0; it is tracked as technical debt.
- `AGENTS.md` contains a block that `next dev` rewrites. Project rules are
  appended below that block and must never replace it.
