# ADR-011: Deployment Topology

## Status

**Accepted** (2026-11-12)

## Date

2026-11-12

**Deciders:** Architecture (M0), product owner

## Context

Deployment was deliberately left open. The choice affects authentication
mechanics, realtime hosting, background query execution, egress control for
SSRF defense, credential-key management and database migration operations. M6
(backend and persistence) and M8 (realtime infrastructure) cannot be finalized
until this is decided.

## Alternatives considered

The three deployment options below are the alternatives under consideration.

| Option | Shape | Strengths | Weaknesses |
| --- | --- | --- | --- |
| **A. Self-hosted Docker** (recommended) | `web`, `api`, `postgres` containers; long-lived Node API; reverse proxy; managed Postgres optional | WebSocket fan-out, background workers, egress filtering, KEK management and 15 s queries fit a persistent host | Operator burden: upgrades, backups, monitoring, TLS |
| **B. Hybrid** | Web on Vercel; API + Postgres on a container platform | Good web DX and CDN; API keeps long-lived connections | Two deployment targets; auth cookies across domains; egress controls depend on platform |
| **C. Fully managed/serverless** | Web and API as serverless functions; managed Postgres | Low ops | WebSocket support is constrained; long queries and workers need separate services; cold starts; egress restrictions |

## Recommendation

Adopt **Option A** for v1: a Docker Compose (or equivalent orchestrator)
deployment with the Next.js web app, the Fastify API, PostgreSQL, and an object
store for exports if needed. Rationale:

- Realtime (ADR-004) expects long-lived WebSocket connections and in-process
  subscription state.
- Data-source security needs controlled egress and private-network blocking.
- Query execution needs a 15 s budget and bounded concurrency, which is easier on
  a persistent process.
- Credential encryption keys must be managed outside the repository; a
  persistent host simplifies a managed key store or sealed secret injection.

## Decision

Adopt **Option A** for v1: a self-hosted Docker deployment with the Next.js web
app, the Fastify API and PostgreSQL on a persistent host. Realtime fan-out stays
in-process in the API process (ADR-004) behind an interface, so a later move to a
shared broker does not change module contracts.

The local development and test topology mirrors production: PostgreSQL 17 with a
table-owner role for migrations and a non-superuser `nama_app` role for runtime
queries, so row-level security is exercised rather than bypassed.

## Consequences

- Sessions use first-party cookies on a single host; no cross-domain cookie
  shim is required (ADR-007).
- WebSocket hosting and in-process subscription state are supported by the
  long-lived API process (ADR-004, M8).
- Query execution keeps its 15 s budget and bounded concurrency inside the API
  process; background workers can be extracted later without contract changes.
- Credential encryption keys are injected as environment secrets
  (`CREDENTIAL_ENCRYPTION_KEY`) and rotated by key version.
- Operators own upgrades, backups, TLS and monitoring; the deployment runbook
  is delivered in M12.
- Migrations run as the owner role in the release step; the runtime role never
  has `BYPASSRLS` and never owns tables.
- Choosing B or C later still requires amendments to ADR-004 (fan-out/transport)
  and ADR-007 (cookie/session transport).

## Related documents

- [../backend-architecture.md](../backend-architecture.md)
- [../security.md](../security.md)
- [../../implementation/current-phase.md](../../implementation/current-phase.md)
- [ADR-004](ADR-004-realtime.md)
- [ADR-007](ADR-007-auth-transport.md)

## Review trigger

Revisit if realtime fan-out outgrows a single API process, if the operator
burden of self-hosting exceeds the team's capacity, or if a managed platform
adds durable WebSocket support that removes Option B's main gap.
