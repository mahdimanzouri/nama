# Current Phase

**Current milestone:** M5 — Visualization system (next)
**Status:** M4 complete, awaiting acceptance (2026-11-12)
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
│   ├── dashboard-builder/      # public React API, editor and CSS (M3, editor in M4)
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

## Delivered in M4

### `@nama/dashboard-builder`

| Area | Contents |
| --- | --- |
| Editor API | `DashboardEditor` (with host `children` slot), `DashboardToolbar`, `WidgetPalette`, `WidgetSettings`, `useDashboardEditor` |
| Draft store | Zustand vanilla store owned by the SDK: add/remove/select, keyboard and pointer move/resize, per-breakpoint materialize-on-edit with wider-breakpoint inheritance, preview, dirty tracking, save/publish phases |
| History | Undo/redo bounded to 50 entries; one entry per drag/resize gesture; cleared on publish, restore or draft replacement |
| Canvas | React Grid Layout 2.3.0 (`GridLayout`, `useContainerWidth`, `noCompactor`) on an LTR surface; child items forward all grid-injected props, ref, style and resize-handle children |
| Persistence | Provider `onChange`, `onSave`, `onPublish` and `onConflict`; `SaveContext`/`PublishContext` carry the base revision |
| Conflicts | `RevisionConflictError` mapped to an in-editor banner with expected/current revisions, dismiss and local discard; host-driven reload via the `children` slot |
| Plugins | Optional `defaultQuery` and `defaultDataSourceId` on the widget contract, applied at creation |

### `apps/api`

| Area | Contents |
| --- | --- |
| Versions | `GET /v1/dashboards/:id/versions` (paginated, newest first) and `POST /v1/dashboards/:id/restore` (`If-Match` guarded, copies a version into the draft and increments `revision`, keeps the last 50 versions) |
| Draft/publish | Unchanged `If-Match` semantics; publish still copies the draft, increments the revision and inserts a version atomically in one step |

### `apps/web`

| Area | Contents |
| --- | --- |
| Editor mount | `DashboardEditor` from the SDK; the web app no longer keeps its own editor store |
| Wire-up | Provider receives the draft config/revision plus `onSave`, `onPublish`, `onConflict` and `publishedRevision`; unsaved edits are sent through `api-client` |
| Conflict recovery | `ConflictRecovery` renders inside the editor when a 409 occurs and can fetch the latest draft, replacing local state |
| Versions | `VersionHistory` lists retained versions and restores a selected one with the current revision |
| Widgets | KPI and line plugins declare `defaultQuery`/`defaultDataSourceId` so new widgets render live demo data immediately |

## Decisions taken during M4

| Decision | Choice | Why |
| --- | --- | --- |
| Editor ownership | Draft store lives in `dashboard-builder`, not the web app | Hosts must delegate persistence through `onSave`/`onConflict`; the SDK owns editing behavior |
| Layout source | React Grid Layout 2.3.0, no compactor | Persisted positions stay authoritative; compaction would rewrite configs behind the user's back |
| Grid integration | `forwardRef` item that spreads injected props and renders injected children | RGL clones children for positioning and `react-resizable` injects handles as children; dropping either silently breaks the canvas |
| Breakpoints | Materialize on first edit; inherit from the wider breakpoint until then | Avoids duplicating identical layouts across three breakpoints |
| Conflict resolution | SDK shows state; host fetches and rebases | The SDK has no HTTP client and must not invent endpoints |
| Conflict discard | Reverts to the last locally saved config | Honest local undo without pretending the server changed |
| Version restore | Restore copies into the draft, then normal save/publish | One persistence path; restore cannot bypass `If-Match` |
| Web test runner | `vitest run --passWithNoTests` | Editor tests moved into the SDK package |
| Demo data | Plugin `defaultQuery`/`defaultDataSourceId` | Keeps new widgets useful without host-specific creation logic |

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
| Browser end-to-end test in CI | Deferred | — | M4 was verified with a manual headless-browser walkthrough; no CI job yet |
| Viewer/editor pixel parity | Open | M5 | Editor uses RGL; the viewer canvas still uses CSS grid |

## What M5 must not assume

- That built-in widget types exist beyond KPI and line; those two are
  host-registered plugins in `apps/web`, not an SDK widget library.
- That ECharts is installed; line rendering is a hand-rolled SVG polyline.
- That widget settings are generated; each plugin supplies its own settings
  component and there is no schema-driven form builder.
- That the viewer and editor render identically at pixel level; both derive from
  `LayoutItem`s but use different layout engines.
- That config validation runs while editing; invalid configs are caught on save.
- That realtime, persistence or shared connections exist; only HTTP polling is
  live and the API store is in memory.
- That rate limiting, audit logs, RLS or connection pooling exist.
- That `dashboard-core` may import React at runtime or Next.js at all.
- That a restored version is published; restore updates the draft only.

## Verification (M4)

All commands were run from the repository root on Node 24.22.1 with pnpm 10.33.2.

| Check | Command | Result |
| --- | --- | --- |
| Boundaries | `pnpm verify:workspace` | Passes: approved graph, no host imports, single React version |
| Lint | `pnpm lint` | Clean |
| Format | `pnpm format:check` | All files match |
| Typecheck | `pnpm typecheck` | 10 tasks successful |
| Test | `pnpm test` | 37 core + 31 builder = 68 tests pass (web suite passes with no test files after editor tests moved to the SDK) |
| Build | `pnpm build` | 6 tasks successful, 8 routes |
| Consumer | `pnpm verify:consumer` | Passes: `"use client"` preserved, 12.8 KiB gzipped (16 KiB budget), SSR render, single React copy |
| Browser walkthrough | Headless Chromium via Playwright | Created a dashboard, added KPI + line with live data, dragged and resized items, edited a tablet layout, renamed a widget, undo/redo, preview, save 1→2, publish 2→3, restore 3→4, second-tab save 4→5, stale save rejected with the 409 banner, reload recovered at revision 5 |
| Published-only viewer | Same walkthrough | Viewer showed published revision 3 with the two published widgets and live KPI/line data, no edit affordances |

The browser walkthrough is a scratch script, not a CI test. The in-app browser
panel was unusable for this (hidden tab pauses TanStack Query and Next
hydration), so verification used headless Chromium directly.

## Next action

M4 is complete and awaiting acceptance. The next milestone is M5 (visualization
system): ECharts v6 with module imports, built-in widget types, loading/error/
empty states and chart validation. Do not begin M5 until it is requested.
