# ADR-001: Monorepo and Initial Package Set

## Status

Accepted

## Date

2026-11-12

**Deciders:** Architecture (M0)

## Context

The product consists of a reusable React SDK, a Next.js web application and an
independent backend API. The SDK must be consumable by a separate React
application without Next.js or platform-backend dependencies. The repository is
currently a single Next.js application at the root, which cannot express these
boundaries.

We need a workspace layout and a minimal package set that makes dependency
direction enforceable without creating packages that contain one trivial file.

## Decision

1. Use **pnpm workspaces** with **Turborepo** for task orchestration and caching.
2. Target layout: `apps/web` (Next.js), `apps/api` (Fastify), `packages/*`, `tooling/*`.
3. Create **exactly four packages in M1**:
   - `@nama/dashboard-types` — public TypeScript types and Zod schemas
   - `@nama/dashboard-core` — runtime, editor engine, layout, data, realtime, built-in widgets
   - `@nama/dashboard-builder` — public React API and builder UI
   - `@nama/api-client` — OpenAPI-based typed client
4. Internal dependencies use `workspace:*`. Turborepo tasks: `build`, `dev`,
   `lint`, `typecheck`, `test`, `clean`, with build order derived from the
   dependency graph.
5. TypeScript strict mode across the workspace; the web app keeps Next.js
   configuration, the API is HTTP-only, the SDK is client-only React.
6. Packages are split further only when a second consumer exists, a boundary
   has measurable value, or build time justifies it. The remaining packages in
   the planning document's target tree are **target-only** and are not created
   by M1.

## Consequences

- Dependency direction is enforceable: `dashboard-types ← dashboard-core ← dashboard-builder`;
  `api-client` is independent of the React packages.
- The web app may depend on SDK packages and `api-client`; the API may depend on
  shared types/schemas but never on React packages.
- M1 must move the existing Next.js app to `apps/web` and remove root build
  artifacts from the pre-monorepo layout.
- `tsdown` builds ESM bundles plus declarations; React and React DOM are peer
  dependencies of the SDK.
- A monorepo toolchain adds CI complexity (task caching, workspace root
  resolution for the Next.js bundler).

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Single package with subpath exports | Cannot enforce "no Next.js in SDK"; harder to version and test independently |
| npm or Yarn workspaces | pnpm is already in use and gives stricter dependency isolation |
| Nx | More configuration surface than needed for four packages |
| Full 15-package split now | Violates the "no package for one trivial module" rule; boundaries not yet proven |

## Related documents

- [../package-dependencies.md](../package-dependencies.md)
- [../overview.md](../overview.md)
- [../dependency-license-review.md](../dependency-license-review.md)

## Review trigger

Re-evaluate when a second consumer of the SDK exists, when build times exceed
the agreed budget, or when a module gains a distinct release cadence.
