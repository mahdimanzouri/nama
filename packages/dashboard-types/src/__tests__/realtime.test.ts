import { describe, expect, it } from "vitest";

import {
  CONNECTION_CLOSE_CODES,
  REALTIME_DEFAULTS,
  REALTIME_MESSAGE_TYPES,
  REALTIME_PROTOCOL_VERSION,
  realtimeAuthenticateMessageSchema,
  realtimeClientMessageSchema,
  realtimeServerMessageSchema,
  replayWindow,
} from "../index";

describe("protocol constants", () => {
  it("declares exactly the ten documented message types", () => {
    expect(REALTIME_MESSAGE_TYPES).toHaveLength(10);
    expect(REALTIME_MESSAGE_TYPES).toEqual([
      "connected",
      "subscribe",
      "subscribed",
      "snapshot",
      "data",
      "gap",
      "unsubscribe",
      "unsubscribed",
      "error",
      "heartbeat",
    ]);
    expect(REALTIME_PROTOCOL_VERSION).toBe(1);
  });

  it("documents the close codes and reconnect defaults", () => {
    expect(CONNECTION_CLOSE_CODES).toEqual({
      normal: 1000,
      authExpired: 4401,
      revoked: 4403,
      heartbeatTimeout: 4408,
      rateLimited: 4429,
    });
    expect(REALTIME_DEFAULTS.reconnectBaseMs).toBe(500);
    expect(REALTIME_DEFAULTS.reconnectCapMs).toBe(30_000);
    expect(REALTIME_DEFAULTS.heartbeatIntervalMs).toBe(30_000);
  });

  it("bounds the replay window to 60 seconds or 1,000 events", () => {
    expect(replayWindow).toEqual({ maxAgeMs: 60_000, maxEvents: 1_000 });
  });
});

describe("client messages", () => {
  it("accepts an authenticate handshake frame", () => {
    const result = realtimeAuthenticateMessageSchema.safeParse({
      type: "authenticate",
      token: "opaque-embed-token",
    });

    expect(result.success).toBe(true);
  });

  it("defaults a subscription to snapshot-then-stream", () => {
    const result = realtimeClientMessageSchema.safeParse({
      type: "subscribe",
      requestId: "req-1",
      subscriptionId: "sub-123",
      dataSourceId: "factory-01",
      queryId: "production-live",
      query: {
        queryId: "production-live",
        dataset: "production",
        fields: ["value"],
        timeRange: { mode: "relative", last: "1h" },
      },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toMatchObject({ mode: "snapshot-then-stream" });
  });

  it("accepts a resume point and parameters", () => {
    const result = realtimeClientMessageSchema.safeParse({
      type: "subscribe",
      requestId: "req-1",
      subscriptionId: "sub-123",
      dataSourceId: "factory-01",
      queryId: "production-live",
      query: {
        queryId: "production-live",
        dataset: "production",
        fields: ["value"],
      },
      mode: "stream",
      resumeFrom: 1024,
      parameters: { machineId: "machine-01" },
    });

    expect(result.success).toBe(true);
  });

  it("rejects a negative resume point", () => {
    const result = realtimeClientMessageSchema.safeParse({
      type: "subscribe",
      requestId: "req-1",
      subscriptionId: "sub-123",
      dataSourceId: "factory-01",
      queryId: "production-live",
      query: {
        queryId: "production-live",
        dataset: "production",
        fields: ["value"],
      },
      resumeFrom: -1,
    });

    expect(result.success).toBe(false);
  });

  it("requires the query definition to carry the subscription query id", () => {
    const result = realtimeClientMessageSchema.safeParse({
      type: "subscribe",
      requestId: "req-1",
      subscriptionId: "sub-123",
      dataSourceId: "factory-01",
      queryId: "production-live",
      query: { queryId: "another-query", fields: ["value"] },
    });

    expect(result.success).toBe(false);
  });

  it("rejects a subscription without a query definition", () => {
    const result = realtimeClientMessageSchema.safeParse({
      type: "subscribe",
      requestId: "req-1",
      subscriptionId: "sub-123",
      dataSourceId: "factory-01",
      queryId: "production-live",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an unknown message type", () => {
    const result = realtimeClientMessageSchema.safeParse({ type: "subscribe-all" });

    expect(result.success).toBe(false);
  });

  it("accepts unsubscribe and heartbeat frames", () => {
    expect(
      realtimeClientMessageSchema.safeParse({
        type: "unsubscribe",
        requestId: "req-2",
        subscriptionId: "sub-123",
      }).success,
    ).toBe(true);

    expect(realtimeClientMessageSchema.safeParse({ type: "heartbeat" }).success).toBe(
      true,
    );
  });
});

describe("server messages", () => {
  it("accepts the connected frame", () => {
    const result = realtimeServerMessageSchema.safeParse({
      type: "connected",
      protocolVersion: 1,
      sessionId: "session-1",
      resumeWindowSeconds: 60,
      heartbeatIntervalMs: 30_000,
    });

    expect(result.success).toBe(true);
  });

  it("rejects a connected frame with another protocol version", () => {
    const result = realtimeServerMessageSchema.safeParse({
      type: "connected",
      protocolVersion: 2,
      sessionId: "session-1",
      resumeWindowSeconds: 60,
      heartbeatIntervalMs: 30_000,
    });

    expect(result.success).toBe(false);
  });

  it("accepts subscribed, snapshot, data and gap frames", () => {
    expect(
      realtimeServerMessageSchema.safeParse({
        type: "subscribed",
        subscriptionId: "sub-123",
        firstSequence: 1025,
        mode: "snapshot-then-stream",
      }).success,
    ).toBe(true);

    expect(
      realtimeServerMessageSchema.safeParse({
        type: "snapshot",
        subscriptionId: "sub-123",
        sequence: 1025,
        timestamp: "2026-11-12T06:00:00Z",
        data: { columns: [{ name: "production", type: "number" }], rows: [] },
      }).success,
    ).toBe(true);

    expect(
      realtimeServerMessageSchema.safeParse({
        type: "data",
        subscriptionId: "sub-123",
        sequence: 1026,
        timestamp: "2026-11-12T06:00:01Z",
        data: { production: 121 },
      }).success,
    ).toBe(true);

    expect(
      realtimeServerMessageSchema.safeParse({
        type: "gap",
        subscriptionId: "sub-123",
        requiresSnapshot: true,
      }).success,
    ).toBe(true);
  });

  it("requires a sequence on snapshot and data frames", () => {
    const result = realtimeServerMessageSchema.safeParse({
      type: "data",
      subscriptionId: "sub-123",
      timestamp: "2026-11-12T06:00:01Z",
      data: { production: 121 },
    });

    expect(result.success).toBe(false);
  });

  it("accepts unsubscribed, error and heartbeat frames", () => {
    expect(
      realtimeServerMessageSchema.safeParse({
        type: "unsubscribed",
        subscriptionId: "sub-123",
      }).success,
    ).toBe(true);

    expect(
      realtimeServerMessageSchema.safeParse({
        type: "error",
        code: "RATE_LIMITED",
        message: "Too many events",
        subscriptionId: "sub-123",
        retryAfterMs: 500,
      }).success,
    ).toBe(true);

    expect(realtimeServerMessageSchema.safeParse({ type: "heartbeat" }).success).toBe(
      true,
    );
  });

  it("rejects an unknown error code", () => {
    const result = realtimeServerMessageSchema.safeParse({
      type: "error",
      code: "SOMETHING_ELSE",
      message: "Nope",
    });

    expect(result.success).toBe(false);
  });
});
