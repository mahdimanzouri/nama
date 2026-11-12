# ADR-004: Realtime Protocol and Connection Management

## Status

Accepted

## Date

2026-11-12

**Deciders:** Architecture (M0)

## Context

Monitoring dashboards need live values for many widgets. Opening one WebSocket
per widget multiplies connections, authentication work and fan-out cost. A
reconnect must not leave widgets showing stale values without their knowledge.
High-frequency telemetry must not overwhelm the UI or the query cache.

## Decision

1. Implement a **single shared connection manager** per application instance
   with a subscription registry, reference counting, cleanup, authentication,
   heartbeats and reconnect with exponential backoff and jitter.
2. Endpoint is `/ws/v1`. Every subscription is authorized independently, not
   only the connection.
3. Message types: `connected`, `subscribe`, `subscribed`, `snapshot`, `data`,
   `gap`, `unsubscribe`, `unsubscribed`, `error`, `heartbeat`.
4. Every `data` event carries a per-subscription, strictly increasing
   `sequence`. On reconnect the client resubscribes with `resumeFrom` set to the
   last applied sequence.
5. The server answers with either the missing range followed by live events, or
   `gap` followed by a fresh `snapshot` and live events. It never starts live
   delivery without a known baseline.
6. A snapshot **replaces** client state; it is never merged. Duplicate
   sequences are ignored; out-of-order sequences force gap recovery.
7. Replay buffer per subscription: 60 s or 1,000 events, whichever is smaller.
   Anything older forces a snapshot.
8. High-frequency `mode: "stream"` subscriptions are throttled server-side to a
   configurable window (default 250 ms). The client coalesces UI updates to at
   most 4 per second per widget and keeps a bounded ring buffer.
9. Rate limits are enforced per connection and per subscription; exceeding them
   returns `error` with a retry hint instead of silently dropping data.
10. Authentication uses the session cookie for the web app and an embed token
    for embedded contexts (ADR-009). Token expiry closes the connection; the
    client refreshes credentials and resubscribes from the last sequence.
11. For v1 the gateway runs in-process inside the API monolith. Cross-instance
    fan-out is introduced behind an interface (Redis pub/sub) only when a
    second API instance exists.

## Consequences

- One connection serves many widgets; subscription lifecycle bugs affect many
  widgets at once, so registry tests are mandatory.
- Clients must implement sequence tracking, gap recovery and bounded buffers.
- Server memory is bounded by the replay buffer and subscription count.
- The protocol is versioned in the URL (`/ws/v1`), allowing a future breaking
  change without stranding existing clients.
- SSE is an acceptable one-way fallback but cannot express unsubscribe or
  client-originated subscribe with the same semantics.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| One WebSocket per widget | Connection churn, duplicated auth, poor mobile behavior |
| Polling only | Cannot meet monitoring latency and wastes bandwidth |
| SSE only | No bidirectional subscription control; reconnect state harder to model |
| Direct browser MQTT | Exposes broker credentials and bypasses authorization |
| Shove every event into TanStack Query | Cache churn, unrelated refetches, unbounded memory |

## Related documents

- [../realtime-protocol.md](../realtime-protocol.md)
- [../data-source-contracts.md](../data-source-contracts.md)
- [ADR-003](ADR-003-data-adapters.md)
- [ADR-009](ADR-009-embed-tokens.md)

## Review trigger

A second API instance is deployed, a new transport is added, or stream rates
exceed the throttle and buffer design.
