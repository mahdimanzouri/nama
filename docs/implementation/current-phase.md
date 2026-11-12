# Current Phase

**Current milestone:** M6 — Backend and persistence (next)
**Status:** M5 complete, awaiting acceptance (2026-11-12)
**Date:** 2026-11-12

## What the repository looks like now

```text
nama/
├── apps/
│   ├── web/                    # Next.js 16 app: login, dashboard list, editor, viewer
│   └── api/                    # Fastify 5 service: auth, dashboards, versions, queries
├── packages/
│   ├── dashboard-types/        # platform constants + runtime contracts (M2)
│   ├── dashboard-core/         # host-agnostic runtime (M3)
│   ├── dashboard-builder/      # public React API, editor and CSS (M3/M4);
│   │                           # built-in widgets behind the `./widgets` entry (M5)
│   └── api-client/             # hand-written typed transport (M3.5)
├── examples/standalone-consumer/  # SSR consumer with a custom widget (M3)
├── scripts/
│   ├── verify-workspace.mjs
│   └── verify-consumer.mjs     # pack → offline install → SSR → distribution checks
├── docs/                       # architecture, decisions, implementation state
├── turbo.json
├── tsconfig.base.json
├── eslint.config.mjs           # single root config for the whole workspace
├── .github/workflows/ci.yml
└── pnpm-workspace.yaml
```

## Delivered in M5

### `@nama/dashboard-builder/widgets`

| Area | Contents |
| --- | --- |
| Built-ins | `kpi`, `line`, `area`, `bar`, `pie`, `gauge`, `table` as `NAMA_WIDGETS`; the subpath keeps the main entry free of ECharts |
| Chart host | One `EChart` canvas component: deferred init after layout, `ResizeObserver` resizing, tree-shaken ECharts 6 registration, CSS-token resolution for canvas painting, `data-theme` re-resolution |
| Option builders | `buildLineOption`, `buildBarOption`, `buildPieOption`, `buildGaugeOption` in widget terms; canvas-rendered rich-text tooltips; reduced-motion aware |
| Settings | Per-widget settings components with text/number/toggle fields; every commit is validated against the plugin `configSchema` before it reaches the draft |
| States | Loading, error and empty states per widget; truncated results disclosed for charts and tables |
| Data projection | `toSeries`, `latestValue`, field selection and locale-aware category/value formatting |

### `@nama/dashboard-builder` (main entry)

| Area | Contents |
| --- | --- |
| Validation feedback | `WidgetSettings` reports `ValidationIssue`s from Zod and clears them when the user edits again; invalid commits never enter the draft |
| Media | `usePrefersReducedMotion` via `useSyncExternalStore` |

### `apps/web`

| Area | Contents |
| --- | --- |
| Widget plugins | `WEB_WIDGETS` wraps the SDK built-ins with demo query bindings for `demo-source`; the host keeps data policy out of the SDK |
| Editor/viewer | Unchanged mount points now render all seven types from live demo data |
| Local widgets | The M4 hand-written KPI/line plugins were removed; the SDK is the only widget implementation |

## Decisions taken during M5

| Decision | Choice | Why |
| --- | --- | --- |
| Widget location | Built-ins ship behind `@nama/dashboard-builder/widgets` | Keeps ECharts out of the main entry (12.5 KiB) while staying inside the four-package graph |
| ECharts imports | Modular `echarts/core` + explicit chart/component registrations | Avoids the full bundle; new widget types extend `registerModules` |
| Demo data | Host wrapper adds `defaultQuery`/`defaultDataSourceId` | The SDK must not assume a data source; M4 already made creation defaults plugin-provided |
| Settings validation | Central `plugin.configSchema.safeParse` in the settings panel | One validation path for every widget; the draft can never hold invalid config |
| Config migration | Widen M4 schemas with defaults, keep `configVersion: 1` | Persisted KPI/line documents keep loading without a migration step |
| Chart theming | Resolve CSS tokens after mount; observe `data-theme` | Canvas cannot paint `var(...)`; re-resolution keeps light/dark switching correct |
| Tooltips | `renderMode: "richText"` | Data labels are never interpolated into HTML |
| Table limits | Render at most `maxRows` (default 25) client-side | Keeps large results readable while the API truncation flag is disclosed |
| Legend/axis language | Category labels use the dashboard locale formatter; canvas stays LTR | Matches the disclosed LTR-only canvas decision (ADR-005) |

## Open decisions

| Decision | Status | Blocks | Notes |
| --- | --- | --- | --- |
| Deployment topology | **Unresolved** | M6, M8 | ADR-011 recommends self-hosted Docker; options and trade-offs recorded |
| Prisma major version | Open | M6 | Latest registry version is a release candidate; pin newest stable at M6 |
| Persian calendar library | Open | M10 | Display-only strategy decided; library selection deferred |
| API code generation | Deferred to M6 | M6 | `api-client` is hand-written; no drift check until codegen lands |
| Raw SQL for non-admin users | Deferred | — | Not supported in v1 (ADR-010) |
| Public/anonymous sharing | Deferred | — | Organization-scoped sharing only in v1 |
| External time-series store | Deferred | — | Telemetry stays out of Postgres; product selection later |
| Plugin sandbox/marketplace | Deferred | — | Trusted install only (ADR-006) |
| Browser end-to-end test in CI | Deferred | — | M4 and M5 were verified with a manual headless-browser walkthrough; no CI job yet |
| Viewer/editor pixel parity | Open | — | Editor uses RGL; the viewer canvas still uses CSS grid; re-targeted from M5 to M9 |

## What M6 must not assume

- That the API is persistent; it is an in-memory seeded store that reseeds on
  restart, with no migrations or connection pooling.
- That authentication hardening exists; demo accounts and cookies are walking-
  skeleton implementations, not the ADR-007 design.
- That RLS, rate limiting, audit logging or credential storage exist; only
  service-layer organization scoping is active.
- That query execution is real; the demo adapter answers from a static dataset
  with no groupBy, and no external source is contacted.
- That realtime exists; only HTTP polling is live and the gateway is M8.
- That widget data bindings are host-configurable; `apps/web` hard-codes demo
  queries per built-in type until M7 introduces data-source selection.
- That charts render multi-series data; every built-in draws one series, and
  there is no variable/filter binding yet (M9).
- That `dashboard-core` may import React at runtime, ECharts, or Next.js.
- That the widgets entry is imported by hosts automatically; consumers opt into
  `@nama/dashboard-builder/widgets` and bundle ECharts themselves.

## Verification (M5)

All commands were run from the repository root on Node 24.22.1 with pnpm 10.33.2.

| Check | Command | Result |
| --- | --- | --- |
| Boundaries | `pnpm verify:workspace` | Passes: approved graph, no host imports, single React version |
| Lint | `pnpm lint` | Clean |
| Format | `pnpm format:check` | All files match |
| Typecheck | `pnpm typecheck` | 10 tasks successful |
| Test | `pnpm test` | 186 tests in 19 files: types 70, core 37, builder 44, api-client 10, api 25 |
| Build | `pnpm build` | 6 tasks successful, 8 routes |
| Consumer | `pnpm verify:consumer` | Passes: `"use client"` preserved on both entries, 12.5 KiB and 6.9 KiB gzipped (16 KiB budgets), SSR render, single React copy |
| Browser walkthrough | Headless Chromium via Playwright | Created a dashboard with all seven widget types; five chart canvases, KPI value and 25 table rows rendered from live data; blank series label and gauge max below min were rejected with field-level messages and no draft change; saved (1→2), published (2→3); published-only viewer rendered in light and dark themes with no console errors or warnings |

The browser walkthrough is a scratch script, not a CI test. During verification a
dev-server restart produced one stale frame where canvases were sized but painted
at animation frame zero; fresh runs rendered correctly and a resize forced the
expected repaint. No product code change was needed, and a production build
renders the same widgets.

## Next action

M5 is complete and awaiting acceptance. The next milestone is M6 (backend and
persistence), which remains blocked on the ADR-011 deployment decision. Do not
begin M6 until it is requested.
