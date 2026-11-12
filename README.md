# Nama Dashboard Platform

An extensible dashboard platform for monitoring and analytical dashboards:
a reusable React SDK, a Next.js web application and an independent Fastify API.
Supports English and Persian, RTL and LTR chrome, and light, dark and system
themes. The dashboard canvas is LTR-only in v1.

## Repository status

**Milestone M2 (shared contracts and schemas) is complete (accepted 2026-11-12).**

The workspace contains:

```text
apps/web                 Next.js 16 application
apps/api                 Fastify 5 service (health endpoint only)
packages/dashboard-types public contracts: constants plus Zod schemas (M2)
packages/dashboard-core  dashboard runtime (public API in M3)
packages/dashboard-builder public React API (public API in M3)
packages/api-client      typed API client (generated in M6)
```

The three SDK packages build and link but intentionally export nothing yet. The
dashboard itself is specified, not implemented — see the
[roadmap](docs/implementation/roadmap.md).

## Architecture documentation

Start at [docs/README.md](docs/README.md):

- [Architecture overview](docs/architecture/overview.md)
- [Decision records](docs/architecture/decisions/)
- [Dashboard schema](docs/architecture/dashboard-schema.md)
- [SDK API proposal](docs/architecture/sdk-api.md)
- [Realtime protocol](docs/architecture/realtime-protocol.md)
- [Security assessment](docs/architecture/security.md)
- [API contract](docs/api/openapi.yaml)
- [Roadmap](docs/implementation/roadmap.md) and [current phase](docs/implementation/current-phase.md)

## Development

Requires Node 24 and pnpm 10.33.2 (both pinned by `engines` and `packageManager`).

```bash
pnpm install

pnpm dev               # web on :3000, API on :3001
pnpm build             # packages, web and API
pnpm typecheck
pnpm test
pnpm lint              # ESLint over the whole workspace
pnpm format            # Prettier
pnpm verify:workspace  # package boundaries and single React version
pnpm clean
```

The API reads `HOST`, `PORT`, `NODE_ENV` and `LOG_LEVEL`; see
`apps/api/.env.example`. `GET /healthz` returns the service status.

## Architectural rules (summary)

- The SDK must not depend on Next.js, the database, or a specific backend.
- Authentication, data and realtime are injected through documented interfaces.
- TanStack Query owns server state; Zustand owns local editor state.
- Backend authorization is authoritative; viewers only see published configs.
- Configuration writes are conditional on the last known revision.
- Support English and Persian; RTL chrome with a disclosed LTR-only canvas.
- Support light, dark and system themes.
- No circular dependencies; no abstraction without a concrete use case.

See the full rules in [AGENTS.md](AGENTS.md).
