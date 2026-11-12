# Data Source and Query Contracts

**Status:** Implemented in M7 (2026-11-12). Client contracts and schemas landed in
M2; the API execution service, connector registry, static and REST connectors,
and the SDK HTTP/static adapters are live.

The client-side schemas cover `QueryDefinition`, `QueryRequest`, `QueryResult`,
`QueryError`, `DataAdapter`, `QueryContext` and subscription handlers. Server-side
connectors implement the plugin contract in
[../plugins/data-source-plugin-contract.md](../plugins/data-source-plugin-contract.md);
streaming transports remain M8.

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
| Execution timeout | 15 s | Per data source may only tighten; enforced with `AbortSignal` → `504` |
| Result rows | 10,000 | Truncation flagged |
| Result bytes | 5 MiB | Row payload; over-budget results are cut to the largest fitting prefix |
| Concurrent queries | 4 per data source | In-process gate keyed by organization and source → `429` with `retryAfterMs` |
| Result cache | TanStack Query | Deduplicated by the persisted query and resolved parameters |

Cancellation aborts upstream work; an external `AbortSignal` aborts the plugin
and returns `408 CANCELLED`.

## Variable and filter resolution

- Variables map to query parameters, the query time range or filter values via
  `VariableBinding`.
- Resolution happens in the SDK: `buildControlledQueryRequest` merges the
  current control values, dashboard filters and the selected range into the
  `QueryRequest` before the adapter executes it. Control state is never
  persisted, so the server cannot re-resolve it against stored values.
- Range precedence is dashboard control → `query.timeRange` binding → the
  widget's persisted range. Dashboard filters only join queries whose `fields`
  include the filtered field.
- The server validates the resolved request — schema, connector `validate`,
  limits and authorization — and never trusts client-side SQL or interpolation.
  A client can choose different parameters within the request contract, exactly
  as it could by editing a draft; authorization and the connector remain
  authoritative.
- Persian and Arabic-Indic digit normalization exists as
  `normalizeDigits` but is not yet applied to control values or query
  parameters; tracked as TD-062.
- Data-source credentials never enter the SDK or a query request; they stay in
  the API and are decrypted only by the connector.

## TanStack Query responsibilities

- Snapshot queries, caching, deduplication, retry policy, cancellation,
  refetching, stale/fresh state, loading and error states.
- Cache key: `[dataSourceId, queryId, resolvedParameters, timeRange]`.
- A dashboard refresh invalidates snapshot queries, not stream buffers.
- Do not write every telemetry event into the query cache.

## Transports

| Transport | Status | Use |
| --- | --- | --- |
| HTTP polling | Implemented (`createHttpDataAdapter`) | Default for snapshots |
| Static/mock | Implemented (`createStaticDataAdapter`) | Tests, demos, offline previews |
| WebSocket | M8 | Live updates and multiplexed subscriptions |
| SSE | M8 | One-way fallback |

Backend execution is mandatory for credentialed sources; static/mock and
explicitly public REST may execute client-side.

## Schema discovery and validation

Implemented endpoints:

- `GET /v1/data-sources/:id/schema` — datasets, fields and types
  (`datasource.read`); connectors without discovery return `501`.
- `POST /v1/queries/validate` — validates a structured query without executing
  it and returns `200 { valid, issues }` (`datasource.execute`).

Discovery results are scoped per organization. Connector-side validation runs
after the request schema check, so both envelope and plugin problems are
reported.

## Credentials

The browser receives opaque data-source identifiers and authorized query
capabilities. It never receives database passwords, connection strings or
privileged credentials. Credentials are decrypted only inside the API, just in
time for execution.

## Implemented connectors (M7)

| Kind | Capabilities | Notes |
| --- | --- | --- |
| `static` | test, execute, schema discovery | Internal demo metrics (`demo-source`); deterministic rows generated from the time range; rejects `groupBy` |
| `rest` | test, execute | JSON array or `{ rows }` via `rowsPath`; optional column declarations; credential headers; no schema discovery |

The REST connector resolves the URL before every request and rejects non-HTTP
protocols and private, loopback, link-local, multicast and metadata addresses.
Redirects are refused so a public host cannot bounce into a private range. DNS
pinning between resolution and connect is not yet implemented (TD-052).
`postgres`, `mysql` and `mqtt` remain declared kinds that return `501`
(TD-053).

## Related documents

- [../plugins/data-source-plugin-contract.md](../plugins/data-source-plugin-contract.md)
- [realtime-protocol.md](realtime-protocol.md)
- [data-flow.md](data-flow.md)
- [decisions/ADR-003-data-adapters.md](decisions/ADR-003-data-adapters.md)
