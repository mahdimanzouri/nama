# Current Phase

**Current milestone:** M10 — Internationalization and themes (next)
**Status:** M9 complete, awaiting acceptance (2026-11-12)
**Date:** 2026-11-12

## What the repository looks like now

```text
nama/
├── apps/
│   ├── web/                    # Next.js 16 app: login, dashboard list, editor, viewer
│   │   └── lib/
│   │       ├── data-adapter.ts # SDK HTTP adapter pointed at the /api proxy
│   │       ├── realtime-adapter.ts # SSE over /api, or WS via NEXT_PUBLIC_NAMA_WS_URL
│   │       └── templates.ts    # host templates bound to the demo connector
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
│   ├── dashboard-types/        # platform constants + runtime contracts (M2);
│   │                           # controls, interaction and transfer schemas (M9)
│   ├── dashboard-core/         # host-agnostic runtime, HTTP/static data adapters (M3/M7),
│   │                           # WebSocket/SSE realtime adapters (M8),
│   │                           # control/filter/visibility resolution (M9)
│   ├── dashboard-builder/      # provider, viewer, controls and CSS (M3/M4/M9);
│   │                           # editor behind the `./editor` entry (M9);
│   │                           # built-in widgets behind the `./widgets` entry (M5)
│   └── api-client/             # hand-written typed transport (M3.5, extended in M6/M7/M9)
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

## Delivered in M9

### Contracts and resolution

| Area | Contents |
| --- | --- |
| Schema | `variables` and `filters` on `DashboardConfig`; `interaction` and `visibility` on `DashboardWidget`; `DashboardControlValues`; all validated by `parseDashboardConfig` |
| Transfer | `exportDashboardConfig`/`importDashboardConfig` regenerate widget IDs, rewrite layout references and reject unknown schema versions |
| Variables | `resolveControlValues` merges typed choices over declared defaults; `defaultVariables` produces the initial set |
| Filters | `resolveDashboardFilters` resolves each filter through its `variable` or `value` binding, falling back to the filter's own value |
| Binding | `buildControlledQueryRequest` injects variables, dashboard time range and filters into the outgoing `QueryRequest` |
| Time range | Precedence is dashboard control, then the widget query's `timeRangeVariable` binding, then the persisted `query.timeRange` |
| Visibility | `evaluateVisibilityCondition`/`isWidgetVisible` support `==`, `!=`, `>`, `>=`, `<`, `<=`, `contains` and `and`/`or`/`not`; comparisons and `and` bind tighter, and malformed expressions fail open |
| Interactions | A chart selection writes its raw category value into the named variable, which every bound widget re-resolves |

### SDK runtime

| Area | Contents |
| --- | --- |
| Control state | `useDashboardControlsState` holds choices (not resolved values) per provider mount; `initialControls` seeds and `onControlsChange` reports resolved values |
| Controls UI | `DashboardControls` renders time-range presets, one field per variable type, and reset; `hideTimeRange`/`hideReset` trim it; nothing is persisted |
| Filters in queries | Dashboard filters apply only to widgets whose query `fields` name the filtered field, so a filter cannot blank an unrelated widget |
| Visibility | Hidden widgets perform no query at all; the editor passes `ignoreVisibility` so hidden widgets stay on the board while authoring |
| Selection | `WidgetRenderer` turns a plugin `onSelect` into `setVariable(widget.interaction.variable, value)` |
| Entries | The editor moved to `@nama/dashboard-builder/editor`; the root entry no longer loads React Grid Layout, the store or the authoring panels |

### Editor authoring

| Area | Contents |
| --- | --- |
| Dashboard settings | Variable and filter authoring validated against the schema before commit; adding, editing and removing entries is one undoable step each |
| Widget settings | Per-widget visibility expression and interaction variable |
| Store | `setVariables`, `setFilters`, `upsertVariable`, `removeVariable`, `updateWidget` and `importConfig`; renaming a variable rewrites bindings and interactions, removing one clears dependent interactions |
| Import/export | Toolbar downloads the config as JSON and imports a file after confirmation, replacing the draft as a single undoable commit |

### Web and API

| Area | Contents |
| --- | --- |
| Templates | Two host templates (`operations`, `trend-analysis`) bound to the always-available `demo-source` connector, with desktop/tablet/mobile placements |
| Create | The dashboard list creates a blank dashboard or one seeded from a template |
| API | `POST /v1/dashboards` accepts a full `config` (name now optional), validates it and applies the supplied name/description; OpenAPI and `api-client` updated |
| Viewer | The published viewer renders `DashboardControls` for the dashboard's variables |

## Delivered in M8 (unchanged summary)

| Area | Contents |
| --- | --- |
| Gateway | `/ws/v1` pre-upgrade auth, `GET /v1/stream` SSE fallback, per-subscription `datasource.execute` checks |
| Hub | Channels shared per query, 60 s replay threads, send-time sequences, `snapshot-then-stream` and 250 ms throttled `stream` |
| SDK | Shared-socket WebSocket adapter, per-subscription SSE adapter, `useWidgetQuery` snapshot writes into TanStack Query |
| Web | SSE through `/api` by default; `NEXT_PUBLIC_NAMA_WS_URL` selects direct WebSocket |

Earlier milestones: M7 connector plugins and query limits; M6 PostgreSQL, RLS,
authentication, drafts/publish/versions, sharing and embed tokens; M5 built-in
widgets; M4 editor; M3.5 web slice; M3 SDK foundation; M2 contracts; M1 workspace.

## Decisions taken during M9

| Decision | Choice | Why |
| --- | --- | --- |
| Where controls resolve | SDK, in `dashboard-core` | The same resolution serves any host and keeps the request contract; the server still validates the resolved request (TD-066) |
| Control storage | Choices, resolved on read | A retyped variable falls back to its default without discarding surviving choices |
| Filter scope | Only widgets whose query `fields` include the field | A global filter cannot blank widgets that never selected the field |
| Time-range precedence | Control → query binding → persisted range | Explicit user choice wins without rewriting widget configs |
| Visibility failure mode | Fail open | A typo shows a widget rather than silently hiding data |
| Interactions | Write the selected value into a variable | Reuses one binding model; no event bus |
| Templates' starting filter | `contains` with an empty value | Matches every timestamp, so a dashboard stays populated until the first chart click |
| Import semantics | Whole-draft replace after confirmation | Merge semantics would need conflict rules no host has asked for (TD-065) |
| Editor entry | `@nama/dashboard-builder/editor` | Viewer-only hosts stop paying for the authoring UI; root entry fell from 18.8 to 7.8 KiB gzipped |
| Consumer budget | Measured over entry + chunk closure | Multi-entry builds move shared code into chunks a host still loads |

## Open decisions

| Decision | Status | Blocks | Notes |
| --- | --- | --- | --- |
| Data-source picker | Open | — | The editor lists sources but has no picker; web widgets and templates bind `demo-source` (TD-043) |
| Server-side control state | Open | — | Filters and variables resolve client-side; the server validates the resolved request only (TD-066) |
| Grouped visibility conditions | Open | — | No parentheses; `and` binds tighter than `or` (TD-063) |
| Viewer/editor layout parity | Open | — | Editor uses React Grid Layout, viewer CSS grid (TD-038) |
| Source push / CDC | Open | — | Realtime polls connectors |
| Cross-process realtime fan-out | Open | — | Channels, replay threads and limits are per process |
| SSE multiplexing | Open | — | One stream per subscription |
| Widget stream rendering | Open | — | Built-ins render snapshots; `stream.latest` is unused (TD-058) |
| SQL/MQTT connectors | Open | — | Kinds are declared but return `501` |
| DNS pinning / egress proxy | Open | — | Guard resolves once (TD-052) |
| Query rate limiting | Open | — | Only per-source concurrency is bounded |
| Persian calendar library | Open | M10 | Display-only strategy decided; library selection deferred |
| Persian digit normalization | Open | M10 | `normalizeDigits` exists but is not applied to control input (TD-062) |
| API code generation | Deferred to M12 | — | `api-client` remains hand-written |
| Public/anonymous sharing | Deferred | — | Organization-scoped sharing only |
| External time-series store | Deferred | — | Telemetry stays out of Postgres |
| Plugin sandbox/marketplace | Deferred | — | Trusted install only (ADR-006) |

## What M10 must not assume

- That control values persist. They are provider-mount state seeded from
  `initialControls`; a reload returns every control to its default.
- That a filter affects every widget. It applies only to widgets whose query
  `fields` include the filtered field.
- That visibility expressions can be grouped. There are no parentheses and
  malformed expressions make widgets visible.
- That hidden widgets stop existing. The editor renders them with
  `ignoreVisibility`; the viewer does not mount them.
- That interactions are an event bus. They write a value into a variable; there
  is no cross-dashboard or host-level selection channel.
- That number and date controls accept Persian digits. They take ASCII input;
  `normalizeDigits` is not wired into control values yet (TD-062).
- That the SDK ships a locale or theme switcher. Locale, direction and theme are
  host props; M10 adds in-product switching.
- That the root entry can import editor modules. Editor surfaces live behind
  `@nama/dashboard-builder/editor`, and both entries have separate budgets.
- That template dashboards work against a real source. They bind the virtual
  `demo-source` connector.
- That the editor offers a data-source picker; it does not (TD-043).
- That editor and viewer lay widgets out identically; the engines differ
  (TD-038).
- That there is an end-to-end browser test; M9 behaviour is covered by SSR,
  store, API and template tests (TD-036, TD-064).

## Verification (M9)

All commands were run from the repository root on Node 24.22.1 with pnpm 10.33.2.

| Check | Command | Result |
| --- | --- | --- |
| Boundaries | `pnpm verify:workspace` | Passes: approved graph, no host imports, single React version |
| Lint | `pnpm lint` | Clean |
| Format | `pnpm format:check` | All files match (generated Prisma output ignored) |
| Typecheck | `pnpm typecheck` | 10 tasks successful |
| Test | `pnpm test` | 274 passed, 6 skipped in 29 files: types 80, core 64, builder 56, api-client 14, api 53 (+6 Postgres skipped), web 7 |
| Build | `pnpm build` | 6 tasks successful, 8 routes |
| Consumer | `pnpm verify:consumer` | `"use client"` on all three entries; 7.8 / 17.3 / 8.1 KiB gzipped under 16 / 20 / 16 KiB; SSR render; single React copy |
| OpenAPI drift | `pnpm verify:openapi` | In sync: 39 served operations, 39 documented |

The M9 suites cover control resolution and time-range precedence, filter
binding through `fields`, visibility comparisons and malformed expressions,
interaction-driven variable writes, hidden widgets skipping queries, the
controls markup and reset, editor variable/filter authoring with rename and
removal rewrites, import replacing the draft as one undoable commit, template
validation against `parseDashboardConfig`, and `POST /v1/dashboards` accepting,
renaming and rejecting configs. The 6 Postgres tests skip without
`NAMA_TEST_DATABASE_URL` and always run in CI.

## Next action

M9 is complete and awaiting acceptance. The next milestone is M10
(internationalization and themes): English and Persian messages, RTL chrome with
the disclosed LTR canvas, light/dark/system themes, locale-aware numbers and
dates, the Jalali display strategy, theme-aware ECharts, and visual/E2E coverage.
