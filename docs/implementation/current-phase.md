# Current Phase

**Current milestone:** M12 — Production readiness (next)
**Status:** M11 complete, awaiting acceptance (2026-11-12)
**Date:** 2026-11-12

## What the repository looks like now

```text
nama/
├── apps/
│   ├── web/                    # Next.js 16 app: login, dashboard list, editor, viewer
│   │   ├── e2e/                # Playwright locale, theme and screenshot coverage (M10)
│   │   ├── components/
│   │   │   └── app-shell.tsx   # chrome, locale/theme selectors, preferences (M10)
│   │   └── lib/
│   │       ├── data-adapter.ts # SDK HTTP adapter pointed at the /api proxy
│   │       ├── i18n.ts         # en/fa web chrome catalog (M10)
│   │       ├── web-preferences.tsx # locale/theme/i18n context (M10)
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
│   │                           # controls, interaction and transfer schemas (M9);
│   │                           # data-source plugin contract + registry (M11)
│   ├── dashboard-core/         # host-agnostic runtime, HTTP/static data adapters (M3/M7),
│   │                           # WebSocket/SSE realtime adapters (M8),
│   │                           # control/filter/visibility resolution (M9)
│   ├── dashboard-builder/      # provider, viewer, controls and CSS (M3/M4/M9);
│   │                           # editor behind the `./editor` entry (M9);
│   │                           # built-in widgets behind `./widgets` (M5);
│   │                           # plugin authoring surface behind `./plugins` (M11)
│   └── api-client/             # hand-written typed transport (M3.5, extended in M6/M7/M9)
├── examples/
│   ├── standalone-consumer/    # SSR consumer with a custom widget (M3)
│   └── plugin-kit/             # widget + data-source plugins against the contracts (M11)
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

## Delivered in M11

### Public contracts

| Area | Contents |
| --- | --- |
| Widget entry | `@nama/dashboard-builder/plugins` re-exports `defineWidget`, the plugin/render/settings types, `createWidgetRegistry`, `resolveWidgetConfig` and the registration errors without the viewer, editor or built-in widgets |
| Data-source contract | `ServerDataSourcePlugin`, `PluginContext`, `PluginQueryRequest`, limits, `TestResult`, `DatasetSchema`, `DataSourceError` and the validation result types moved into `@nama/dashboard-types`; `apps/api` re-exports them, so a connector package never imports the API |
| Validation | `validateDataSourcePlugin` checks the manifest (kind, semver, name, capabilities), the Zod config and credential schemas, `test`/`validate`/`execute`, `discover` ↔ `schemaDiscovery`, and duplicate kinds; `DataSourcePluginRegistrationError` carries the issues |
| Registry | `createDataSourcePluginRegistry` supports `register`/`unregister`/`get`/`list`/`has` plus explicit replacement; the API builds it at boot and `list()` returns manifests |
| Compatibility | Manifest semver is validated at registration; a newer widget `configVersion` renders the placeholder and an older one without `migrate()` fails instead of being coerced |

### Example package

| Area | Contents |
| --- | --- |
| plugin-kit | `examples/plugin-kit` ships `@example/status-badge` (config version 2, a version-1 migration and a settings panel) and the `memory` data-source adapter (test/validate/execute/discover with limits and truncation) |
| Verification | `verify:consumer` copies the kit next to the packed tarballs, registers both kinds, rejects duplicates and capability mismatches, and asserts migration and truncation; it also budgets the new `./plugins` entry |

### Tests and docs

| Area | Contents |
| --- | --- |
| Types tests | 11 cases for validation, capability consistency, duplicates, replacement, unregistration and execution |
| API tests | Registry defaults, duplicate rejection and capability mismatch through the public registry |
| Docs | Both normative contracts gained import and registration rules; plugin-system, authoring, the SDK entry table, package dependencies and the example README describe the delivered state |

## Delivered in M10 (summary)

| Area | Contents |
| --- | --- |
| i18n | en/fa `DashboardI18n` with host → SDK → English → key fallback, Jalali display (`fa-IR-u-ca-persian`), Persian digit normalization and parsing, localized SDK chrome |
| Web chrome | Typed `WEB_MESSAGES` catalog, translated login/list/editor/viewer, header locale selector (local storage while signed out, preference when signed in) and light/dark/system themes merged into session state |
| Browser coverage | Four Playwright tests: Persian editor→publish→viewer with RTL chrome and the LTR canvas disclosure, theme persistence, Persian dark chrome, header/login screenshots |

Earlier milestones: M10 internationalization and themes; M9 variables, filters,
controls, visibility, interactions, import/export and templates; M8 realtime
gateway, hub, replay and adapters; M7 connector plugins and query limits; M6
PostgreSQL, RLS, authentication, drafts/publish/versions, sharing and embed
tokens; M5 built-in widgets; M4 editor; M3.5 web slice; M3 SDK foundation; M2
contracts; M1 workspace.

## Decisions taken during M11

| Decision | Choice | Why |
| --- | --- | --- |
| Contract location | Data-source contract in `dashboard-types`; the API re-exports it | A plugin package must compile without `apps/api`, and the package already owns the shared request and result shapes |
| Registry placement | Public `createDataSourcePluginRegistry` in `dashboard-types`; the API wraps it | The example package can register a connector through the documented API without a fifth workspace package |
| Capability validation | Reject `discover` ↔ `schemaDiscovery` mismatches at registration | Failing at boot beats failing on the first schema request |
| Duplicate definitions | Delete the API-local interfaces and re-export the public ones | One normative definition, matching the rule that contracts come from `dashboard-types` |
| Editor extensions | The widget `settings` component is the v1 extension point | A generic control/action registry has no consumer yet (TD-072) |
| Example location | `examples/plugin-kit`, copied by `verify:consumer` | Keeps the workspace at four packages while exercising packed-tarball consumption |

## Open decisions

| Decision | Status | Blocks | Notes |
| --- | --- | --- | --- |
| Data-source picker | Open | — | The editor lists sources but has no picker; web widgets and templates bind `demo-source` (TD-043) |
| Server-side control state | Open | — | Filters and variables resolve client-side; the server validates the resolved request only (TD-066) |
| Grouped visibility conditions | Open | — | No parentheses; `and` binds tighter than `or` (TD-063) |
| Viewer/editor layout parity | Open | — | Editor uses React Grid Layout, viewer CSS grid (TD-038) |
| Source push / CDC | Open | — | Realtime polls connectors |
| Cross-process realtime fan-out | Open | — | Channels, replay threads and limits are per process |
| SSE multiplexing | Open | — | One stream per subscription; default dev transport exhausts HTTP/1.1 connections with many live widgets (TD-060) |
| Widget stream rendering | Open | — | Built-ins render snapshots; `stream.latest` is unused (TD-058) |
| SQL/MQTT connectors | Open | — | Kinds are declared but return `501` |
| DNS pinning / egress proxy | Open | — | Guard resolves once (TD-052) |
| Query and login rate limits | Resolved (M12) | — | In-process fixed windows per IP/account and per user; per-replica until a shared store exists (TD-054) |
| E2E in CI | Resolved (M12) | — | A `browser` job provisions Chromium and runs `pnpm test:e2e` (TD-036) |
| Connector hot-loading | Open | — | Connectors are registered in-process at API boot; there is no install or reload path (TD-071) |
| Generic editor extensions | Open | — | Only widget `settings` panels extend the editor; no control or action registry (TD-072) |
| API code generation | Deferred to M12 | — | `api-client` remains hand-written |
| Public/anonymous sharing | Deferred | — | Organization-scoped sharing only |
| External time-series store | Deferred | — | Telemetry stays out of Postgres |
| Plugin sandbox/marketplace | Deferred | — | Trusted install only (ADR-006) |

## What M12 must not assume

- That plugins are sandboxed. Widgets and connectors are trusted installed code;
  there is no remote loading, iframe or marketplace (ADR-006, TD-007).
- That connectors are discovered at runtime. The API registry is built at boot
  from `static` and `rest`; a new connector is host wiring (TD-071).
- That a plugin uses only its declared capabilities. Subscription honors
  `realtime`, discovery honors `schemaDiscovery`, while `export`/`filters` are
  declarations hosts apply and `stream`/`rawSql` are implemented by no connector.
- That the editor has a generic extension registry. Only the widget `settings`
  panel extends it (TD-072).
- That widgets can be registered after the provider mounts. The registry is
  rebuilt from the `widgets` array (TD-033).
- That a `configVersion` bump is self-migrating. Older configs need `migrate()`;
  newer configs render a placeholder and preserve data.
- That `examples/plugin-kit` is a workspace package. `examples/` is outside
  `pnpm-workspace`; `verify:consumer` installs it from tarballs.
- That the `./plugins` entry ships widgets or editor UI. It is contract-only,
  and each builder entry has its own budget.
- That the API exposes plugin installation. Registration happens in-process at
  boot; there is no upload or reload endpoint.
- That the SDK is published. Packages stay private at version 0.0.0 until the
  M12 versioning and release work.
- That the editor can attach a real source. It still has no data-source picker
  (TD-043).
- That the E2E suite runs locally only. It now has a CI job, but it still uses
  the WebSocket transport and Chromium only (TD-036, TD-060, TD-070).

## Verification (M11)

All commands were run from the repository root on Node 24.22.1 with pnpm 10.33.2.

| Check | Command | Result |
| --- | --- | --- |
| Boundaries | `pnpm verify:workspace` | Passes: approved graph, no host imports, single React version |
| Lint | `pnpm lint` | Clean |
| Format | `pnpm format:check` | All files match |
| Typecheck | `pnpm typecheck` | 10 tasks successful |
| Test | `pnpm test` | 295 passed, 6 skipped in 31 files: types 91, core 67, builder 56, api-client 14, api 56 (+6 Postgres skipped), web 11 |
| Build | `pnpm build` | 6 tasks successful, 8 routes |
| Consumer | `pnpm verify:consumer` | `"use client"` on all four entries; 7.9 / 17.6 / 8.1 / 0.1 KiB gzipped under 16 / 20 / 16 / 8 KiB; SSR render; plugin-kit registers a widget and a data-source adapter; single React copy |
| OpenAPI drift | `pnpm verify:openapi` | In sync: 39 served operations, 39 documented |
| Browser E2E | `pnpm test:e2e` | 4 passed: Persian editor→publish→viewer with RTL chrome and LTR canvas, theme persistence, Persian dark chrome and screenshot baselines |

The M11 suites cover data-source manifest and capability validation, duplicate
and replacement rules, the API registry wrapper, widget config migration from
version 1 to 2 through the packed `./plugins` entry, truncation under the runtime
row cap and unknown-field rejection. The 6 Postgres tests skip without
`NAMA_TEST_DATABASE_URL` and always run in CI. The Playwright run needed
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` because the browser download was unreachable in
this environment.

## Next action

M11 is complete and awaiting acceptance. The next milestone is M12 (production
readiness): complete coverage including E2E in CI, performance budgets, a security
review, deployment, migration and key-rotation procedures, API/SDK documentation,
observability, a versioning and deprecation policy, and verification that the
packed SDK is installable and operable on its own.
