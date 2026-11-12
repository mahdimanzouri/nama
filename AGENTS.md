<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project objective

Build an extensible, reusable, multilingual dashboard platform consisting of a
React SDK, a Next.js web application and an independent backend API.

## Architectural rules

1. The dashboard SDK must not depend on Next.js.
2. The SDK must not access the backend database directly.
3. Authentication and authorization must be injected through explicit interfaces.
4. TanStack Query owns server state.
5. Zustand owns local editor state.
6. Dashboard configurations are versioned and validated.
7. Data acquisition is independent of visualization rendering.
8. Plugins use documented public contracts.
9. Untrusted plugins never execute arbitrary code in the main application context.
10. Backend authorization is authoritative.
11. Support Persian and English.
12. Support RTL and LTR for chrome, text, forms and charts; the grid canvas is
    LTR-only in v1 and the limitation must be disclosed.
13. Support light, dark and system themes.
14. Avoid circular dependencies.
15. Avoid unnecessary abstractions.
16. Preserve compatibility of persisted dashboard configurations.
17. Viewers only ever see published configurations.
18. Configuration writes are conditional on the last known revision.

## Development rules

- Work incrementally, milestone by milestone.
- Do not implement all milestones in one operation.
- Inspect the repository before changing it.
- Plan before substantial changes.
- Test after each meaningful increment.
- Document significant decisions.
- Do not claim completion without verification.
- Report technical debt honestly.
- Ask for approval at milestone gates.

## CI-enforced rules (target, from M1)

- Type checking and linting run on every change with `noImplicitAny` enabled; an
  intentional escape hatch requires a justification comment and is reviewed.
- Package builds fail when built output loses a `"use client"` directive or
  exceeds the bundle-size budget.
- Shipped packages do not export placeholder implementations; stubs live under
  test-only paths excluded from builds.
- Schema changes require passing migration tests for every supported
  `schemaVersion` before merge.
- Cross-tenant isolation and `If-Match` conflict tests run on every change to the
  affected modules.

## Current milestone

M11 (plugin ecosystem) is complete and awaiting acceptance (2026-11-12); M12
(production readiness) is next and has not started.
ADR-011 is accepted as a self-hosted Docker topology. The workspace contains
`apps/web`, `apps/api`,
`examples/standalone-consumer`, `examples/plugin-kit` and exactly four packages:
`@nama/dashboard-types` (contracts, including the `ServerDataSourcePlugin`
contract and data-source registry), `@nama/dashboard-core` (host-agnostic
runtime: plugin contract, registry, query keys, i18n, layout, theme, HTTP/static
data adapters, WebSocket and SSE realtime adapters, control/filter/visibility
resolution), `@nama/dashboard-builder` (React provider, viewer, controls, canvas,
renderer and hooks; the editor behind the `./editor` subpath; seven built-in
widgets behind `./widgets`; the widget registration surface behind `./plugins`)
and `@nama/api-client` (hand-written typed transport; codegen is deferred). Do
not create the target-only packages listed in
`docs/architecture/package-dependencies.md`.

The API persists product data in PostgreSQL behind the `Persistence` facade when
`APP_DATABASE_URL` is set (required in production) and falls back to the seeded
in-memory adapter otherwise. `docker-compose.dev.yml` runs PostgreSQL 17 with an
owner role for migrations (`DATABASE_URL`) and a non-superuser runtime role
(`APP_DATABASE_URL`); row-level security is only meaningful with the runtime
role. Demo accounts are seeded from `DEMO_EDITOR_EMAIL`/`DEMO_EDITOR_PASSWORD`
(`demo@nama.local` / `nama-demo-123`) and
`DEMO_VIEWER_EMAIL`/`DEMO_VIEWER_PASSWORD` (`viewer@nama.local` /
`nama-viewer-123`). The web app proxies `/api/*` to `NAMA_API_URL` (default
`http://localhost:3001`), which also carries the SSE stream endpoint; WebSocket
upgrades are not proxied by Next.js rewrites, so live sockets use
`NEXT_PUBLIC_NAMA_WS_URL` pointing at the API.

Working rules for M12 and later:

1. Run commands from the repository root (`pnpm build`, `pnpm lint`,
   `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm verify:workspace`,
   `pnpm verify:consumer`, `pnpm verify:openapi`).
2. Package entry points resolve to `dist`; build before typechecking or running
   a dependent app.
3. Do not add cross-package imports outside the approved graph; the boundary
   script fails the build.
4. Import contracts from `@nama/dashboard-types`; do not duplicate schema
   definitions in the SDK or the API.
5. `dashboard-core` stays React-runtime-free; TanStack Query may only be used in
   `dashboard-builder`.
6. Built output must keep `"use client"`; `pnpm verify:consumer` must stay green.
7. Keep viewer responses free of draft data: `GET /v1/dashboards/:id` returns
   `publishedConfig` and `publishedRevision` only.
8. Preserve `If-Match` conflict handling and the 409 `REVISION_CONFLICT` payload;
   draft ownership and `onSave`/`onPublish`/`onConflict` live in the SDK editor.
9. Keep the editor draft inside `dashboard-builder`; hosts must not reimplement
   editor state. React Grid Layout child components must forward injected props,
   refs, styles and children.
10. Keep ECharts out of the `@nama/dashboard-builder` root entry: built-in
    widgets live in `./widgets`, import from `echarts/core`, `echarts/charts`,
    `echarts/components` and `echarts/renderers` only, and must keep the root,
    editor, widgets and plugins entries inside their `verify:consumer` budgets.
    Editor surfaces (editor, toolbar, palette, settings, draft hook) live behind
    `./editor`, and the root entry must not import React Grid Layout, the editor
    store or the authoring panels.
11. Widget settings must validate through the plugin `configSchema` before
    writing to the draft; never bypass it with a settings-specific parse.
12. Keep every tenant table under `ENABLE` + `FORCE ROW LEVEL SECURITY`; set the
    tenant with a transaction-local `SET LOCAL app.organization_id` and never run
    tenant queries as the owner role.
13. Add a Prisma migration for every schema change; CI applies migrations and the
    seed before tests, and the Postgres integration suite must stay green when
    `NAMA_TEST_DATABASE_URL` is set.
14. Never return credential material. `CREDENTIAL_ENCRYPTION_KEY` stays out of
    the repository, decryption rejects unknown key versions, and a missing key
    keeps returning `503 CREDENTIALS_NOT_CONFIGURED`.
15. Update `docs/api/openapi.yaml` with every route change; `pnpm verify:openapi`
    must report the contract in sync.
16. Query execution goes through `QueryService` and the connector registry; never
    add a route that decrypts credentials or contacts an external system
    directly. Keep the tighten-only limit clamp and the row/byte truncation flag.
17. Network connectors must use the egress guard: http/https only, private,
    loopback, link-local, multicast and metadata ranges rejected, redirects
    disabled. `ALLOW_PRIVATE_DATA_SOURCES` is test-only.
18. SDK data adapters stay host-injected: no cookies, CSRF, base URLs or
    credentials inside `dashboard-core`; the host passes base URL, transport,
    headers and CSRF token.
19. Realtime adapters keep one connection per adapter instance: subscriptions
    multiplex over a single socket, `release()` sends `unsubscribe` and only
    closes the socket when the last subscription leaves, and the SSE adapter
    stays the web default behind `/api`.
20. Realtime authentication is authoritative at handshake and per subscription:
    session cookies resolve over WebSocket, embed tokens use the
    `nama.embed.<token>` subprotocol (Bearer on SSE), and every subscription
    re-checks `datasource.execute` plus the published-dashboard scope. Never
    widen an embed token.
21. Preserve the realtime wire contract: `/ws/v1`, `subscribe` carries the full
    `query`, sequences are allocated at send time, snapshots replace client
    state, replay holds 60 s or 1,000 events (whichever is smaller), and the
    server throttles `stream` at 250 ms. Do not add message types without
    updating `docs/architecture/realtime-protocol.md` and the Zod schemas.
22. `useWidgetQuery` subscribes only for plugins with `capabilities.realtime`;
    keep its 250 ms flush and `REALTIME_DEFAULTS.maxBufferedSamples` buffer, and
    write snapshots into the TanStack cache instead of component state.
23. Do not implement work from a later milestone while closing the current one.
24. Control values (variables, dashboard time range) are runtime SDK state:
    never persist them in the configuration, never fetch with them resolved
    server-side, and build every request through `buildControlledQueryRequest`.
25. Dashboard filters apply only to queries whose `fields` include the filtered
    field; a `filter.value` binding resolves by filter id first, then field.
26. `interaction.variable` must name a declared variable, and the value written
    is the raw category (never a formatted label). Hidden widgets must not fetch.
27. Import through `importDashboardConfig` so ids are regenerated and the shared
    schema validates; never hand-roll an import or create a dashboard from
    unvalidated configuration.
28. Web chrome strings live in `apps/web/lib/i18n.ts` (`web.*` keys) and reach
    components through `createWebI18n`/`useWebI18n`; do not hard-code user-facing
    English, and do not translate authored content (dashboard titles, saved
    widget labels, widget configs).
29. Read locale, theme and direction from `WebPreferencesProvider`; persist
    changes through the app shell's optimistic preference write (server
    preference for signed-in users, `nama.locale` in `localStorage` otherwise)
    and merge them into session state instead of reloading the editor.
30. Format every number and date embedded in translated copy with
    `i18n.formatNumber`/`i18n.formatDate`; keep storage in UTC ISO, keep Jalali
    display-only (`fa-IR-u-ca-persian`), and normalize Persian/Arabic-Indic
    digits with `normalizeDigits`/`parseLocalizedNumber` at input boundaries.
31. Keep the editor and viewer canvases `dir="ltr"` under RTL chrome and render
    `builder.canvas.ltrNotice`; never mirror the grid or chart axes (TD-001).
32. `pnpm test:e2e` runs Playwright from the root against the dev servers with
    `NEXT_PUBLIC_NAMA_WS_URL` set. Next keeps inactive route segments mounted,
    so scope chrome locators with `:visible`; regenerate screenshot baselines
    deliberately and keep `test-results/` out of commits. CI runs it in a
    dedicated browser job.
33. Widget plugins register through `defineWidget`/`createWidgetRegistry` from
    `@nama/dashboard-builder/plugins`; a plugin must not import `./editor`, and
    the plugins entry stays inside its 8 KiB `verify:consumer` budget.
34. Data-source plugins implement `ServerDataSourcePlugin` from
    `@nama/dashboard-types`, pass `validateDataSourcePlugin` and register only
    through `createDataSourcePluginRegistry`. Keep capability flags in sync with
    the methods implemented (a method the capabilities do not declare is a
    registration error), and never decrypt credentials outside `execute`.
35. `examples/plugin-kit` is an example, not a workspace package: it is installed
    from packed tarballs by `pnpm verify:consumer` and must keep printing
    `PLUGIN_KIT_OK`. Do not add a fifth `@nama/*` package or a workspace
    dependency on it.
36. Keep `Idempotency-Key` enforcement on create endpoints: reserve after
    auth + CSRF, settle the stored response in `onSend`, release the reservation
    on failure, and never persist embed-token responses (plaintext tokens).
37. Route audit access through `modules/audit`: reads and exports require
    `organization.audit.read` and the caller's own organization, exports are
    audited, and pruning stays in the per-organization retention job
    (`AUDIT_RETENTION_DAYS`).

Read `docs/implementation/current-phase.md` before starting any milestone.
