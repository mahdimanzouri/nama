# ADR-003: Data Adapters and Query Execution Boundary

## Status

Accepted

## Date

2026-11-12

**Deciders:** Architecture (M0)

## Context

Widgets must not know whether data comes from PostgreSQL, REST, WebSocket,
MQTT or a mock. The SDK is distributed to other React applications and must be
able to talk to a non-Nama backend through a documented interface. Credentialed
sources must never be reachable directly from the browser. Query cost must be
bounded.

## Decision

1. The SDK consumes an injected `DataAdapter` with `execute()` and an optional
   `subscribe()`. The host application supplies the implementation. The SDK
   ships HTTP, mock/static and SSE-oriented adapters; it never opens a database
   connection.
2. Credentialed data sources execute **server-side only**. Client-side execution
   is limited to static/mock data and explicitly public REST endpoints.
3. Snapshot queries use TanStack Query for caching, deduplication, retry,
   cancellation and loading/error state. High-frequency events use a separate
   bounded ring buffer; they are not written into the query cache and do not
   invalidate all queries.
4. Platform defaults, which data sources may tighten but never loosen:
   15 s timeout, 10,000 rows or 5 MiB per result, and a bounded concurrent
   query count per user and per data source. Truncation is reported in result
   metadata instead of failing silently.
5. Cancellation aborts upstream work; it does not merely discard the response.
6. Variable and filter bindings resolve to explicit query parameters, the
   query time range or filter values **server-side** before execution. The
   browser never interpolates values into SQL.

## Consequences

- Swapping backends or transports requires no widget changes.
- The SDK stays free of database drivers and secrets.
- Every query round-trip goes through the API, which adds latency compared with
  direct access; caching and polling policy must compensate.
- Adapter implementations must be tested against the same contract suite.
- Result-size accounting happens on the server, where bytes and rows are known.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Direct browser database access | Leaks credentials; cannot enforce limits or tenant scope |
| Per-widget ad-hoc fetch logic | Duplicates caching, cancellation and error handling |
| GraphQL as the only contract | Adds a schema layer without solving execution isolation |
| Streaming every event through TanStack Query | Cache churn and unnecessary refetches |

## Related documents

- [../data-source-contracts.md](../data-source-contracts.md)
- [../realtime-protocol.md](../realtime-protocol.md)
- [../data-flow.md](../data-flow.md)
- [ADR-004](ADR-004-realtime.md)
- [ADR-010](ADR-010-sql-query-model.md)

## Review trigger

A new transport is added, limits change, or a consumer needs direct client-side
data access for a non-credentialed source.
