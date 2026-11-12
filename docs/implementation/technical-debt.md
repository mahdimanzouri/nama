# Technical Debt

**Status:** Updated at M9 (2026-11-12)

Debt is recorded honestly with impact, owner and target milestone. Items are
removed only when the fix is merged and verified; closed items are listed at the
end so IDs stay stable.

| ID | Description | Impact | Owner | Target |
| --- | --- | --- | --- | --- |
| TD-001 | Dashboard canvas is LTR-only; RTL dragging/resizing is unsupported | RTL users edit in a non-mirrored canvas; disclosed in UI | Product/UX | Revisit post-M10, requires new ADR |
| TD-002 | SDK distribution is private-workspace only; no registry or publish pipeline | Consumers must pack/install a tarball | Platform | When a second consumer exists |
| TD-003 | 11 target packages are not created; code lives in four initial packages | Some modules are larger than ideal; boundaries unproven | Architecture | Split on evidence (ADR-001) |
| TD-004 | Architecture documentation is English-only while the product ships Persian | Persian-speaking stakeholders rely on translations | Docs | When a Persian docs owner exists |
| TD-007 | No plugin sandbox, marketplace or remote loading | Third-party plugins are trusted code | Security | Future ADR |
| TD-008 | No Jalali calendar library selected | Persian date input/display implementation deferred | Frontend | M10 |
| TD-009 | `docs/guides/` absent despite the planning tree | No step-by-step operator/developer guides yet | Docs | M12 |
| TD-013 | Raw SQL remains available to `datasource.admin` | High-impact capability; relies on audit and read-only credentials | Security | Review each release |
| TD-014 | No performance or accessibility measurements yet | Budgets are documented but unproven | QA | M12 / M10.5 |
| TD-016 | LTR-only canvas is a documented accessibility limitation | Assistive-technology users get a non-mirrored grid | Accessibility | M10.5 documentation |
| TD-017 | `dev` builds package dependencies once and does not watch them | Editing `dashboard-core` during `dev` requires a rebuild or restart; M4 did not change this | Tooling | Revisit when package iteration slows development |
| TD-019 | No coverage collection or thresholds | Test task emits no artefacts; regressions in coverage are invisible | QA | M12 CI hardening |
| TD-020 | `docs/` and the planning document are excluded from Prettier | Documentation formatting drifts from code formatting | Docs | When docs are stabilised |
| TD-022 | Linting and formatting run only from the repository root | No per-package `lint` script; editor integration depends on the root config | Tooling | Revisit if a package needs its own rules |
| TD-023 | Transitive MPL-2.0, LGPL-3.0 and CC-BY-4.0 dependencies are installed | `lightningcss`, `@img/sharp-libvips-linux-x64` and `caniuse-lite` need re-scan on lockfile change | Platform | Every dependency change |
| TD-024 | `allowedDevOrigins` is unset, so non-`localhost` dev hosts are blocked | Next 16 rejects dev resources from e.g. a LAN IP; affects mobile/device testing | Tooling | When device testing starts |
| TD-025 | `apps/web` runs with `noUnusedLocals: false` | Next 16 generates `.next/dev/types/validator.ts` with unused declarations; only ESLint checks our app sources for unused code | Tooling | When Next stops emitting that file, or routes are added and verified |
| TD-027 | Dashboard `schemaVersion` migration steps must be registered by callers; there is no on-disk discovery or version table (database migrations use Prisma and are unaffected) | Export/import exists, but both the editor import and the API create path call `parseDashboardConfig` without migrations; forgetting to register one fails closed with `missing_migration` | SDK | Before `schemaVersion` changes |
| TD-028 | Widget plugins must be function components; class components are rejected by the erased registry type | A host with class-based widgets needs a wrapper or a contract change | SDK | Revisit if a consumer needs classes |
| TD-030 | Client adapter lifecycle is covered, but the `useWidgetQuery` buffer/flush path has no React test | The SDK connection manager is tested; widget-level subscription behavior still relies on review | QA | M12 |
| TD-032 | `verify:consumer` installs with `--offline` and needs React, TanStack Query and zod in the local pnpm store | A clean CI runner must prime the store first (lockfile install) | Tooling | M12 CI hardening |
| TD-033 | Changing the `widgets` array identity rebuilds the registry; dynamic register/unregister after mount is unsupported | Hosts must pass a stable array; live plugin registration waits for M11 | SDK | M11 |
| TD-035 | The API has no request rate limiting or connection-pool sizing; RLS and audit logging now exist | A burst can exhaust the pool or the database; login has no throttling | Backend/Security | M12 |
| TD-036 | No browser end-to-end test in CI; M4 and M8 were verified with suites and manual checks | Regressions in the editor/viewer UI and realtime wiring are caught manually, not on every change | QA | M12 |
| TD-038 | Editor and viewer use different layout engines: React Grid Layout for editing, CSS grid for viewing | Widgets can differ by a pixel or two between modes; no parity test exists | Frontend | M12, with visual/E2E coverage |
| TD-039 | The grid and resize rules from React Grid Layout are reproduced in the SDK stylesheet instead of importing the package CSS | RGL upgrades can silently break drag/resize styling | SDK | Every RGL upgrade |
| TD-040 | Every built-in chart renders a single series; there is no groupBy, multi-series, stacked or combo chart support | Users cannot compare categories on one chart; the demo dataset has no grouping | Product/Frontend | When a grouped dataset exists |
| TD-041 | Canvas charts stay LTR inside RTL chrome: axes, legends and tooltips are not mirrored, only text is locale-formatted | Persian dashboards read chart axes left-to-right; disclosed alongside the LTR canvas | Product/UX | Same review as TD-001 |
| TD-042 | Charts expose only `role="img"` with the widget title; there is no data-table fallback or keyboard interaction | Screen-reader users cannot inspect chart values | Accessibility | M10.5 |
| TD-043 | `apps/web` still hard-codes a demo query per built-in type, and the editor lists registered data sources but offers no picker; the built-in templates also bind to `demo-source` | Real sources cannot be attached without code changes; template dashboards only work against the demo connector | Frontend | M11 or when a data-source catalog UI is scheduled |
| TD-052 | The egress guard resolves DNS once and relies on disabled redirects; the connect address is not pinned | A hostile DNS answer could rebind between resolution and connect (SSRF) | Security | M12 hardening |
| TD-053 | `postgres`, `mysql` and `mqtt` data-source kinds are accepted by metadata CRUD but no connector exists; execution returns `501 NOT_IMPLEMENTED` | Users can register sources that cannot run queries | Backend | When SQL/MQTT connectors are scheduled |
| TD-054 | Query concurrency limits are per process and there is no request rate limiting | Multiple API replicas multiply the effective concurrency; bursts are unbounded | Backend | M12 |
| TD-055 | Local query evaluation exists twice: the API plugin helper and the SDK static adapter | Filter/aggregation semantics can drift between offline and server execution | SDK/Backend | Revisit if a shared evaluation package is justified |
| TD-056 | The REST connector has no schema discovery; `GET /v1/data-sources/:id/schema` returns `501` for it | Hosts cannot list REST fields before writing a query | Backend | M9 or when the data-source picker needs it |
| TD-044 | ECharts modules are registered manually in `registerModules`; adding a chart type requires an SDK code change | A host cannot add an ECharts chart type without forking the built-ins | SDK | When a third-party chart plugin is requested |
| TD-045 | `api-client` is still hand-written; `verify:openapi` compares routes only | Request/response shapes can drift from the spec without detection | Backend | M12 |
| TD-046 | `Idempotency-Key` is accepted but not enforced | A retried `POST` can duplicate an effect | Backend | M12 |
| TD-048 | RLS covers tenant tables only; global tables (`users`, `permissions`, `sessions`) rely on application scoping | A repository bug on a global table is not caught by the database | Backend/Security | M12 security review |
| TD-049 | Audit rows are write-only; there is no read/export endpoint or retention policy | Operators cannot query the audit trail yet | Backend | M12 |
| TD-050 | The Postgres integration suite skips unless `NAMA_TEST_DATABASE_URL` is set | Isolation regressions are caught in CI but not by a plain local `pnpm test` | QA | M12 CI hardening |
| TD-057 | Realtime re-executes each subscribed query on a timer (`REALTIME_POLL_INTERVAL_MS`, default 5 s); connectors have no push, webhook or CDC path | Live data lags by up to one poll interval and each subscription costs a query per tick | Backend | When a connector gains push support |
| TD-058 | Built-in widgets render `snapshot-then-stream` snapshots; none consume `data.stream.latest` | Raw `stream` mode is only useful to custom widgets, and the 500-sample client buffer is currently write-only for built-ins | SDK | M9 or when a high-frequency widget is requested |
| TD-059 | Realtime channels, replay threads and connection limits live in one API process; fan-out to other replicas needs Redis or sticky routing | A second replica would not share subscriptions, exceed per-process limits, and lose the 60 s resume window on failover | Backend | When a second instance exists |
| TD-060 | SSE opens one HTTP stream per subscription and the web app uses SSE by default behind the Next proxy | Many live widgets exhaust browser per-origin HTTP/1.1 connections; WebSocket requires exposing the API origin via `NEXT_PUBLIC_NAMA_WS_URL` | Frontend/Platform | Revisit with deployment or HTTP/2 |
| TD-061 | Per-connection limits exist (50 subscriptions, 120 messages per 10 s), but there is no global connection cap or socket backpressure signal | A client fleet can exhaust file descriptors; slow sockets are only bounded by the replay buffer | Backend | M12 hardening |
| TD-062 | `normalizeDigits` exists in `dashboard-core` but is not applied to control values or query parameters | Persian/Arabic-Indic digits typed into a number or date control can fail validation or reach a connector unnormalized | SDK | M10, with Persian input |
| TD-063 | The visibility grammar has no parentheses and `and`/`or` precedence is fixed (comparisons and `and`, then `or`); malformed expressions fail open | Complex conditions need grouping through separate variables; a typo makes a widget visible rather than hiding it | SDK | When operators request grouped conditions |
| TD-064 | Controls, visibility and cross-widget selections are covered by SSR and store tests, not a browser test; the chart click path is only asserted through `onSelect` wiring | Real pointer interaction and refetch behaviour are verified manually | QA | M12 browser suite |
| TD-065 | Editor import replaces the whole draft after a confirm dialog; there is no merge, diff or partial import | An accidental import loses the current draft from the working tree unless the user undoes it | Frontend | Revisit if host needs merge workflows |
| TD-066 | Variable and filter resolution happens in the SDK; the server validates the resolved request but cannot re-derive control state | A custom client can choose different filters/parameters within the request contract (subject to authorization and connector validation) | Architecture | Accepted; revisit with server-side control state |
| TD-067 | `verify:consumer` totals an entry's budget by following static relative imports only; a dynamically imported chunk would be excluded from the measurement | A future lazy-loaded feature could exceed the budget without the check noticing | Tooling | When the SDK introduces a dynamic import |

## Closed

| ID | Resolution | Verified |
| --- | --- | --- |
| TD-006 | Installed licenses scanned with `pnpm licenses list`; inventory and assessment recorded in [dependency-license-review.md](../architecture/dependency-license-review.md) | M1 |
| TD-011 | TypeScript 7 investigated: Next 16.4.6 and tsdown 0.23.7 support it, `typescript-eslint@8.72.2` does not; the workspace pins `^5.9.3` and stays on ESLint 9 | M1 |
| TD-015 | `.github/workflows/ci.yml` runs boundaries, lint, format, typecheck, test and build on push and pull request | M1 |
| TD-026 | `WidgetPlugin`, render props and settings props implemented in `dashboard-core`; manifests stay in `dashboard-types` so it remains React-free | M3 |
| TD-018 | `api-client` exports a typed transport: `createApiClient`, `ApiError`, `RevisionConflictError` and the request/response types, covered by 9 tests | M3.5 |
| TD-021 | `apps/web` has unit tests for the editor store and dashboard-config helpers; `pnpm test` runs them with the workspace | M3.5 |
| TD-029 | The SDK editor owns the draft and bridges `onSave`/`onPublish`/`onConflict`; `apps/web` passes those callbacks to the provider | M4 |
| TD-031 | React Grid Layout 2.3.0 canvas with drag, resize, container-width measurement, selection and per-breakpoint editing; covered by `grid.test.tsx` and a browser walkthrough | M4 |
| TD-037 | Widget settings validate every commit through the plugin `configSchema`, show field-level Zod issues and keep invalid values out of the draft; covered by `widgets.test.tsx`, a builder test and a browser walkthrough | M5 |
| TD-005 | ADR-011 accepted Option A (self-hosted Docker); backend and security docs updated to match | M6 |
| TD-010 | Prisma pinned to stable 7.10.1 with `@prisma/adapter-pg`; migrations and seed verified against PostgreSQL 17 | M6 |
| TD-012 | `pnpm verify:openapi` compares every served Fastify route with `docs/api/openapi.yaml` and fails on drift; code generation remains tracked as TD-045 | M6 |
| TD-034 | PostgreSQL persistence behind the `Persistence` facade; migrations, seed and restart-surviving state verified by the Postgres integration suite | M6 |
| TD-047 | Connector registry and `QueryService` execute/validate/discover/test; the connectivity endpoint runs the connector test, audits it and maps failures to the query error codes | M7 |

## Process

- Every milestone report lists debt added, changed and closed.
- Debt that blocks a milestone gate is promoted to an open decision in
  [current-phase.md](current-phase.md).
- Debt without a target milestone must be accepted explicitly at a gate.
