# Technical Debt

**Status:** Seeded at M0 (2026-11-12)

Debt is recorded honestly with impact, owner and target milestone. Items are
removed only when the fix is merged and verified.

| ID | Description | Impact | Owner | Target |
| --- | --- | --- | --- | --- |
| TD-001 | Dashboard canvas is LTR-only; RTL dragging/resizing is unsupported | RTL users edit in a non-mirrored canvas; disclosed in UI | Product/UX | Revisit post-M10, requires new ADR |
| TD-002 | SDK distribution is private-workspace only; no registry or publish pipeline | Consumers must pack/install a tarball | Platform | When a second consumer exists |
| TD-003 | 11 target packages are not created; code lives in four initial packages | Some modules are larger than ideal; boundaries unproven | Architecture | Split on evidence (ADR-001) |
| TD-004 | Architecture documentation is English-only while the product ships Persian | Persian-speaking stakeholders rely on translations | Docs | When a Persian docs owner exists |
| TD-005 | Deployment topology undecided | Blocks M6/M8; auth and realtime choices may need amendments | Product owner | Before M6 (ADR-011) |
| TD-006 | Dependency licenses verified from registry metadata, not installed packages | Transitive licenses and NOTICE obligations unverified | Platform | M1 install + `pnpm licenses list` |
| TD-007 | No plugin sandbox, marketplace or remote loading | Third-party plugins are trusted code | Security | Future ADR |
| TD-008 | No Jalali calendar library selected | Persian date input/display implementation deferred | Frontend | M10 |
| TD-009 | `docs/guides/` absent despite the planning tree | No step-by-step operator/developer guides yet | Docs | M12 |
| TD-010 | Prisma latest is a release candidate; version not pinned | M6 schema/migration work could target an unstable version | Backend | M1/M6 |
| TD-011 | TypeScript 7 compatibility with Next 16/tsdown/ESLint unverified | Upgrade path unclear; repo stays on ^5 | Tooling | M1 |
| TD-012 | OpenAPI is a hand-written proposal; no generated client or drift check | Client types can diverge until codegen exists | Backend | M6 |
| TD-013 | Raw SQL remains available to `datasource.admin` | High-impact capability; relies on audit and read-only credentials | Security | Review each release |
| TD-014 | No performance or accessibility measurements yet | Budgets are documented but unproven | QA | M12 / M10.5 |
| TD-015 | No CI pipeline exists in the repository | Required checks (types, lint, cross-tenant, drift) are not enforced yet | Platform | M1 |
| TD-016 | LTR-only canvas is a documented accessibility limitation | Assistive-technology users get a non-mirrored grid | Accessibility | M10.5 documentation |

## Process

- Every milestone report lists debt added, changed and closed.
- Debt that blocks a milestone gate is promoted to an open decision in
  [current-phase.md](current-phase.md).
- Debt without a target milestone must be accepted explicitly at a gate.
