# Technical Debt

**Status:** Updated at M1 (2026-11-12)

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
| TD-012 | OpenAPI is a hand-written proposal; no generated client or drift check | Client types can diverge until codegen exists | Backend | M6 |
| TD-013 | Raw SQL remains available to `datasource.admin` | High-impact capability; relies on audit and read-only credentials | Security | Review each release |
| TD-014 | No performance or accessibility measurements yet | Budgets are documented but unproven | QA | M12 / M10.5 |
| TD-016 | LTR-only canvas is a documented accessibility limitation | Assistive-technology users get a non-mirrored grid | Accessibility | M10.5 documentation |
| TD-017 | `dev` builds package dependencies once and does not watch them | Editing `dashboard-core` during `dev` requires a rebuild or restart | Tooling | M3, when SDK source changes constantly |
| TD-018 | `dashboard-core`, `dashboard-builder` and `api-client` export nothing yet | The packages build and link but provide no API; they must not be published | SDK | M3 / M6 |
| TD-019 | No coverage collection or thresholds | Test task emits no artefacts; regressions in coverage are invisible | QA | M2 |
| TD-020 | `docs/` and the planning document are excluded from Prettier | Documentation formatting drifts from code formatting | Docs | When docs are stabilised |
| TD-021 | `apps/web` has no tests | The web shell is only verified manually in M1 | QA | M3.5 walking skeleton |
| TD-022 | Linting and formatting run only from the repository root | No per-package `lint` script; editor integration depends on the root config | Tooling | Revisit if a package needs its own rules |
| TD-023 | Transitive MPL-2.0, LGPL-3.0 and CC-BY-4.0 dependencies are installed | `lightningcss`, `@img/sharp-libvips-linux-x64` and `caniuse-lite` need re-scan on lockfile change | Platform | Every dependency change |
| TD-024 | `allowedDevOrigins` is unset, so non-`localhost` dev hosts are blocked | Next 16 rejects dev resources from e.g. a LAN IP; affects mobile/device testing | Tooling | When device testing starts |

## Closed

| ID | Resolution | Verified |
| --- | --- | --- |
| TD-006 | Installed licenses scanned with `pnpm licenses list`; inventory and assessment recorded in [dependency-license-review.md](../architecture/dependency-license-review.md) | M1 |
| TD-011 | TypeScript 7 investigated: Next 16.4.6 and tsdown 0.23.7 support it, `typescript-eslint@8.72.2` does not; the workspace pins `^5.9.3` and stays on ESLint 9 | M1 |
| TD-015 | `.github/workflows/ci.yml` runs boundaries, lint, format, typecheck, test and build on push and pull request | M1 |

## Process

- Every milestone report lists debt added, changed and closed.
- Debt that blocks a milestone gate is promoted to an open decision in
  [current-phase.md](current-phase.md).
- Debt without a target milestone must be accepted explicitly at a gate.
