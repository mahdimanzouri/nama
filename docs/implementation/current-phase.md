# Current Phase

**Current milestone:** M1 — Monorepo foundation
**Status:** Implemented, awaiting acceptance
**Date:** 2026-11-12

## What the repository looks like now

```text
nama/
├── apps/
│   ├── web/                    # Next.js 16 app (moved from the repository root)
│   └── api/                    # Fastify 5 service, /healthz only
├── packages/
│   ├── dashboard-types/        # platform constants; Zod schemas land in M2
│   ├── dashboard-core/         # empty entry point; public API lands in M3
│   ├── dashboard-builder/      # empty entry point; public API lands in M3
│   └── api-client/             # empty entry point; generated client lands in M6
├── scripts/verify-workspace.mjs
├── docs/                       # M0 architecture and decisions
├── turbo.json
├── tsconfig.base.json
├── eslint.config.mjs           # single root config for the whole workspace
├── .github/workflows/ci.yml
└── pnpm-workspace.yaml
```

## Deliverables

- [x] pnpm workspace (`apps/*`, `packages/*`) with a single root lockfile
- [x] Existing Next.js app moved to `apps/web` with `turbopack.root` pointed at
      the workspace root
- [x] `apps/api` Fastify skeleton with a Zod-validated environment and `GET /healthz`
- [x] Turborepo task graph for `build`, `dev`, `typecheck`, `test`, `clean`
- [x] Strict shared TypeScript config (`strict`, `noImplicitAny`,
      `noUncheckedIndexedAccess`, `verbatimModuleSyntax`)
- [x] ESLint 9 flat config at the root covering every workspace member
- [x] Prettier configuration and `format` / `format:check` scripts
- [x] Exactly four `@nama/*` packages with `workspace:*` links, `tsdown` builds
      (ESM plus declarations) and React as a peer dependency
- [x] `scripts/verify-workspace.mjs` enforcing the approved dependency graph,
      host-agnostic SDK rule and a single React version
- [x] GitHub Actions workflow running boundaries, lint, format, typecheck, test
      and build
- [x] Pre-monorepo root build artifacts removed (`.next/`, `next-env.d.ts`,
      the root Next.js manifest)

## Decisions taken during M1

| Decision | Choice | Why |
| --- | --- | --- |
| TypeScript major | `^5.9.3` | Next 16.4.6 and tsdown 0.23.7 support 7.x, but `typescript-eslint@8.72.2` (pinned by `eslint-config-next`) does not, so lint would break |
| ESLint major | `^9.39.5` | `eslint-config-next@16.4.6` allows 10, but `typescript-eslint@8` peers on `^8 \|\| ^9` |
| ESLint layout | one root config | Avoids per-package config duplication and keeps `eslint .` authoritative; `settings.next.rootDir` points at `apps/web` |
| Package entry points | `dist` only | Source-condition exports would need host bundler configuration the SDK cannot assume |
| `dev` task | `dependsOn: ["^build"]` | After `pnpm clean`, `next dev` must not fail on a missing package `dist` |
| API build | `tsc` (not a bundler) | A Node service should keep its dependencies external |
| API dev | `tsx watch` | Runs TypeScript directly without a separate compiler process |
| API runtime deps | `fastify`, `zod` | Health endpoint plus environment validation; no database or auth yet |

## Open decisions

| Decision | Status | Blocks | Notes |
| --- | --- | --- | --- |
| Deployment topology | **Unresolved** | M6, M8 | ADR-011 recommends self-hosted Docker; options and trade-offs recorded |
| Prisma major version | Open | M6 | Latest registry version is a release candidate; pin newest stable at M6 |
| Persian calendar library | Open | M10 | Display-only strategy decided; library selection deferred |
| Raw SQL for non-admin users | Deferred | — | Not supported in v1 (ADR-010) |
| Public/anonymous sharing | Deferred | — | Organization-scoped sharing only in v1 |
| External time-series store | Deferred | — | Telemetry stays out of Postgres; product selection later |
| Plugin sandbox/marketplace | Deferred | — | Trusted install only (ADR-006) |
| OpenAPI code generation | Deferred to M6 | M6 | Spec is hand-written; the API is not generated from it yet |

## What M2 must not assume

- That `dashboard-core`, `dashboard-builder` or `api-client` export anything; all
  three are empty modules until M3/M6.
- That the API serves anything other than `/healthz`; there is no database,
  session handling or agent-based authorisation yet.
- That the web application renders dashboards; it renders a single static page
  that imports `@nama/dashboard-types`.
- That package builds are watched during `dev`; `dev` builds dependencies once.
  Source-change watch mode is added when SDK code lands.
- That deployment is serverless or containerised; ADR-011 is still open.
- That Zod is available in packages other than `apps/api`; it is introduced to
  `dashboard-types` in M2 with the first schema.

## Verification (M1)

All commands were run from the repository root on Node 24.13.0 with pnpm 10.33.2.

| Check | Command | Result |
| --- | --- | --- |
| Install | `pnpm install` | 6 workspace projects linked, single lockfile |
| Boundaries | `pnpm verify:workspace` | Passes; a planted `import "next/server"` in `dashboard-core` correctly fails with exit code 1 |
| Lint | `pnpm lint` | Clean, no warnings |
| Format | `pnpm format:check` | All files match |
| Typecheck | `pnpm typecheck` | 8 tasks successful (4 packages, web, api) |
| Test | `pnpm test` | 9 tests pass (5 platform invariants, 4 API/env) |
| Build | `pnpm build` | 6 tasks successful; `apps/web` prerenders `/` and `/_not-found` |
| Dev servers | `pnpm dev` | Web on :3000 (HMR connected), API on :3001 |
| API health | `curl :3001/healthz` | `{"status":"ok","version":"0.1.0"}` |
| API production build | `node apps/api/dist/index.js` | Serves `/healthz` on the configured port |
| Web workspace import | browser at `localhost:3000` | Renders values from `@nama/dashboard-types`; no console errors |
| Clean | `pnpm clean` | Removes `dist/`, `.next/` and build info |
| React copies | `pnpm verify:workspace` | One React version in the virtual store |

## Next action

1. Review the M1 workspace layout, task graph and boundary script.
2. On acceptance, start M2 (shared contracts and schemas): public types, Zod
   dashboard/widget/layout/query schemas, plugin manifests, migration interface
   and schema tests.
