# Current Phase

**Current milestone:** M2 — Shared contracts and schemas (complete; next is M3)
**Status:** Complete, accepted 2026-11-12
**Date:** 2026-11-12

## What the repository looks like now

```text
nama/
├── apps/
│   ├── web/                    # Next.js 16 app
│   └── api/                    # Fastify 5 service, /healthz only
├── packages/
│   ├── dashboard-types/        # platform constants + all runtime contracts (M2)
│   ├── dashboard-core/         # empty entry point; public API lands in M3
│   ├── dashboard-builder/      # empty entry point; public API lands in M3
│   └── api-client/             # empty entry point; generated client lands in M6
├── scripts/verify-workspace.mjs
├── docs/                       # M0 architecture and decisions
├── turbo.json
├── tsconfig.base.json
├── eslint.config.mjs           # single root config for the whole workspace
├── .github/workflows/ci.yml
└── pnpm-workspace.yaml
```

`packages/dashboard-types/src` holds one module per contract area:

| Module | Contents |
| --- | --- |
| `primitives.ts` | Locales, breakpoints, themes, UUIDv7 and timestamp schemas, IANA time-zone validation, frozen `PLATFORM_LIMITS` |
| `errors.ts` | Stable issue codes, `ValidationIssue`, `ValidationResult`, Zod-to-issue mapping |
| `layout.ts` | `LayoutItem`, per-breakpoint layouts with 12/8/4 columns, overflow and duplicate checks |
| `widget.ts` | `DashboardWidget` plus visibility |
| `query.ts` | Query definition, filters, aggregations, variable bindings, absolute/relative time ranges, result and error contracts, `DataAdapter` types |
| `dashboard.ts` | Metadata, settings, variables, filters, full configuration and document schemas, `parseDashboardConfig` |
| `realtime.ts` | The ten `/ws/v1` message schemas, close codes, replay/reconnect constants, separate `authenticate` frame |
| `plugin.ts` | Widget manifest/capabilities and data-source plugin manifest/capabilities |
| `migration.ts` | Dashboard and per-widget migration runners |

## Deliverables

- [x] Public types and Zod schemas for dashboard, widget, layout, query, adapter
      and realtime contracts, with types inferred from the schemas
- [x] Plugin manifests (widget and data-source) with capability flags, semver and
      identifier validation
- [x] Migration interface for the dashboard `schemaVersion` and per-widget
      `configVersion`, with idempotency, future-version rejection and typed failures
- [x] `parseDashboardConfig` runs migrations, validates, enforces the 1 MiB cap and
      returns warnings for the 50-widget threshold and widgets missing from every layout
- [x] Stable cross-field issue codes (`duplicate_widget_id`, `duplicate_variable_name`,
      `layout_unknown_widget`, `layout_duplicate_widget`, `config_too_large`,
      `unsupported_schema_version`, `many_widgets`, `widget_not_laid_out`)
- [x] 69 schema tests covering valid/invalid configurations, field paths, caps,
      migrations, realtime frames and plugin manifests
- [x] `zod` added as the runtime dependency of `dashboard-types`

## Decisions taken during M2

| Decision | Choice | Why |
| --- | --- | --- |
| Schema authoring | Zod schema first, TypeScript type inferred | A value that parses is a value that type-checks; no drift between the two |
| Configuration validation result | `{ ok, issues, warnings }` on both branches | The M0 shape had no warnings channel; caps that should not block saving need one |
| Cross-field issue codes | Passed through Zod `params.code` | Zod reports every custom check as `custom`; callers must branch on stable codes, not messages |
| Persisted widget query range | `{ mode: "relative", last }` or `{ from, to }` | Matches the M0 line-widget example and keeps relative ranges resolvable server-side |
| Data-source identifiers | Opaque string, not UUIDv7 | The client must not assume a connector uses UUIDs; entity IDs stay UUIDv7 |
| Realtime `authenticate` frame | Separate schema, not one of the ten message types | Keeps the documented ten-type protocol invariant while supporting embed tokens |
| Widget plugin runtime interface | Deferred to M3 | It references React components; `dashboard-types` stays React-free |
| `apps/web` `noUnusedLocals` | Disabled for that project only | Next 16 writes `.next/dev/types/validator.ts` with unused declarations; ESLint still reports unused code in our sources |

## Open decisions

| Decision | Status | Blocks | Notes |
| --- | --- | --- | --- |
| Deployment topology | **Unresolved** | M6, M8 | ADR-011 recommends self-hosted Docker; options and trade-offs recorded |
| Prisma major version | Open | M6 | Latest registry version is a release candidate; pin newest stable at M6 |
| Persian calendar library | Open | M10 | Display-only strategy decided; library selection deferred |
| Raw SQL for non-admin users | Deferred | — | Not supported in v1 (ADR-010) |
| Public/anonymous sharing | Deferred | — | Organization-scoped sharing only in v1 |
| External time-series store | Deferred | — | Telemetry stays out of Postgres; product selection later |
| Plugin sandbox/marketplace | Deferred | — | Trusted install only (ADR-006) |
| OpenAPI code generation | Deferred to M6 | M6 | Spec is hand-written; no client generated from it yet |
| Plugin runtime interfaces | Deferred to M3 | M3 | Manifests exist; component/props contracts need React and the renderer |

## What M3 must not assume

- That `@nama/dashboard-types` exports anything beyond schemas, constants and
  migration helpers. There are no components, hooks or adapters yet.
- That `dashboard-core`, `dashboard-builder` or `api-client` export anything; all
  three are still empty modules.
- That the API executes queries, serves dashboards or handles sessions; only
  `/healthz` exists.
- That a realtime gateway exists; only the message contracts are defined, and the
  server side lands with the API.
- That `dashboard-types` renders or imports React; it must remain host-agnostic.
- That the web application renders dashboards; it still renders one static page.

## Verification (M2)

All commands were run from the repository root on Node 24.13.0 with pnpm 10.33.2.

| Check | Command | Result |
| --- | --- | --- |
| Install | `pnpm install` | Lockfile updated for `zod`; no peer warnings |
| Boundaries | `pnpm verify:workspace` | Passes: approved graph, no host imports, single React version |
| Lint | `pnpm lint` | Clean |
| Format | `pnpm format:check` | All files match |
| Typecheck | `pnpm typecheck` | 8 tasks successful (4 packages, web, api) |
| Test | `pnpm test` | 69 tests pass in `dashboard-types`; API health/env tests unchanged |
| Build | `pnpm build` | 6 tasks successful; `dashboard-types` emits ESM, `.d.mts` and a source map |
| Built exports | `node -e "import('./dist/index.mjs')"` | `parseDashboardConfig`, `dashboardConfigSchema`, `realtimeServerMessageSchema`, `widgetManifestSchema`, `runMigrations`, `PLATFORM_LIMITS` all present |

## Next action

M2 is accepted. The next milestone is M3 (SDK foundation): `DashboardProvider`,
runtime context, dependency injection, widget registry, `DashboardViewer`, the
renderer, public exports and a standalone consumer. Do not begin M3 until it is
requested.
