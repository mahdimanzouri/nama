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

M2 (shared contracts and schemas) is complete (accepted 2026-11-12); M3 is the
next milestone and has not started. The workspace contains `apps/web`,
`apps/api` and exactly four packages:
`@nama/dashboard-types`, `@nama/dashboard-core`, `@nama/dashboard-builder`,
`@nama/api-client`. `dashboard-types` owns all Zod schemas and public types; the
other three packages are still empty. Do not create the target-only packages
listed in `docs/architecture/package-dependencies.md`.

Working rules for M3 and later:

1. Run commands from the repository root (`pnpm build`, `pnpm lint`,
   `pnpm typecheck`, `pnpm test`, `pnpm verify:workspace`).
2. Package entry points resolve to `dist`; build before typechecking or running
   a dependent app.
3. Do not add cross-package imports outside the approved graph; the boundary
   script fails the build.
4. Import contracts from `@nama/dashboard-types`; do not duplicate schema
   definitions in the SDK or the API.
5. Do not implement M3 SDK APIs while closing M2.

Read `docs/implementation/current-phase.md` before starting any milestone.
