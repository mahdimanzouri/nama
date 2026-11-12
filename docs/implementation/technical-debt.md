# Technical Debt

**Status:** Updated at M4 (2026-11-12)

Debt is recorded honestly with impact, owner and target milestone. Items are
removed only when the fix is merged and verified; closed items are listed at the
end so IDs stay stable.

| ID | Description | Impact | Owner | Target |
| --- | --- | --- | --- | --- |
| TD-001 | Dashboard canvas is LTR-only; RTL dragging/resizing is unsupported | RTL users edit in a non-mirrored canvas; disclosed in UI | Product/UX | Revisit post-M10, requires new ADR |
| TD-002 | SDK distribution is private-workspace only; no registry or publish pipeline | Consumers must pack/install a tarball | Platform | When a second consumer exists |
| TD-003 | 11 target packages are not created; code lives in four initial packages | Some modules are larger than ideal; boundaries unproven | Architecture | Split on evidence (ADR-001) |
| TD-004 | Architecture documentation is English-only while the product ships Persian | Persian-speaking stakeholders rely on translations | Docs | When a Persian docs owner exists |
| TD-005 | Deployment topology undecided | Blocks M6/M8; auth and realtime choices may need amendments | Product owner | Before M6 (ADR-011) |
| TD-007 | No plugin sandbox, marketplace or remote loading | Third-party plugins are trusted code | Security | Future ADR |
| TD-008 | No Jalali calendar library selected | Persian date input/display implementation deferred | Frontend | M10 |
| TD-009 | `docs/guides/` absent despite the planning tree | No step-by-step operator/developer guides yet | Docs | M12 |
| TD-010 | Prisma latest is a release candidate; version not pinned | M6 schema/migration work could target an unstable version | Backend | M6 |
| TD-012 | OpenAPI is hand-written and `api-client` is a hand-written transport; no generated client or drift check | Client types can diverge until codegen exists | Backend | M6 |
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
| TD-027 | Migration steps must be registered by callers; there is no on-disk discovery or version table | Import/read paths must wire migrations explicitly; forgetting one fails closed with `missing_migration` | Backend | M6, when persistence lands |
| TD-028 | Widget plugins must be function components; class components are rejected by the erased registry type | A host with class-based widgets needs a wrapper or a contract change | SDK | Revisit if a consumer needs classes |
| TD-030 | Realtime subscription lifecycle and stream buffering have no client-side test | No jsdom/client renderer in the workspace yet; only SSR is exercised | QA | M8, with the gateway |
| TD-032 | `verify:consumer` installs with `--offline` and needs React, TanStack Query and zod in the local pnpm store | A clean CI runner must prime the store first (lockfile install) | Tooling | M12 CI hardening |
| TD-033 | Changing the `widgets` array identity rebuilds the registry; dynamic register/unregister after mount is unsupported | Hosts must pass a stable array; live plugin registration waits for M11 | SDK | M11 |
| TD-034 | API state is an in-memory seeded store with demo accounts; nothing survives a restart and there are no migrations | Data loss on restart; the walking skeleton cannot be demoed without reseeding | Backend | M6 |
| TD-035 | The API has no rate limiting, audit logging, RLS enforcement or connection limits | ADR-007/008 controls are unimplemented; only service-layer scoping is active | Backend | M6 |
| TD-036 | No browser end-to-end test in CI; M4 was verified with a scratch headless Playwright script | Regressions in the editor/viewer UI are caught manually, not on every change | QA | M8, with Playwright |
| TD-037 | The settings panel covers the widget title plus whatever each plugin renders; there is no schema-driven form or per-field validation feedback | Invalid configs are caught on save rather than while editing | Frontend | M5, with chart config validation |
| TD-038 | Editor and viewer use different layout engines: React Grid Layout for editing, CSS grid for viewing | Widgets can differ by a pixel or two between modes; no parity test exists | Frontend | M5 |
| TD-039 | The grid and resize rules from React Grid Layout are reproduced in the SDK stylesheet instead of importing the package CSS | RGL upgrades can silently break drag/resize styling | SDK | Every RGL upgrade |

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

## Process

- Every milestone report lists debt added, changed and closed.
- Debt that blocks a milestone gate is promoted to an open decision in
  [current-phase.md](current-phase.md).
- Debt without a target milestone must be accepted explicitly at a gate.
