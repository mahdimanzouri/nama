# Data-Source Plugin Contract (Normative)

**Status:** Runtime implemented in M7 (`apps/api/src/modules/queries/plugins`).
M11 moved the normative interface into `@nama/dashboard-types` so a plugin
package can implement it without importing the API, and added manifest,
capability and duplicate-kind validation through
`createDataSourcePluginRegistry`. `examples/plugin-kit` is a registered example.
Streaming (`subscribe`), cancellation callbacks and raw SQL remain normative
targets for later milestones; the implemented surface is marked below.

Data-source plugins run inside the API. They are the only code that knows how to
talk to an external system. The browser never loads them.

## Interface

Import the contract from `@nama/dashboard-types`; the API re-exports the same
names for its internal modules.

```ts
interface ServerDataSourcePlugin {
  /** Stable kind, e.g. "rest", "static". */
  kind: string;
  manifest: { version: string; name: string };

  capabilities: {
    test: boolean;
    execute: boolean;
    stream?: boolean;          // planned (M8+)
    rawSql?: boolean;          // planned (ADR-010 connector)
    schemaDiscovery?: boolean;
  };

  /** Non-secret connection configuration. */
  configSchema: ZodType;

  /** Secret credential shape; stored encrypted, never returned. */
  credentialSchema?: ZodType;

  test(ctx: PluginContext): Promise<TestResult>;

  validate(query: QueryDefinition, ctx: PluginContext): Promise<ValidationResult>;

  execute(request: PluginQueryRequest, ctx: PluginContext): Promise<QueryResult>;

  /** Optional: datasets and fields for the source picker. */
  discover?(ctx: PluginContext): Promise<DatasetSchema[]>;
}
```

Cancellation is delivered through `ctx.signal`; there is no separate `cancel`
callback yet. Streaming plugins and `dispose` arrive with a later connector
milestone.

## Registration and validation

```ts
import { createDataSourcePluginRegistry } from "@nama/dashboard-types";

const registry = createDataSourcePluginRegistry([restPlugin, staticPlugin]);
registry.register(memoryPlugin); // duplicate kinds are rejected
```

At registration the runtime validates:

- the manifest derived from `kind`, `manifest.version`, `manifest.name` and
  `capabilities` against `dataSourcePluginManifestSchema` (lowercase kind, semver,
  required `test` and `execute` capabilities);
- that `configSchema`, and `credentialSchema` when present, are Zod schemas;
- that `test`, `validate` and `execute` are implemented;
- that `discover()` exists exactly when `capabilities.schemaDiscovery` is true;
- that the `kind` is not already registered, unless the host passes
  `{ replace: true }`.

`validateDataSourcePlugin` exposes the same checks for hosts that build their own
registry. `registry.list()` returns manifests, not plugin internals.
`apps/api` constructs the registry at boot from the built-in `static` and `rest`
connectors; adding a connector package is a host wiring decision, not remote
loading (TD-071).

## Plugin context

```ts
interface PluginContext {
  organizationId: string;
  dataSourceId: string;
  requestId: string;
  /** Validated non-secret configuration. */
  config: Record<string, unknown>;
  /** Decrypted just-in-time and memoized; never serialized or logged. */
  credentials: () => Promise<Record<string, unknown>>;
  limits: {
    timeoutMs: number;        // default 15000, clamped
    maxRows: number;          // default 10000, clamped
    maxBytes: number;         // default 5 MiB, clamped
    maxConcurrent: number;    // default 4, clamped
  };
  allowPrivateNetwork: boolean; // test-only escape hatch
  fetch: typeof globalThis.fetch;
  signal: AbortSignal;
  logger: { warn(meta: Record<string, unknown>, message: string): void };
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
   allowlists them (`ALLOW_PRIVATE_DATA_SOURCES`, test-only).
2. Reject non-HTTP protocols for REST (`file:`, `gopher:` and other schemes).
3. Refuse redirects entirely in v1; a public host cannot bounce the request into
   a private range.
4. Enforce TLS verification; there is no "skip certificate" option.
5. Re-check the resolved address on connect. **Not yet implemented:** the
   current guard resolves once and does not pin the address (TD-052).
6. Apply the same policy to MQTT brokers and database hosts when those
   connectors arrive.

See [security.md](../architecture/security.md).

## SQL plugins

- Structured queries are compiled by the server to parameterized SQL; the plugin
  never concatenates untrusted values.
- Raw SQL is accepted only when the source has `allow_raw_sql = true` and the
  principal holds `datasource.admin`. Single statement, no DDL/DML, read-only
  credential, statement timeout, row cap, audited query hash.
- Dataset allowlists are server-owned; the browser cannot name arbitrary tables
  (ADR-010).

## Streaming plugins (not implemented)

- `subscribe` runs server-side; the browser connects only to `/ws/v1`.
- Events carry a per-subscription sequence assigned by the gateway, not by the
  plugin; the plugin may assign source offsets used for resume.
- The gateway throttles to the configured window (default 250 ms) and bounds the
  replay buffer to 60 s or 1,000 events, whichever is smaller.
- The plugin must stop upstream subscriptions on unsubscribe and on abort.

The M8 gateway exists, but no connector exposes `subscribe`; the built-in
connectors declare `stream: false` and implement `execute` only.

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
