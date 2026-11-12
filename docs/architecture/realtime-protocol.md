# Realtime Protocol (`/ws/v1`)

**Status:** Implemented (M8). Schemas, close codes and replay/reconnect constants
landed in M2 (`@nama/dashboard-types`); `/ws/v1`, `GET /v1/stream`, the hub with
replay buffers, and the SDK WebSocket/SSE adapters are implemented in M8.

The ten message types below are the protocol surface. The `authenticate` frame
used by embedded clients is a handshake that precedes the session, so it is
exported separately (`realtimeAuthenticateMessageSchema`) and is not counted as
an eleventh protocol message.

## Connection and authentication

- Endpoint: `wss://<api-host>/ws/v1`.
- The web app authenticates with its session cookie (same-site deployment).
- Embedded contexts authenticate with an embed token. Because browser WebSocket
  clients cannot set an `Authorization` header, the token is sent in an
  `authenticate` message as the first frame, or via
  `Sec-WebSocket-Protocol: nama.embed.<token>`. Tokens are never placed in the
  URL, query string, logs or referrers.
- The server closes the connection if no successful authentication arrives within
  5 seconds.
- Each subscription is authorized independently after connection-level auth.

On success the server sends:

```json
{
  "type": "connected",
  "protocolVersion": 1,
  "sessionId": "…",
  "resumeWindowSeconds": 60,
  "heartbeatIntervalMs": 30000
}
```

## Message types

| Type | Direction | Purpose |
| --- | --- | --- |
| `connected` | server → client | Session identity, protocol version, resume window |
| `subscribe` | client → server | Create a subscription |
| `subscribed` | server → client | Accepted parameters and first sequence |
| `snapshot` | server → client | Authoritative current value, always sequenced |
| `data` | server → client | Incremental update with increasing sequence |
| `gap` | server → client | Resume point no longer buffered; reset and await snapshot |
| `unsubscribe` | client → server | Remove a subscription |
| `unsubscribed` | server → client | Confirmation |
| `error` | server → client | Typed error with optional retry hint |
| `heartbeat` | both | Liveness |

## Subscribe

```json
{
  "type": "subscribe",
  "requestId": "req-1",
  "subscriptionId": "sub-123",
  "dataSourceId": "factory-01",
  "queryId": "production-live",
  "query": {
    "queryId": "production-live",
    "dataset": "production",
    "fields": ["timestamp", "value"]
  },
  "mode": "snapshot-then-stream",
  "resumeFrom": 1024,
  "parameters": { "machineId": "machine-01" }
}
```

- `mode`: `snapshot-then-stream` (default) or `stream`.
- `query` carries the structured query definition and must repeat `queryId`.
  The server validates it, resolves variables and filters against the caller's
  scope, and executes it with the same `QueryService` limits as REST.
- `resumeFrom` is the last sequence the client applied. Omit on first subscribe.
- `subscriptionId` is chosen by the client and must be unique per connection.
- Parameters are validated server-side; variables and filters are resolved
  server-side, not interpolated by the client.

Response:

```json
{
  "type": "subscribed",
  "subscriptionId": "sub-123",
  "firstSequence": 1025,
  "mode": "snapshot-then-stream"
}
```

## Snapshot and data

```json
{
  "type": "snapshot",
  "subscriptionId": "sub-123",
  "sequence": 1025,
  "timestamp": "2026-11-12T06:00:00Z",
  "data": {
    "columns": [{ "name": "production", "type": "number" }],
    "rows": [{ "production": 120 }]
  }
}
```

```json
{
  "type": "data",
  "subscriptionId": "sub-123",
  "sequence": 1026,
  "timestamp": "2026-11-12T06:00:01Z",
  "data": { "production": 121 }
}
```

Rules:

- Every `snapshot` and `data` event carries a per-subscription, strictly
  increasing `sequence` (64-bit integer).
- A `snapshot` **replaces** client state for that subscription; it is never
  merged.
- Duplicate sequences are ignored.
- A sequence beyond the last applied plus one, or a `gap`, forces gap recovery.
- The client applies events in order per subscription; no global ordering across
  subscriptions is implied.

## Gap and resume

```json
{ "type": "gap", "subscriptionId": "sub-123", "requiresSnapshot": true }
```

- The replay buffer per subscription is **60 s or 1,000 events, whichever is
  smaller**.
- On reconnect, the client sends `resumeFrom` with the last applied sequence.
  The server sends the missing range followed by live events, or `gap` followed
  by a fresh `snapshot` and live events.
- The server never starts live delivery without a known baseline.
- If the client's `resumeFrom` is older than the buffer, the server sends `gap`
  immediately after `subscribed`.

## Stream mode and throttling

- `mode: "stream"` is for high-frequency telemetry.
- The server throttles stream events to a configurable window, default **250 ms**.
  It does not forward every raw event.
- Stream payloads are compact and versioned; they are not written into the
  TanStack Query snapshot cache.
- The client keeps a bounded ring buffer per subscription (proposed: 500 samples)
  and reconciles with the most recent snapshot.
- Widgets coalesce rendering to at most **4 UI updates per second per widget**.
- Widgets that do not declare `capabilities.realtime` are never subscribed.

## Heartbeats and timeouts

- Server sends `heartbeat` every 30 seconds by default.
- The client sends `heartbeat` or a ping-equivalent on the same interval.
- Two missed heartbeats close the connection and trigger reconnect.
- Close codes:

| Code | Meaning | Client action |
| --- | --- | --- |
| `1000` | Normal closure | Stop |
| `4401` | Authentication expired | Refresh credentials, reconnect, resubscribe from last sequence |
| `4403` | Subscription or token revoked | Do not retry until credentials change |
| `4408` | Heartbeat timeout | Reconnect with backoff |
| `4429` | Rate limited | Reconnect after `retryAfterMs` |

## Reconnect policy

- Exponential backoff with jitter: base 500 ms, factor 2, cap 30 s, jitter ±20%.
- Resubscribe all active subscriptions with `resumeFrom` = last applied
  sequence.
- Token expiry closes the connection; the client obtains fresh credentials and
  resubscribes.
- Subscription state is replaced by the next snapshot after any gap.

## Backpressure and rate limits

- Limits apply per connection and per subscription.
- Exceeding a limit returns `error` with `retryAfterMs`; the server does not
  silently drop data.
- Slow clients are throttled; if buffers exceed the bounded size, the oldest
  stream samples are discarded and the widget is marked stale.
- Heartbeats and control messages are never dropped.

## SSE fallback

- `GET /v1/stream?...` serves one-way events with the same payload shapes and
  event names (`subscribed`, `snapshot`, `data`, `gap`, `error`).
- Reconnect uses `Last-Event-ID` mapped to the last sequence.
- Authentication is the session cookie or `Authorization: Bearer <embed-token>`.
- SSE cannot express client-originated subscribe/unsubscribe; each stream is
  scoped to one subscription. Use WebSocket when bidirectional control is needed.
- The web app defaults to SSE through its same-origin `/api` proxy because the
  Next.js rewrite streams responses but cannot proxy WebSocket upgrades. Set
  `NEXT_PUBLIC_NAMA_WS_URL` (for example `ws://localhost:3001`) to use `/ws/v1`
  directly.

## Protocol validation

- All messages are validated with Zod schemas from `@nama/dashboard-types`.
- Unknown message types are rejected with `error` code `PROTOCOL_UNSUPPORTED`.
- The protocol version is in the URL; a breaking change creates `/ws/v2`.

## Client connection manager

The SDK owns one connection manager per adapter instance:

- Single socket shared by all widgets (`createWebSocketRealtimeAdapter`); the SSE
  adapter opens one `EventSource` per subscription because SSE cannot multiplex.
- Subscription registry with reference counting; the socket closes when the last
  subscription unsubscribes.
- Automatic cleanup when the last widget using a subscription unmounts.
- Authentication injection from the host adapter; embed tokens travel as the
  `nama.embed.<token>` subprotocol, never in the URL.
- Reconnect with backoff and jitter, heartbeat sending and watchdog, `resumeFrom`
  on resubscribe, and `subscribed.firstSequence` as the sequence baseline.
- Event validation with `realtimeServerMessageSchema` and snapshot validation
  with `queryResultSchema`; duplicate sequences ignored, gaps reported to the
  widget so it can refetch.
- No WebSocket per widget.

## Implementation notes (M8)

| Concern | Implementation |
| --- | --- |
| Gateway | `apps/api/src/modules/realtime/gateway.ts`: raw `upgrade` handler for `/ws/v1` with pre-upgrade cookie/token auth (HTTP 401 before the socket exists) and `GET /v1/stream` for SSE |
| Connection | `connection.ts`: 5 s auth timeout, JSON + Zod validation, per-connection limits (50 subscriptions, 120 messages per 10 s), heartbeat revalidation, close codes |
| Authorization | `authorizer.ts`: session or embed principal, `datasource.execute` on every subscription, embed sources must appear in a published dashboard inside the token scope, token variables override parameters |
| Fan-out | `hub.ts`: channels keyed by organization + query request share one poller; resume threads keyed by principal + client subscription id survive disconnect for the 60 s replay window; a new subscription on the same key takes over the old one |
| Sequencing | Allocated when an event is sent, so throttling or coalescing never creates false gaps; `snapshot-then-stream` emits a fresh snapshot per poll, `stream` emits throttled `data` |
| Buffers | `buffer.ts`: per-subscription ring of 60 s or 1,000 events, whichever is smaller |
| Polling | Connectors are pull-based today; the hub re-executes with `REALTIME_POLL_INTERVAL_MS` (default 5,000 ms) rather than receiving pushes |
| Client | `packages/dashboard-core/src/realtime.ts`: `createWebSocketRealtimeAdapter` and `createSseRealtimeAdapter`, both bounded by `REALTIME_DEFAULTS` |
| Widgets | `useWidgetQuery` subscribes only when `capabilities.realtime` is set and an adapter is injected; it writes snapshots into the TanStack cache and buffers stream events (500 samples, flushed at most every 250 ms) |
| Web wiring | `apps/web/lib/realtime-adapter.ts` selects SSE over `/api` by default or the direct WebSocket gateway via `NEXT_PUBLIC_NAMA_WS_URL` |

## Related documents

- [decisions/ADR-004-realtime.md](decisions/ADR-004-realtime.md)
- [data-source-contracts.md](data-source-contracts.md)
- [decisions/ADR-009-embed-tokens.md](decisions/ADR-009-embed-tokens.md)
- [../plugins/data-source-plugin-contract.md](../plugins/data-source-plugin-contract.md)
