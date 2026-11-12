# ADR-011: Deployment Topology

## Status

Proposed — **unresolved**

## Date

2026-11-12

**Deciders:** Architecture (M0), product owner (pending)

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

This recommendation remains **Proposed** until the product owner chooses.

## Decision

No final decision. The architecture documents remain topology-neutral where
possible. `implementation/current-phase.md` records deployment as unresolved and
blocking M6 and M8.

## Consequences

- M6/M8 implementation must not assume a specific host or serverless runtime.
- Auth cookies must not be tied to a single domain until B is ruled out.
- Realtime fan-out stays in-process until the topology is known (ADR-004).
- Migration and backup procedures are documented as requirements, not as
  platform-specific steps.
- Choosing B or C requires amendments to ADR-004 (fan-out/transport) and ADR-007
  (cookie/session transport).

## Related documents

- [../backend-architecture.md](../backend-architecture.md)
- [../security.md](../security.md)
- [../../implementation/current-phase.md](../../implementation/current-phase.md)
- [ADR-004](ADR-004-realtime.md)
- [ADR-007](ADR-007-auth-transport.md)

## Review trigger

The product owner selects a deployment option, or M6/M8 cannot proceed without
one. This ADR must be accepted before those milestones.
