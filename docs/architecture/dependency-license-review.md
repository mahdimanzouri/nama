# Dependency License and Compatibility Review

**Status:** Verified through M3.5 (2026-11-12). Versions were checked against the
npm registry on **2026-11-12**; the installed inventory below is the source of
truth for what ships.

## Policy

- Only permissive licenses (MIT, ISC, BSD, Apache-2.0) are accepted by default.
  Apache-2.0 requires preserving `NOTICE`/license text and includes a patent
  grant; that is acceptable.
- Copyleft (GPL/AGPL/LGPL) in distributed SDK code requires explicit legal
  review and is not planned.
- Every new dependency must have a concrete use case; no dependency is added for
  one trivial helper.
- Majors are pinned, the lockfile is committed, and upgrades are reviewed.
- Licenses must be re-verified at install time; registry metadata is not a
  substitute for the shipped `LICENSE` file.

## Verified versions

| Package | Latest at review | License | Role | Notes |
| --- | --- | --- | --- | --- |
| `next` | 16.4.6 (current) | MIT | Web framework | `cacheComponents: true`; routes dynamic; verify SDK SSR safety |
| `react` / `react-dom` | 19.3.0 (current) | MIT | UI runtime | Peer dependency in SDK packages |
| `typescript` | 7.0.2 | Apache-2.0 | Language | Repo currently `^5`; verify tsdown/Next/ESLint support before upgrading |
| `tailwindcss` / `@tailwindcss/turbopack` | 4.3.3 (current) | MIT | Styling | Turbopack loader already configured |
| `eslint` | 9.x (current) | MIT | Linting | Flat config |
| `pnpm` | 10.33.2 (current) | MIT | Package manager | `workspace:*` protocol |
| `turbo` | 2.11.11 | MIT | Task orchestration | Task graph per ADR-001 |
| `tsdown` | 0.23.7 | MIT | Package build | Must preserve `"use client"` |
| `react-grid-layout` | 2.3.0 | MIT | Canvas grid | v2 requires `width` via container-width hook; no RTL; 1.5.x fallback |
| `echarts` | 6.1.0 | Apache-2.0 | Charts | Pin v6 major; import only used modules; bundle budget |
| `next-intl` | 4.15.0 | MIT | Web app i18n | Web only; never in SDK; verify Next 16 compatibility at M1 |
| `zod` | 4.6.7 | MIT | Validation | Shared schema version across packages |
| `zustand` | 5.1.0 | MIT | Editor draft state (inside `dashboard-builder`) | Internal implementation detail; not re-exported by the SDK |
| `@tanstack/react-query` | 5.107.1 | MIT | Server state | Snapshot queries in the builder |
| `fastify` | 5.12.8 | MIT | API framework | Requires Node ≥ 20; repo runs Node 24 |
| `@fastify/cookie` | 11.1.5 | MIT | Session/CSRF cookies | Session and CSRF cookie parsing and signing |
| `@node-rs/argon2` | 2.2.2 | MIT | Password hashing | Prebuilt native binding; used by `apps/api` only |
| `prisma` | 8.0.0-rc.33 | Apache-2.0 | ORM | **Release candidate**; pin latest stable at M1 and record the choice |
| `vitest` | 5.1.0 | MIT | Unit/integration tests | |
| `@playwright/test` | 1.65.0 | Apache-2.0 | E2E | |

## Installed inventory (M1, 2026-11-12)

`pnpm licenses list` over the M1 lockfile (423 package records) returned:

| License | Packages |
| --- | --- |
| MIT | 367 |
| Apache-2.0 | 21 |
| ISC | 14 |
| BSD-2-Clause | 7 |
| BSD-3-Clause | 5 |
| MPL-2.0 | 3 (`axe-core`, `lightningcss`, `lightningcss-linux-x64-gnu`) |
| LGPL-3.0-or-later | 1 (`@img/sharp-libvips-linux-x64`) |
| CC-BY-4.0 | 1 (`caniuse-lite`) |
| CC0-1.0, 0BSD, BlueOak-1.0.0, Python-2.0 | 1 each |

Assessment:

- MPL-2.0 (`lightningcss`, `axe-core`) is used unmodified as a build-time or
  lint-time dependency. File-level copyleft obligations are not triggered by
  linking; no source disclosure is required.
- LGPL-3.0-or-later applies to the prebuilt libvips binary behind `sharp`, which
  Next.js uses for image optimisation. It runs as a separate native library and
  is not statically linked into the SDK or the application bundle.
- CC-BY-4.0 (`caniuse-lite`) is build-time browser data; attribution is not
  surfaced to end users and no redistribution occurs.
- No copyleft dependency exists in the shipped SDK surface. Re-run the scan on
  every lockfile change.

M3.5 added `@fastify/cookie`, `@node-rs/argon2`, `zustand` and `vitest` — all
MIT; the lockfile was re-verified with `pnpm licenses list` on 2026-11-12. M4
moved `zustand` into `@nama/dashboard-builder` and added `react-grid-layout`
2.3.0 (MIT), which brings `react-resizable` and `react-draggable` (both MIT). No
new license categories were introduced.

## Not yet verified (verify at M1)

| Candidate | Purpose | Status |
| --- | --- | --- |
| `ws` or `@fastify/websocket` | WebSocket server | Verify Fastify 5 compatibility |
| `pino` | Structured logging | Likely fastify default; verify |
| `storybook` | Widget/UI development | License and React 19 compatibility |
| `markdownlint-cli2` | Docs lint (CI optional) | Dev-only |
| `@redocly/cli` | OpenAPI lint | Dev-only |

## Compatibility notes

### React Grid Layout 2.x

- The `width` prop is required and supplied through the library's
  container-width hook.
- The library provides no RTL support; drag/resize math is LTR-only. This is the
  reason for the canvas decision (ADR-005).
- React 19.3 compatibility was verified in M4 by
  `packages/dashboard-builder/src/editor/__tests__/grid.test.tsx` and a browser
  walkthrough. Keep 1.5.x as the documented fallback; switching requires a
  recorded decision.
- RGL v2 ships `css/styles.css`, but the SDK keeps a single documented
  stylesheet export: the required grid and resize rules are reproduced in
  `@nama/dashboard-builder/styles.css`, so hosts never import a second CSS file.
  Those rules must be re-checked on every RGL upgrade (technical debt).

### Apache ECharts 6.x

- Pin one major (v6).
- Import only the chart/renderer modules in use; never import the full bundle.
- Enforce a bundle-size budget in CI.
- Chart configuration is expressed in widget terms, not raw ECharts options.

### Next.js 16 and `cacheComponents`

- Dashboard routes are explicitly dynamic.
- Canvas and charts load client-side.
- The SDK must not be imported into a server-only module that touches
  `window`/`document` at evaluation time.
- The package build must preserve `"use client"` directives; CI fails when a
  directive is lost.

### Prisma 8 release candidate

The current `latest` dist-tag resolves to a release candidate. M1 must select
the newest stable release, pin it, and record the version in this document.
Prisma is Apache-2.0; generated client licensing follows the package.

### TypeScript 7

TypeScript 7.0.2 is the latest published version at review time. The repository
uses `^5`. Next 16, ESLint and tsdown compatibility must be verified before any
upgrade; staying on 5.x is acceptable for M1.

### Monorepo resolution

The Next.js bundler workspace root must be configured explicitly so packages
resolve dependencies from the workspace root. Failure to do so produces
duplicate React copies and broken CSS resolution.

## License risk summary

| Risk | Assessment |
| --- | --- |
| Copyleft in shipped SDK | None among planned dependencies |
| Apache-2.0 NOTICE obligations | ECharts, Prisma, Playwright, TypeScript; preserve notices in distributions |
| Patent clauses | Apache-2.0 dependencies include patent grants; no concerns identified |
| Transitive licenses | Must be scanned at M1 (`pnpm licenses list`) and on every lockfile change |
| Unmaintained packages | Re-check activity and security advisories before adoption |

## Review triggers

- A new runtime dependency is proposed.
- A major version upgrade is planned.
- A license changes or a transitive copyleft dependency appears.
- A security advisory affects a pinned version.
- The SDK bundle exceeds its gzipped budget.

## Related documents

- [package-dependencies.md](package-dependencies.md)
- [decisions/ADR-001-monorepo.md](decisions/ADR-001-monorepo.md)
- [decisions/ADR-005-i18n-theme.md](decisions/ADR-005-i18n-theme.md)
- [../implementation/technical-debt.md](../implementation/technical-debt.md)
