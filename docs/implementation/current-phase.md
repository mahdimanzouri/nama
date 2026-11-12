# Current Phase

**Current milestone:** M0 — Architecture and decisions
**Status:** Complete pending architecture approval
**Date:** 2026-11-12

## Deliverables

- [x] [Architecture overview](../architecture/overview.md)
- [x] [Package dependencies](../architecture/package-dependencies.md)
- [x] [SDK API proposal](../architecture/sdk-api.md)
- [x] [Dashboard configuration schema](../architecture/dashboard-schema.md)
- [x] [Data model and ERD](../architecture/data-model.md)
- [x] [Data flow](../architecture/data-flow.md)
- [x] [Data source contracts](../architecture/data-source-contracts.md)
- [x] [Realtime protocol](../architecture/realtime-protocol.md)
- [x] [Backend architecture](../architecture/backend-architecture.md)
- [x] [Plugin system](../architecture/plugin-system.md)
- [x] [Security risk assessment](../architecture/security.md)
- [x] [i18n and theme strategy](../architecture/i18n-theme.md)
- [x] [Dependency license review](../architecture/dependency-license-review.md)
- [x] ADR-001..011 in [decisions/](../architecture/decisions/)
- [x] [Widget plugin contract](../plugins/widget-plugin-contract.md)
- [x] [Data-source plugin contract](../plugins/data-source-plugin-contract.md)
- [x] [Plugin authoring guide](../plugins/plugin-authoring.md)
- [x] [OpenAPI proposal](../api/openapi.yaml) and [API conventions](../api/README.md)
- [x] [Roadmap](roadmap.md)
- [x] [Technical debt](technical-debt.md)
- [x] Root `AGENTS.md` project rules appended
- [x] Root `README.md` updated to point at the docs

## Open decisions

| Decision | Status | Blocks | Notes |
| --- | --- | --- | --- |
| Deployment topology | **Unresolved** | M6, M8 | ADR-011 recommends self-hosted Docker; options and trade-offs recorded |
| Prisma major version | Open | M6 | Latest registry version is a release candidate; pin newest stable at M1 |
| TypeScript major | Open | M1 | Latest is 7.0.2; repo uses ^5; verify Next/tsdown/ESLint support |
| Persian calendar library | Open | M10 | Display-only strategy decided; library selection deferred |
| Raw SQL for non-admin users | Deferred | — | Not supported in v1 (ADR-010) |
| Public/anonymous sharing | Deferred | — | Organization-scoped sharing only in v1 |
| External time-series store | Deferred | — | Telemetry stays out of Postgres; product selection later |
| Plugin sandbox/marketplace | Deferred | — | Trusted install only (ADR-006) |
| OpenAPI code generation | Deferred to M6 | M6 | Spec is hand-written in M0 |

## What M1 must not assume

- That `apps/` or `packages/` already exist; M1 creates them.
- That the SDK can import Next.js, read cookies, or access the database.
- That deployment is serverless or containerized; ADR-011 is still open.
- That ECharts, React Grid Layout or Prisma versions are final; re-verify at
  install.
- That the 15 existing target packages should be scaffolded; only four initial
  packages are created.
- That the canvas supports RTL; it does not in v1.

## Verification (M0)

| Check | Result |
| --- | --- |
| All §18.4 and §19 artifacts exist | see [../README.md](../README.md) coverage matrix |
| ADR template completeness | 11 ADRs, eight headings each |
| Cross-document invariants | recorded once in [../README.md](../README.md) and quoted |
| OpenAPI parses | 21 paths, 34 operations, 56 schemas |
| Application code unchanged | verified with `git status` / `git diff --stat` |
| No monorepo scaffolding created | no `apps/`, `packages/`, `turbo.json` |
| Build/test/`next dev` | not run; not required for a docs-only milestone |

## Next action

1. Review ADR-001..011, the SDK API proposal, the dashboard schema, the plugin
   contracts and the authorization model.
2. Resolve ADR-011 (deployment) before M6/M8.
3. On approval, start M1 (monorepo foundation). Do not implement product features
   before the M0 gate is accepted.
