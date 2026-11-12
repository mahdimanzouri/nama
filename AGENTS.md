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

M5 (visualization system) is complete and awaiting acceptance (2026-11-12); M6
(backend and persistence) is the next milestone, is blocked on the ADR-011
deployment decision, and has not started. The workspace contains `apps/web`,
`apps/api`, `examples/standalone-consumer` and exactly four packages:
`@nama/dashboard-types` (contracts), `@nama/dashboard-core` (host-agnostic
runtime: plugin contract, registry, query keys, i18n, layout, theme),
`@nama/dashboard-builder` (React provider, viewer, editor, canvas, renderer,
hooks, plus seven built-in widgets behind the `./widgets` subpath) and
`@nama/api-client` (hand-written typed transport until M6 codegen). Do not create
the target-only packages listed in
`docs/architecture/package-dependencies.md`.

The API keeps all state in memory and reseeds on restart. Demo accounts come from
`DEMO_EDITOR_EMAIL`/`DEMO_EDITOR_PASSWORD` (`demo@nama.local` /
`nama-demo-123`) and `DEMO_VIEWER_EMAIL`/`DEMO_VIEWER_PASSWORD`
(`viewer@nama.local` / `nama-viewer-123`). The web app proxies `/api/*` to
`NAMA_API_URL` (default `http://localhost:3001`).

Working rules for M6 and later:

1. Run commands from the repository root (`pnpm build`, `pnpm lint`,
   `pnpm typecheck`, `pnpm test`, `pnpm verify:workspace`,
   `pnpm verify:consumer`).
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
10. Keep ECharts out of the `@nama/dashboard-builder` main entry: built-in
    widgets live in `./widgets`, import from `echarts/core`, `echarts/charts`,
    `echarts/components` and `echarts/renderers` only, and must keep both
    entries inside the `verify:consumer` budgets.
11. Widget settings must validate through the plugin `configSchema` before
    writing to the draft; never bypass it with a settings-specific parse.
12. Do not implement M6 persistence or auth work while closing M5.

Read `docs/implementation/current-phase.md` before starting any milestone.
