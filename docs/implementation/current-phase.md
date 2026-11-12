# Current Phase

**Current milestone:** M7 — Data infrastructure (next)
**Status:** M6 complete, awaiting acceptance (2026-11-12)
**Date:** 2026-11-12

## What the repository looks like now

```text
nama/
├── apps/
│   ├── web/                    # Next.js 16 app: login, dashboard list, editor, viewer
│   └── api/                    # Fastify 5 service with PostgreSQL persistence
│       ├── prisma/             # schema, migrations, seed
│       ├── scripts/            # OpenAPI drift check
│       └── src/
│           ├── http/           # auth hooks and request helpers
│           ├── infrastructure/ # persistence, RLS scoping, credentials, RBAC, sessions
│           └── modules/        # auth, dashboards, data-sources, organizations,
│                               # preferences, queries
├── packages/
│   ├── dashboard-types/        # platform constants + runtime contracts (M2)
│   ├── dashboard-core/         # host-agnostic runtime (M3)
│   ├── dashboard-builder/      # public React API, editor and CSS (M3/M4);
│   │                           # built-in widgets behind the `./widgets` entry (M5)
│   └── api-client/             # hand-written typed transport (M3.5, extended in M6)
├── examples/standalone-consumer/  # SSR consumer with a custom widget (M3)
├── infra/postgres/init.sql     # owner role, runtime role grants
├── docker-compose.dev.yml      # PostgreSQL 17 on host port 5433
├── scripts/                    # workspace, consumer and OpenAPI verification
├── docs/                       # architecture, decisions, implementation state
├── turbo.json
├── tsconfig.base.json
├── eslint.config.mjs           # single root config for the whole workspace
├── .github/workflows/ci.yml
└── pnpm-workspace.yaml
```

## Delivered in M6

### Persistence and tenancy

| Area | Contents |
| --- | --- |
| Database | PostgreSQL 17; Prisma 7.10.1 with the `prisma-client` generator, ESM output in `apps/api/src/generated/prisma`, migrations for every product entity |
| Facade | `Persistence` repository interface with `withTenant(scope, fn)`; Postgres adapter when `APP_DATABASE_URL` is set (required in production), in-memory adapter for tests and demos |
| RLS | `ENABLE` + `FORCE ROW LEVEL SECURITY` on every tenant table; policy compares `organization_id` with `SET LOCAL app.organization_id`; `NULLIF(..., '')` makes an unset context fail closed with zero rows |
| Runtime role | `nama_app` is non-owner and has no `BYPASSRLS`; migrations run as the owner role through `prisma migrate deploy` |
| Transactions | Each authenticated request runs inside a transaction that sets the tenant GUC; the Prisma transaction client travels through AsyncLocalStorage |

### Authentication and administration

| Area | Contents |
| --- | --- |
| Passwords | Argon2id via `@node-rs/argon2` |
| Sessions | 256-bit opaque token, SHA-256 hashed in `sessions`, `nama_session` + `nama_csrf` cookies, server-side logout |
| RBAC | 14-permission catalog and system roles `owner`, `administrator`, `editor`, `viewer`, `data-source-administrator`; permission checks on every route |
| Organizations | Member list/invite/update/remove and custom role create/update/delete, with guards for system roles, last-owner removal and self-removal |
| Preferences | `GET`/`PATCH /v1/me/preferences` for locale, theme, timezone and default organization |

### Dashboards and sharing

| Area | Contents |
| --- | --- |
| CRUD | List/create/read, metadata `PATCH`, `DELETE`; viewer reads return `publishedConfig`/`publishedRevision` only |
| Draft/publish | `PUT /draft` and publish require `If-Match`; stale writes return `409 REVISION_CONFLICT` with `currentRevision` |
| Publish transaction | Copies draft, increments revision, inserts `DashboardVersion`, prunes to 50 versions |
| Restore | Copies a retained version into the draft and increments revision |
| Shares | `GET`/`PUT /v1/dashboards/:id/shares` for user, role or organization subjects with `view`/`edit`; `If-Match` protected |
| Embed tokens | `POST`/`DELETE /v1/dashboards/:id/embed-tokens`; 256-bit opaque token stored SHA-256 hashed, dashboard-scoped, pre-bound variables/filters, 60 s–1 year expiry, revocable, plaintext returned once (ADR-009) |

### Data sources and audit

| Area | Contents |
| --- | --- |
| Metadata | `GET`/`POST /v1/data-sources`, `GET`/`PATCH`/`DELETE /v1/data-sources/:id` with pagination and RBAC |
| Credentials | AES-256-GCM with a version byte, `CREDENTIAL_ENCRYPTION_KEY`; write-only, never returned; `503 CREDENTIALS_NOT_CONFIGURED` without a key |
| Connectivity test | `POST /v1/data-sources/:id/test` returns `501 NOT_IMPLEMENTED` until M7 |
| Audit | `audit_logs` rows for login, dashboard, share, embed-token, data-source and organization actions |

### Contracts and CI

| Area | Contents |
| --- | --- |
| OpenAPI | Every served operation marked `x-m0-status: implemented`; `pnpm verify:openapi` compares Fastify routes with the document and fails on drift |
| Typed client | `@nama/api-client` covers dashboards, shares, embed tokens, data sources, organizations, roles, preferences and session `roleNames` |
| CI | `postgres:17-alpine` service, init script, migrations, seed, and the Postgres integration suite via `NAMA_TEST_DATABASE_URL` |
| Development | `docker-compose.dev.yml` and `infra/postgres/init.sql` mirror the production owner/runtime role split |

## Decisions taken during M6

| Decision | Choice | Why |
| --- | --- | --- |
| ORM | Prisma 7.10.1 with `@prisma/adapter-pg` | Stable release; typed queries and migrations without a query-builder abstraction |
| RLS context | Transaction-local `SET LOCAL` from AsyncLocalStorage, per request | No pool leakage between tenants; the runtime role cannot bypass policies |
| Unset tenant context | `NULLIF(current_setting(...), '')::uuid` in every policy | A reset GUC reads as `''`; without `NULLIF` the cast raises instead of returning no rows |
| Repository facade | Keep `Persistence` and add a Postgres adapter | Existing services and memory tests stay unchanged; swapping stores is a composition decision |
| Session storage | Hashed tokens in PostgreSQL | Logout and revocation are server-side; no signed-cookie replay after revocation |
| Embed tokens | Hash lookup, not JWT | A signed token cannot be revoked; §12.4's "signed" wording is resolved in ADR-009 |
| Credentials | AES-256-GCM with a key-version prefix | Rotation can add versions without re-encrypting everything; decryption rejects unknown versions |
| Version retention | Prune to 50 inside the publish transaction | History stays bounded without a background job |
| Idempotency | Accept the header but do not enforce it yet | Enforcement needs a stored-key table and payload hashing; recorded as debt |
| Data-source test | `501` until M7 | No adapter exists yet; pretending to test connectivity would be dishonest |
| Drift check | Route inventory only | Code generation and schema-level comparison remain deferred; path drift is caught now |

## Open decisions

| Decision | Status | Blocks | Notes |
| --- | --- | --- | --- |
| Deployment topology | Resolved — ADR-011 Option A (self-hosted Docker) | — | M6 unblocked; M8 uses the long-lived API process |
| Prisma major version | Resolved — pinned 7.10.1 | — | Stable release, not the earlier release candidate |
| Persian calendar library | Open | M10 | Display-only strategy decided; library selection deferred |
| API code generation | Deferred to M12 | — | `api-client` remains hand-written; `verify:openapi` covers path drift only |
| Connection pooling and rate limiting | Open | — | No pool sizing or request rate limits yet; recorded as debt |
| Raw SQL for non-admin users | Deferred | — | Not supported in v1 (ADR-010) |
| Public/anonymous sharing | Deferred | — | Organization-scoped sharing only in v1 |
| External time-series store | Deferred | — | Telemetry stays out of Postgres; product selection later |
| Plugin sandbox/marketplace | Deferred | — | Trusted install only (ADR-006) |
| Browser end-to-end test in CI | Deferred | — | M4–M6 were verified manually or at the HTTP level; no browser CI job yet |
| Viewer/editor pixel parity | Open | — | Editor uses RGL; the viewer canvas still uses CSS grid; re-targeted to M9 |

## What M7 must not assume

- That a data source can execute queries; metadata and encrypted credentials
  exist, but nothing decrypts them or contacts an external system.
- That the connectivity test works; `POST /v1/data-sources/:id/test` is a `501`
  stub.
- That the query engine is general; the demo adapter answers a fixed dataset
  and ignores `groupBy`/joins.
- That the web app can choose bindings; `apps/web` still hard-codes a demo query
  and data source per built-in widget type.
- That results are cached, cancelled or deduplicated; TanStack Query is not yet
  wired to any adapter.
- That query limits are enforced end to end; the 15 s / 10,000 rows / 5 MiB caps
  exist in the demo engine but no external adapter is bounded yet.
- That realtime exists; only HTTP polling is live and the gateway is M8.
- That sessions or credentials are rate limited; the API has no request rate
  limits or pool sizing.
- That idempotency works; `Idempotency-Key` is accepted but not enforced.
- That `dashboard-core` may import React at runtime, ECharts, a database driver
  or Next.js.

## Verification (M6)

All commands were run from the repository root on Node 24.22.1 with pnpm 10.33.2.

| Check | Command | Result |
| --- | --- | --- |
| Boundaries | `pnpm verify:workspace` | Passes: approved graph, no host imports, single React version |
| Lint | `pnpm lint` | Clean |
| Format | `pnpm format:check` | All files match (generated Prisma output ignored) |
| Typecheck | `pnpm typecheck` | 10 tasks successful |
| Test | `pnpm test` | 197 tests in 21 files: types 70, core 37, builder 44, api-client 14, api 32; the 6 Postgres tests skip without `NAMA_TEST_DATABASE_URL` |
| Postgres integration | `NAMA_TEST_DATABASE_URL=… npx vitest run src/__tests__/postgres.test.ts` | 6/6 passed against PostgreSQL 17 |
| Build | `pnpm build` | 6 tasks successful, 8 routes |
| Consumer | `pnpm verify:consumer` | Passes: `"use client"` preserved, 12.5 KiB and 6.9 KiB gzipped (16 KiB budgets), SSR render, single React copy |
| OpenAPI drift | `pnpm verify:openapi` | In sync: 36 served operations, 37 documented |

The Postgres suite covers the save → stale-`409` → publish → published-only
viewer lifecycle, viewer draft denial, cross-tenant list/read/save denial,
embed-token scope and cross-tenant revocation denial, credential encryption and
non-exposure, RLS zero-row behavior without context or under a foreign
organization, and audit rows for the exercised actions. It is skipped locally
unless `NAMA_TEST_DATABASE_URL` is provided and always runs in CI.

## Next action

M6 is complete and awaiting acceptance. The next milestone is M7 (data
infrastructure): query manager, TanStack Query, HTTP/static adapters, backend
query execution, validation, cache and cancellation, enforced limits, and a
data-source plugin example. Do not begin M7 until it is requested.
