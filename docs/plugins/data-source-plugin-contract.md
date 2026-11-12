# Data-Source Plugin Contract (Normative)

**Status:** Proposed (M0). Normative for server-side data-source connectors.

Data-source plugins run inside the API. They are the only code that knows how to
talk to an external system. The browser never loads them.

## Interface

```ts
interface DataSourcePlugin {
  /** Stable kind, e.g. "rest", "postgres", "mqtt". */
  kind: string;
  manifest: { version: string; name: string };

  /** Non-secret connection configuration. */
  configSchema: ZodType<DataSourceConfig>;

  /** Secret credential shape; stored encrypted, never returned. */
  credentialSchema?: ZodType<DataSourceCredential>;

  capabilities: {
    test: boolean;
    execute: boolean;
    stream?: boolean;
    rawSql?: boolean;
    schemaDiscovery?: boolean;
  };

  test(ctx: PluginContext): Promise<TestResult>;

  validate(query: QueryDefinition | RawSqlQuery, ctx: PluginContext): Promise<ValidationResult>;

  execute(request: PluginQueryRequest, ctx: PluginContext): Promise<QueryResult>;

  /** Cancels upstream work; called when the request is aborted. */
  cancel?(executionId: string): Promise<void>;

  subscribe?(
    request: PluginQueryRequest,
    ctx: PluginContext,
    handlers: PluginStreamHandlers,
  ): Promise<Unsubscribe>;

  dispose?(): Promise<void>;
}
```

## Plugin context

```ts
interface PluginContext {
  organizationId: string;
  dataSourceId: string;
  /** Decrypted just-in-time; never serialized or logged. */
  credentials: () => Promise<DataSourceCredential>;
  limits: {
    timeoutMs: number;        // default 15000
    maxRows: number;          // default 10000
    maxBytes: number;         // default 5 MiB
    maxConcurrent: number;
  };
  egress: EgressPolicy;
  logger: Logger;
  signal: AbortSignal;
  requestId: string;
}
```

The runtime enforces the limits; the plugin must honor `signal` and stop work.
A plugin may tighten limits for a specific source, never loosen them.

## Query and result shapes

```ts
interface PluginQueryRequest {
  queryId: string;
  query: QueryDefinition | RawSqlQuery;
  parameters: Record<string, unknown>;
  timeRange?: { from: string; to: string };
}

interface QueryResult {
  columns: Array<{ name: string; type: string; label?: string }>;
  rows: Array<Record<string, unknown>>;
  timestamp: string;            // UTC ISO-8601
  meta: {
    rowCount: number;
    truncated: boolean;
    executionTimeMs: number;
    cached: boolean;
  };
}
```

## Error taxonomy

Plugins throw a typed `DataSourceError` with a stable code:

| Code | Meaning |
| --- | --- |
| `DATASOURCE_UNREACHABLE` | Network/DNS/connection failure |
| `DATASOURCE_AUTH_FAILED` | Credentials rejected |
| `QUERY_INVALID` | Query is not valid for this source |
| `QUERY_TIMEOUT` | Execution exceeded the limit |
| `RESULT_TOO_LARGE` | Result exceeded row/byte cap |
| `RATE_LIMITED` | Source or platform rate limit |
| `RAW_SQL_FORBIDDEN` | Raw SQL not allowed for this source/principal |
| `INTERNAL` | Unexpected failure; details logged, not returned |

The API maps these to HTTP error codes and never leaks credentials, connection
strings or stack traces to the browser.

## Credential handling

- Credentials are decrypted just-in-time for a single execution and are never
  placed on request/response objects.
- They are excluded from logs, error payloads, audit metadata and traces.
- Credential rotation uses `key_version`; a rotation procedure is documented
  before production.
- Plugins never read credential rows directly; they use `ctx.credentials()`.

## Egress and SSRF policy

For network plugins (REST, MQTT, SQL):

1. Resolve hostnames server-side and reject private, loopback, link-local,
   multicast and metadata-service ranges unless the deployment explicitly
   allowlists them.
2. Re-check the resolved IP after DNS resolution and on redirects to prevent DNS
   rebinding.
3. Follow redirects only within the allowed scheme/host policy; never redirect to
   a private range.
4. Enforce TLS verification; do not offer a "skip certificate" option in v1.
5. Allow only HTTP/HTTPS for REST by default; no `file:`, `gopher:` or arbitrary
   protocols.
6. Apply the same policy to MQTT brokers and database hosts.

See [security.md](../architecture/security.md).

## SQL plugins

- Structured queries are compiled by the server to parameterized SQL; the plugin
  never concatenates untrusted values.
- Raw SQL is accepted only when the source has `allow_raw_sql = true` and the
  principal holds `datasource.admin`. Single statement, no DDL/DML, read-only
  credential, statement timeout, row cap, audited query hash.
- Dataset allowlists are server-owned; the browser cannot name arbitrary tables
  (ADR-010).

## Streaming plugins

- `subscribe` runs server-side; the browser connects only to `/ws/v1`.
- Events carry a per-subscription sequence assigned by the gateway, not by the
  plugin; the plugin may assign source offsets used for resume.
- The gateway throttles to the configured window (default 250 ms) and bounds the
  replay buffer to 60 s or 1,000 events, whichever is smaller.
- The plugin must stop upstream subscriptions on unsubscribe and on abort.

## Testing checklist

- `test()` success and failure mappings.
- `validate()` accepts supported queries and rejects invalid ones with paths.
- `execute()` honors timeout, cancellation and row/byte caps.
- Truncation is reported, not silently dropped.
- Errors map to the taxonomy without leaking secrets.
- SSRF policy rejects private ranges and rebound DNS.
- Credential rotation and decryption failure paths.
- Stream subscribe/unsubscribe and backpressure.

## Related documents

- [../architecture/data-source-contracts.md](../architecture/data-source-contracts.md)
- [../architecture/realtime-protocol.md](../architecture/realtime-protocol.md)
- [../architecture/security.md](../architecture/security.md)
- [../architecture/decisions/ADR-010-sql-query-model.md](../architecture/decisions/ADR-010-sql-query-model.md)
