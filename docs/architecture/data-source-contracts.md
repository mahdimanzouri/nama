# Data Source and Query Contracts

**Status:** Proposed (M0). Client-side types and Zod schemas are implemented in
M2 (`@nama/dashboard-types`); no execution service exists yet.

The client-side schemas cover `QueryDefinition`, `QueryRequest`, `QueryResult`,
`QueryError`, `DataAdapter`, `QueryContext` and subscription handlers. Server-side
connectors, transports and caching are still proposals.

This document defines the **client-side** data adapter contract. Server-side
connectors are specified in
[../plugins/data-source-plugin-contract.md](../plugins/data-source-plugin-contract.md).

## Separation of concerns

```text
Widget
  → Query Manager (SDK)
  → TanStack Query cache (snapshots)
  → DataAdapter
  → API /v1/queries/execute
  → Query execution service
  → Data-source plugin
  → External system
```

Streaming bypasses TanStack Query:

```text
External source → API realtime gateway → /ws/v1 → RealtimeAdapter
                → bounded ring buffer → widget
```

## Adapter contract

```ts
interface DataAdapter {
  execute(request: QueryRequest, context: QueryContext): Promise<QueryResult>;

  subscribe?(
    request: QueryRequest,
    context: QueryContext,
    handlers: SubscriptionHandlers,
  ): Promise<Unsubscribe>;
}

interface QueryContext {
  signal: AbortSignal;
  requestId: string;
  dashboardId: string;
  locale: string;
  timezone: string;
}

interface SubscriptionHandlers {
  onSnapshot(result: QueryResult): void;
  onData(event: DataEvent): void;
  onGap(): void;
  onError(error: QueryError): void;
  onStatus(status: "connecting" | "open" | "closed" | "reconnecting"): void;
}

type Unsubscribe = () => void | Promise<void>;
```

The host injects the adapter. The SDK ships adapters for HTTP polling,
static/mock data and SSE; it never opens a database connection.

## Query request

```ts
interface QueryRequest {
  queryId: string;
  dataSourceId: string;
  /** Structured definition; raw SQL only for admin principals. */
  query: QueryDefinition;
  parameters?: Record<string, unknown>;
  timeRange?: { from: string; to: string };
}

interface QueryDefinition {
  queryId: string;
  dataset?: string;
  fields: string[];
  aggregations?: Array<{ field: string; fn: "sum" | "avg" | "min" | "max" | "count" }>;
  filters?: Array<{ field: string; operator: FilterOperator; value: unknown }>;
  groupBy?: string[];
  orderBy?: Array<{ field: string; direction: "asc" | "desc" }>;
  limit?: number;
  /** Variables and filters are resolved to these inputs server-side. */
  variableBindings?: VariableBinding[];
}
```

## Query result

```ts
interface QueryResult {
  queryId: string;
  columns: Array<{ name: string; type: string; label?: string }>;
  rows: Array<Record<string, unknown>>;
  timestamp: string;          // UTC ISO-8601
  meta: {
    rowCount: number;
    truncated: boolean;       // true when a cap was hit
    executionTimeMs: number;
    cached: boolean;
  };
}
```

`truncated` is surfaced to widgets; it is never silently ignored.

## Query error

```ts
interface QueryError {
  code:
    | "DATASOURCE_UNREACHABLE"
    | "DATASOURCE_AUTH_FAILED"
    | "QUERY_INVALID"
    | "QUERY_TIMEOUT"
    | "RESULT_TOO_LARGE"
    | "RATE_LIMITED"
    | "RAW_SQL_FORBIDDEN"
    | "CANCELLED"
    | "INTERNAL";
  message: string;            // localized display message key at the SDK layer
  fieldPaths?: Array<string | number>;
  requestId?: string;
  retryAfterMs?: number;
}
```

## Query lifecycle

A query definition (persisted on the widget) supports:

- Query ID and data-source ID.
- Structured body (dataset, fields, aggregations, filters, grouping, sort).
- Resolved parameters and variable bindings.
- Time range.
- Refresh policy (interval from dashboard settings; a widget may override).
- Cache policy.
- Timeout (15 s default).
- Cancellation (`AbortSignal`).
- Pagination/limit where the source supports it.
- Result limits and truncation.
- Error state and execution metadata.

## Limits and concurrency

| Limit | Default | Notes |
| --- | --- | --- |
| Execution timeout | 15 s | Per data source may only tighten |
| Result rows | 10,000 | Truncation flagged |
| Result bytes | 5 MiB | Inclusive of rows payload |
| Concurrent queries | Bounded per user and per data source | Configuration with documented defaults |
| Result cache | TanStack Query | Deduplicated by resolved request |

Cancellation aborts upstream work; it does not merely discard the response.

## Variable and filter resolution

- Variables map to query parameters, the query time range or filter values via
  `VariableBinding`.
- Resolution happens on the server against the persisted dashboard config and the
  request's current values.
- The server validates the resolved request and never trusts client-side
  interpolation.
- Persian digits are normalized to canonical numbers before validation.

## TanStack Query responsibilities

- Snapshot queries, caching, deduplication, retry policy, cancellation,
  refetching, stale/fresh state, loading and error states.
- Cache key: `[dataSourceId, queryId, resolvedParameters, timeRange]`.
- A dashboard refresh invalidates snapshot queries, not stream buffers.
- Do not write every telemetry event into the query cache.

## Transports

| Transport | Use |
| --- | --- |
| HTTP polling | Default for snapshots in v1 |
| WebSocket | Live updates and multiplexed subscriptions |
| SSE | One-way fallback |
| Static/mock | Tests, demos, offline previews |

Backend execution is mandatory for credentialed sources; static/mock and
explicitly public REST may execute client-side.

## Schema discovery and validation

Proposed endpoints (M7):

- `GET /v1/data-sources/:id/schema` — datasets, fields and types.
- `POST /v1/queries/validate` — validates a structured query without executing.

Both require `datasource.read`; discovery results are cached and scoped per
organization.

## Credentials

The browser receives opaque data-source identifiers and authorized query
capabilities. It never receives database passwords, connection strings or
privileged credentials. Credentials are decrypted only inside the API, just in
time for execution.

## Related documents

- [../plugins/data-source-plugin-contract.md](../plugins/data-source-plugin-contract.md)
- [realtime-protocol.md](realtime-protocol.md)
- [data-flow.md](data-flow.md)
- [decisions/ADR-003-data-adapters.md](decisions/ADR-003-data-adapters.md)
