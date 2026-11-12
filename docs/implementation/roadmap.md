# Implementation Roadmap

**Status:** Active — M0, M1, M2, M3, M3.5, M4, M5, M6, M7, M8 and M9 complete (2026-11-12)
**Date:** 2026-11-12

Milestones have review gates. Do not begin the next milestone until the current
one meets its acceptance criteria or its remaining work is explicitly accepted.
Effort estimates assume two full-time engineers working in parallel; a single
engineer should expect roughly 1.8× the elapsed time.

## Milestones

| Milestone | Scope | Effort | Gate | Status |
| --- | --- | --- | --- | --- |
| M0 | Architecture and decisions | 1 week | This package approved | Complete |
| M1 | Monorepo foundation | 1 week | Web + API start; workspace package imports; commands pass | Complete |
| M2 | Contracts and schemas | 1.5 weeks | Valid/invalid configs behave; migration tests pass | Complete |
| M3 | SDK foundation | 2 weeks | Separate React app renders without the web app | Complete |
| M3.5 | Walking skeleton (monitoring) | 2 weeks | Login → KPI + line → save/publish/view in CI | Complete |
| M4 | Visual editor | 3 weeks | Edit, move/resize, draft/publish/restore, 409 flow | Complete |
| M5 | Visualization system | 2.5 weeks | Multiple widget types from validated config | Complete |
| M6 | Backend and persistence | 3 weeks | CRUD, publish, versions, shares, embed, RBAC, OpenAPI | Complete |
| M7 | Data infrastructure | 2 weeks | Adapters behind contracts; limits enforced | Complete |
| M8 | Realtime infrastructure | 3 weeks | Shared connections; resume, gap, cleanup | Complete |
| M9 | Advanced dashboard capabilities | 3 weeks | Variables, filters, import/export, templates | Complete |
| M10 | Internationalization and themes | 2 weeks | en/fa, RTL chrome, LTR canvas disclosed, themes | Not started |
| M10.5 | Accessibility | 1.5 weeks | Automated checks and keyboard review pass | Not started |
| M11 | Plugin ecosystem | 2 weeks | Custom widget and data source via public contracts | Not started |
| M12 | Production readiness | 2 weeks | Tests, docs, security, deployment procedures | Not started |

Total: roughly 32 engineer-weeks, excluding review latency and scope changes.

## M0 — Architecture and decisions (this milestone)

**Deliverables:** architecture overview, package dependency graph, SDK API
proposal, dashboard schema, widget and data-source plugin contracts, realtime
protocol, backend module architecture, ERD, i18n/theme strategy, security risk
assessment, ADR-001..011, OpenAPI proposal, roadmap, current phase, technical
debt.

**Acceptance:**

- Every §19 first-assignment output exists and is linked from
  [`../README.md`](../README.md).
- All eleven ADRs use the full template.
- Cross-document invariants match exactly.
- OpenAPI parses and covers every §12.1 path.
- No application code, package scaffolding or dependency changes were made.
- Architecture is reviewed and approved before M1.

**Measured effort:** ~70 engineer-hours for one engineer (~8.75 days), consistent
with the planning document's 1 week × 2 engineers (~80 hours) at the 1.8×
single-engineer factor.

## M1 — Monorepo foundation

**Tasks:** initialize pnpm workspace; move the existing Next.js app to
`apps/web`; add `apps/api` Fastify skeleton; configure Turborepo and strict
TypeScript; add linting/formatting; create the four `@nama/*` packages; configure
environment validation, test runners, CI checks and the bundler workspace root;
remove pre-monorepo root build artifacts.

**Acceptance:**

- Web app starts; API starts with a health endpoint.
- A workspace package imports successfully in the web app.
- `build`, `lint`, `typecheck`, `test`, `clean` run through workspace commands.
- No circular package dependencies.
- React is not duplicated (verify with the package manager).
- No `apps/` or `packages/` code imports from each other in forbidden directions.

## M2 — Shared contracts and schemas

**Status:** Complete — accepted 2026-11-12; see
[current-phase.md](current-phase.md).

**Tasks:** public types; Zod dashboard, widget, layout, query, adapter and
realtime schemas; plugin manifests; migration interface; schema tests and
examples.

**Acceptance:** valid configurations pass, invalid configurations fail with
field paths, and migrations are tested for every supported version.

## M3 — SDK foundation (complete 2026-11-12)

**Tasks:** `DashboardProvider`, runtime context, dependency injection, widget
registry, `DashboardViewer`, renderer, public exports, CSS exports, standalone
consumer example.

**Delivered:** host-agnostic core (registry, widget resolution, layout, i18n,
theme, query helpers) and the React builder (provider, viewer, CSS-grid canvas,
renderer with error boundary and placeholders, hooks, stylesheet export). The
editor, built-in widgets and save callbacks remain M4/M5 work.

**Acceptance:** a separate React application renders a dashboard through the SDK
without the platform web app. Built output preserves `"use client"`. The
consumer test packs and installs the tarball. Verified by
`examples/standalone-consumer` and `pnpm verify:consumer`.

## M3.5 — Walking skeleton (monitoring) (complete 2026-11-12)

**Tasks:** wire the web app to `api-client` and the SDK; login and one
organization; dashboard list/create/save/publish/load; KPI and line widgets over
HTTP polling; viewer against the published config; minimal editor (add, remove,
move, resize, save draft, publish); client-only rendering, SSR safety, theme
tokens; end-to-end test.

**Delivered:** Fastify API with cookie sessions, CSRF protection, tenant-scoped
dashboard reads/writes with `If-Match`, publish snapshots and a demo query
engine; hand-written typed `@nama/api-client`; Next.js app with same-origin API
proxy, login, dashboard list/create, editor shell (add/remove/move/resize, save,
publish, reload-on-conflict) and published-only viewer; KPI and line widgets
polling over HTTP; 34 API/api-client tests plus 10 web tests, and the HTTP slice
exercised in CI.

**Acceptance:** a user logs in, creates a monitoring dashboard with a KPI and a
line widget, saves, publishes and views it. A second viewer sees the published
state and never the draft. The slice runs in CI.

**Verified 2026-11-12:** exercised in a browser end to end (editor publishes at
revision 3, a later draft save reaches revision 4, the viewer sees published
revision 3 with two widgets and no Edit affordance); `pnpm lint`,
`format:check`, `typecheck`, `test`, `build` and `verify:workspace` pass.
Browser-level automation in CI is deferred (technical debt).

**Gate:** M3.5 precedes M4. The full editor is not built on an unproven slice.

## M4 — Visual editor (complete 2026-11-12)

**Tasks:** React Grid Layout v2 with the required container-width API and a
React 19 compatibility test (fallback to 1.5.x only with a recorded decision);
widget insertion; drag/resize on the LTR canvas; per-breakpoint layout editing;
selection; settings panel; toolbar; save/publish/restore callbacks; `409`
conflict handling; undo/redo (50 entries); preview mode; editor tests.

**Delivered:** React Grid Layout 2.3.0 canvas using `useContainerWidth` and
`noCompactor`, with a React 19 integration test; a Zustand draft store inside
`@nama/dashboard-builder` (add/remove/select, keyboard and pointer move/resize,
per-breakpoint materialize-on-edit, 50-entry undo/redo, preview, dirty and save
phases); `DashboardEditor`, `DashboardToolbar`, `WidgetPalette` and
`WidgetSettings`; provider `onChange`/`onSave`/`onPublish`/`onConflict` wiring
with `RevisionConflictError`; version listing and restore in the API and web
app; host-owned conflict recovery through the editor `children` slot; widget
plugins can declare creation defaults (`defaultQuery`, `defaultDataSourceId`).
The web editor now renders the SDK editor instead of its own store.

**Acceptance:** a user creates a dashboard, adds/configures widgets,
moves/resizes them, saves a draft, publishes, reloads and restores a version.
Concurrent stale saves are rejected visibly instead of overwriting.

**Verified 2026-11-12:** a headless-browser walkthrough created a dashboard,
added KPI and line widgets with live data, dragged and resized items, switched
breakpoints and edited a tablet layout, renamed a widget, undid/redid, previewed,
saved (revision 1→2), published (2→3), restored a version (3→4), saved from a
second tab (4→5) and observed the stale save rejected with the conflict banner
and current revision; "Reload latest draft" recovered the editor at revision 5.
`pnpm lint`, `format:check`, `typecheck`, `test`, `build`, `verify:workspace`
and `verify:consumer` pass. The walkthrough is manual; a CI browser suite is
still deferred (technical debt).

## M5 — Visualization system (complete 2026-11-12)

**Tasks:** ECharts v6 with module imports; built-in line/area/bar/pie/gauge/KPI/
table widgets; loading/error/empty states; theme-aware chart rendering; chart
config validation; custom widget example; visualization tests.

**Delivered:** seven built-ins (`kpi`, `line`, `area`, `bar`, `pie`, `gauge`,
`table`) exported from the `@nama/dashboard-builder/widgets` subpath, leaving
the main entry ECharts-free. ECharts 6.1.0 is imported from `echarts/core`,
`echarts/charts`, `echarts/components` and `echarts/renderers` only, with one
shared `EChart` canvas host that initialises after layout, resolves CSS tokens
for canvas painting and re-resolves them on `data-theme` changes. Each widget
carries a Zod `configSchema`, a settings panel and defaults that widen the M4
KPI/line configs without breaking persisted documents (`configVersion` stays 1).
The settings panel validates every commit through the plugin schema and reports
field-level issues instead of writing an invalid config into the draft. Charts
and tables disclose truncated results; charts disable animation under
`prefers-reduced-motion`; tooltips render as canvas rich text, never HTML. The
web app supplies demo query bindings for all seven types in
`apps/web/lib/widgets`, and the M3 standalone consumer still covers the custom
widget example.

**Acceptance:** multiple widget types render from validated configuration and
support independent settings. Bundle budget is enforced.

**Verified 2026-11-12:** a headless-browser walkthrough created a dashboard with
all seven types, confirmed five chart canvases plus the KPI and table rendered
with live data, observed invalid settings (blank series label, gauge max below
min) rejected with field-level messages and no draft change, saved and published,
and verified the published-only viewer in light and dark themes with no console
errors or warnings. `pnpm lint`, `format:check`, `typecheck`, `test`, `build`,
`verify:workspace` and `verify:consumer` pass; the consumer check now enforces
budgets for both the builder (12.5 KiB gzipped) and widgets (6.9 KiB gzipped)
entries. Browser automation in CI remains deferred (technical debt).

## M6 — Backend and persistence (complete 2026-11-12)

**Tasks:** authentication (ADR-007); organizations, memberships, roles and
permissions; dashboard CRUD; draft save/publish with conditional writes; versions
and restore; sharing; embed-token issue/revocation (ADR-009); user preferences;
data-source metadata; credential storage abstraction; audit logging; OpenAPI;
typed client with generation drift check; RLS policies (ADR-008).

**Delivered:** ADR-011 accepted as a self-hosted Docker topology, which removed
the M6 block. PostgreSQL persistence sits behind the existing `Persistence`
facade: a Prisma 7.10.1 schema with migrations for users, sessions,
organizations, memberships, roles/permissions, dashboards, versions, shares,
embed tokens, data sources and encrypted credentials, widget definitions and
audit logs; a Postgres adapter selected when `APP_DATABASE_URL` is set (required
in production) and an in-memory adapter for tests. Every tenant table carries
`ENABLE` + `FORCE ROW LEVEL SECURITY` with an `organization_id` policy driven by
`SET LOCAL app.organization_id`, and repositories run inside a per-request
transaction through AsyncLocalStorage; an empty/unset context returns no rows.
Authentication uses Argon2id (`@node-rs/argon2`), opaque session tokens stored
hashed, CSRF-protected mutations and server-side logout. RBAC ships the
14-permission catalog and five system roles, with member/role administration and
guards against removing the last owner or yourself. Dashboards gained metadata
update/delete, sharing by user/role/organization, and scoped embed tokens (256-bit
opaque, stored SHA-256 hashed, pre-bound variables/filters, 60 s–1 year expiry,
revocable, plaintext returned once). Data-source metadata CRUD encrypts
credentials with AES-256-GCM under `CREDENTIAL_ENCRYPTION_KEY` and never returns
them; the connectivity test is a `501` stub until M7. User preferences store
locale, theme, timezone and default organization. Audit rows are written for
authentication, dashboard, share, embed-token and administration actions. The
OpenAPI document now marks all served operations `implemented`, and
`pnpm verify:openapi` fails on drift between Fastify routes and the document.
The typed `api-client` covers the whole surface and the CI workflow provisions a
PostgreSQL service, applies migrations/seeds and runs the Postgres integration
suite through `NAMA_TEST_DATABASE_URL`.

**Acceptance:** authorized users save a draft, publish and retrieve the published
dashboard. Stale saves are rejected. Unauthorized and cross-tenant requests are
denied. Embed tokens cannot exceed the issuer's permissions.

**Verified 2026-11-12:** with `NAMA_TEST_DATABASE_URL` pointed at PostgreSQL 17,
six integration tests passed: the save → stale-409 → publish → viewer-published
lifecycle, viewer draft denial, cross-tenant list/read/save denial, embed-token
scope and cross-tenant revocation denial, credential encryption and
non-exposure, RLS returning zero rows without context or under a foreign
organization, and audit rows for the exercised actions. `pnpm lint`,
`format:check`, `typecheck`, `test`, `build`, `verify:workspace`,
`verify:consumer` and `verify:openapi` pass. `verify:openapi` reports 36 served
operations against 37 documented. Idempotency keys are documented but not yet
enforced; code generation remains deferred (technical debt).

## M7 — Data infrastructure

**Tasks:** query manager; TanStack Query; HTTP and static adapters; backend query
execution contract; validation; cache and cancellation; timeout and result
limits; data-source plugin example.

**Acceptance:** widgets retrieve normalized data through the adapter contract
without coupling to a source technology. Limits are enforced and truncation is
reported.

**Delivered:** server-side connector runtime in `apps/api/src/modules/queries`:
a `ServerDataSourcePlugin` contract (manifest, capabilities, config/credential
schemas, `test`/`validate`/`execute`/`discover`), a registry with the `static`
and `rest` connectors, and a shared local evaluation of filters, ordering,
limits and aggregations. `QueryService` loads tenant-scoped sources through
`Persistence.withTenant`, decrypts credentials just in time, resolves per-source
limits clamped to the platform maxima (15 s, 10,000 rows, 5 MiB, concurrency 4),
aborts on timeout or client disconnect, validates plugin results with
`queryResultSchema`, and truncates rows/bytes with an accurate flag. The REST
connector enforces an egress guard (http/https only; loopback, private,
link-local, multicast and metadata ranges rejected; redirects refused), maps
upstream statuses to `DATASOURCE_UNREACHABLE`, `DATASOURCE_AUTH_FAILED`,
`RATE_LIMITED` and `QUERY_INVALID`, and never logs credentials. `POST
/v1/queries/validate`, `GET /v1/data-sources/:id/schema` and a real `POST
/v1/data-sources/:id/test` (audited) complete the surface. `@nama/dashboard-core`
ships `createHttpDataAdapter` (host-injected base URL, transport, headers and
CSRF token) and `createStaticDataAdapter` (in-memory evaluation), and `apps/web`
now uses the SDK HTTP adapter instead of a hand-written one. TanStack Query
snapshot caching and the 250 ms stream buffer remain in `dashboard-builder` from
M5 and are exercised through the new adapters.

**Verified 2026-11-12:** adapter tests cover filters, ordering, truncation,
aggregation, relative ranges and envelope errors; API tests cover the REST
connector end to end, private-target rejection, 504 timeout, byte-limit
rejection, row-cap truncation, validate, schema discovery, connectivity test and
the 501 path for connectors without discovery. `pnpm lint`, `format:check`,
`typecheck`, `test`, `build`, `verify:workspace`, `verify:consumer` and
`verify:openapi` pass; drift check reports 38 served and 38 documented
operations. Not delivered: SQL/MQTT connectors (their kinds stay declared but
return `501 NOT_IMPLEMENTED`), DNS-pinning against rebinding between resolution
and connect, cross-process concurrency limits, and realtime/SSE adapters
(M8).

## M8 — Realtime infrastructure

**Status:** Delivered (2026-11-12).

**Tasks:** shared WebSocket manager; subscription registry; cleanup; SSE adapter;
authentication and per-subscription authorization; reconnect with backoff;
resume/snapshot/gap recovery; heartbeats; event validation and sequences; bounded
replay buffers; bounded streaming buffer; server throttling; integration tests.

**Delivered:** `apps/api/src/modules/realtime` (gateway, connection, authorizer,
hub, replay buffer, options); `GET /v1/stream`; SDK
`createWebSocketRealtimeAdapter`/`createSseRealtimeAdapter`; `useWidgetQuery`
subscriptions; web wiring; 8 gateway integration tests and 8 client adapter
tests.

**Acceptance:** multiple widgets share connections without independent sockets;
subscriptions clean up; reconnect and gap recovery work.

**Verified by:** gateway tests (shared socket, replay, stale-resume gap, auth
timeout, embed scoping, invalid token, SSE resume, heartbeat close), client tests
(connection sharing, cleanup, reconnect/resume, duplicates and gaps, heartbeat,
embed subprotocol, revocation) and the workspace checks recorded in
[current-phase.md](current-phase.md).

**Blocked by:** ADR-011 deployment decision for WebSocket hosting and fan-out —
accepted as Option A.

## M9 — Advanced dashboard capabilities

**Tasks:** variables; variable-binding resolution; global filters; time-range
selection; cross-widget interactions; templates; import/export; version restore;
sharing; responsive preview; conditional visibility.

**Acceptance:** reusable, interactive monitoring and analytical dashboards work
end to end.

**Delivered:** controls resolution in `dashboard-core` (variables, filters,
dashboard time range, visibility grammar and query flattening); runtime control
state plus `DashboardControls` and `useDashboardControls`; chart click →
variable interaction; schema-validated variable/filter authoring, per-widget
visibility and interaction settings in the editor; portable export/import with
id regeneration; built-in host templates and `POST /v1/dashboards` accepting a
validated starting `config`. Version restore and sharing were already delivered
by M4 and M6, and responsive preview by M4's breakpoint switcher.

**Verified by:** core controls tests, builder control/viewer tests, editor store
tests, API create-with-config tests in `dashboards.test.ts`, web template tests
and the workspace checks recorded in [current-phase.md](current-phase.md).

**Deferred:** the data-source picker in the editor remains open (TD-043); the
web app still binds built-in widgets to `demo-source`.

## M10 — Internationalization and themes

**Status:** Delivered (2026-11-12).

**Tasks:** English and Persian messages; RTL chrome with LTR canvas disclosure;
light/dark/system themes; locale-aware numbers, dates and times; Jalali display
and input strategy; theme-aware ECharts; visual regression and E2E coverage.

**Acceptance:** the same dashboard works in English and Persian, in all three
theme modes. Chrome mirrors correctly; the canvas stays LTR by design and the
limitation is visible to users.

**Delivered:** en/fa SDK catalog completion with Jalali display
(`fa-IR-u-ca-persian`) and Persian digit input in controls and settings; a typed
`web.*` chrome catalog applied to every page, form and state; an app-shell
language selector and theme selector with server-persisted preferences that
merge into session state without remounting the editor; RTL chrome with the
LTR-only canvas disclosure in both editor and viewer; and a Playwright suite
(`pnpm test:e2e`) covering the Persian editor→publish→viewer flow, theme
persistence across reloads and screenshot baselines.

**Verified by:** `dashboard-core` i18n tests, `apps/web` catalog tests, the three
Playwright tests and the workspace checks recorded in
[current-phase.md](current-phase.md).

**Deferred:** E2E is not wired into CI yet (TD-036); the default dev realtime
transport remains SSE, so the browser suite pins the WebSocket transport (TD-060).

## M10.5 — Accessibility

**Tasks:** keyboard navigation and focus management; accessible menus, dialogs
and settings; a table/summary alternative for every chart; screen-reader labels
and live regions for save/publish/conflict; automated checks in E2E; document the
LTR canvas limitation for assistive technology.

**Acceptance:** core flows pass automated checks and a keyboard-only review.
Charts expose equivalent data to non-visual users.

## M11 — Plugin ecosystem

**Tasks:** finalize the public plugin SDK; manifest validation; compatibility
checks; visualization and editor-extension registration; server-side data-source
plugin interface; capability checks; examples; lifecycle and security docs.

**Acceptance:** a separate test package registers a custom widget and a
data-source adapter through documented contracts.

## M12 — Production readiness

**Tasks:** complete unit/integration/E2E coverage; consumer tests; Storybook;
performance tests against budgets; security review; deployment, migration,
backup and key-rotation docs; API/SDK docs; logging, monitoring, error tracking;
versioning and deprecation policy; packed-SDK installation verification.

**Acceptance:** the SDK is consumable independently; the platform can be deployed
and operated with documented procedures.

## Gate rules

- No milestone starts before the previous gate is accepted or remaining work is
  explicitly waived.
- Scope added to a milestone requires re-estimation at the gate.
- ADR-011 is accepted (Option A, self-hosted Docker); M8 relies on its
  long-lived API process for WebSocket hosting.
- Configuration schema changes require migration tests before merge.
- Cross-tenant and `If-Match` tests run on every change to affected modules.

## Related documents

- [current-phase.md](current-phase.md)
- [technical-debt.md](technical-debt.md)
- [../README.md](../README.md)
