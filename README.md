# Nama Dashboard Platform

An extensible dashboard platform for monitoring and analytical dashboards:
a reusable React SDK, a Next.js web application and an independent Fastify API.
Supports English and Persian, RTL and LTR chrome, and light, dark and system
themes. The dashboard canvas is LTR-only in v1.

## Repository status

**Milestone M0 (architecture and decisions) is complete pending approval.**
No product code or monorepo restructuring has been implemented yet.

The repository currently contains the original Next.js application at the root
(Next.js 16.4.6, React 19.3.0, Tailwind CSS 4.3.3). The target monorepo —
`apps/web`, `apps/api` and the four initial `@nama/*` packages — is created in
M1.

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

## Run the current application

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

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
