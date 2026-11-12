import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  QueryContext,
  QueryRequest,
  SubscriptionHandlers,
} from "@nama/dashboard-types";

import {
  createSseRealtimeAdapter,
  createWebSocketRealtimeAdapter,
  type EventSourceLike,
  type WebSocketLike,
} from "../realtime";

const CONTEXT: QueryContext = {
  signal: new AbortController().signal,
  requestId: "req-1",
  dashboardId: "dash-1",
  locale: "en",
  timezone: "UTC",
};

const RESULT = {
  queryId: "q",
  columns: [{ name: "production", type: "number" }],
  rows: [{ production: 121 }],
  timestamp: "2026-11-12T06:00:00.000Z",
  meta: { rowCount: 1, truncated: false, executionTimeMs: 1, cached: false },
};

function request(overrides: Partial<QueryRequest> = {}): QueryRequest {
  return {
    queryId: "q",
    dataSourceId: "factory-01",
    query: { queryId: "q", dataset: "metrics", fields: ["value"] },
    ...overrides,
  };
}

function handlers(): SubscriptionHandlers {
  return {
    onSnapshot: vi.fn(),
    onData: vi.fn(),
    onGap: vi.fn(),
    onError: vi.fn(),
    onStatus: vi.fn(),
  };
}

function connected(heartbeatIntervalMs = 30_000) {
  return {
    type: "connected",
    protocolVersion: 1,
    sessionId: "session-1",
    resumeWindowSeconds: 60,
    heartbeatIntervalMs,
  };
}

function subscriptionIdOf(socket: FakeWebSocket): string {
  const frame = socket.sent.find((entry) => entry.type === "subscribe") as
    { subscriptionId: string } | undefined;
  if (!frame) throw new Error("The adapter has not sent a subscribe frame");
  return frame.subscriptionId;
}

class FakeWebSocket implements WebSocketLike {
  static instances: FakeWebSocket[] = [];

  readyState = 0;
  sent: Array<Record<string, unknown>> = [];
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number; reason?: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  constructor(
    readonly url: string,
    readonly protocols?: string | string[],
  ) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  close(code = 1000, reason?: string): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  serverClose(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

class FakeEventSource implements EventSourceLike {
  static instances: FakeEventSource[] = [];

  onopen: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  closed = false;
  private readonly listeners = new Map<
    string,
    Array<(event: { data?: unknown }) => void>
  >();

  constructor(
    readonly url: string,
    readonly init?: { withCredentials?: boolean },
  ) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  close(): void {
    this.closed = true;
  }

  open(): void {
    this.onopen?.({});
  }

  emit(type: string, message: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data: JSON.stringify(message) });
    }
  }
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  FakeEventSource.instances = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("WebSocket realtime adapter", () => {
  it("shares one socket across subscriptions and subscribes after connected", async () => {
    const adapter = createWebSocketRealtimeAdapter({
      url: "ws://localhost/ws/v1",
      WebSocket: FakeWebSocket,
    });

    const first = handlers();
    const second = handlers();
    await adapter.subscribe(request(), CONTEXT, first);
    await adapter.subscribe(request({ queryId: "q2" }), CONTEXT, second);

    expect(FakeWebSocket.instances).toHaveLength(1);
    const socket = FakeWebSocket.instances[0]!;
    expect(socket.url).toBe("ws://localhost/ws/v1");
    expect(socket.sent).toHaveLength(0);

    socket.open();
    socket.receive(connected());

    const frames = socket.sent.filter((entry) => entry.type === "subscribe");
    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({
      dataSourceId: "factory-01",
      queryId: "q",
      mode: "snapshot-then-stream",
    });
    expect(frames[0]?.query).toEqual({
      queryId: "q",
      dataset: "metrics",
      fields: ["value"],
    });
    expect(first.onStatus).toHaveBeenCalledWith("open");
    expect(second.onStatus).toHaveBeenCalledWith("open");
  });

  it("treats the snapshot as state and drops duplicates until a gap", async () => {
    const adapter = createWebSocketRealtimeAdapter({
      url: "ws://localhost/ws/v1",
      WebSocket: FakeWebSocket,
    });
    const first = handlers();
    await adapter.subscribe(request(), CONTEXT, first);

    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    socket.receive(connected());
    const subscriptionId = subscriptionIdOf(socket);

    socket.receive({
      type: "snapshot",
      subscriptionId,
      sequence: 1,
      timestamp: "2026-11-12T06:00:00.000Z",
      data: RESULT,
    });
    expect(first.onSnapshot).toHaveBeenCalledWith(RESULT);

    socket.receive({
      type: "data",
      subscriptionId,
      sequence: 2,
      timestamp: "2026-11-12T06:00:01.000Z",
      data: { production: 122 },
    });
    expect(first.onData).toHaveBeenCalledTimes(1);

    socket.receive({
      type: "data",
      subscriptionId,
      sequence: 2,
      timestamp: "2026-11-12T06:00:01.000Z",
      data: { production: 122 },
    });
    expect(first.onData).toHaveBeenCalledTimes(1);

    socket.receive({
      type: "data",
      subscriptionId,
      sequence: 4,
      timestamp: "2026-11-12T06:00:03.000Z",
      data: { production: 124 },
    });
    expect(first.onGap).toHaveBeenCalledTimes(1);
    expect(first.onData).toHaveBeenCalledTimes(1);

    socket.receive({
      type: "data",
      subscriptionId,
      sequence: 5,
      timestamp: "2026-11-12T06:00:04.000Z",
      data: { production: 125 },
    });
    expect(first.onData).toHaveBeenCalledTimes(1);

    socket.receive({
      type: "snapshot",
      subscriptionId,
      sequence: 6,
      timestamp: "2026-11-12T06:00:05.000Z",
      data: RESULT,
    });
    expect(first.onSnapshot).toHaveBeenCalledTimes(2);
  });

  it("surfaces protocol errors that carry a subscription id", async () => {
    const adapter = createWebSocketRealtimeAdapter({
      url: "ws://localhost/ws/v1",
      WebSocket: FakeWebSocket,
    });
    const first = handlers();
    await adapter.subscribe(request(), CONTEXT, first);

    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    socket.receive(connected());

    socket.receive({
      type: "error",
      code: "RATE_LIMITED",
      message: "Too many events",
      subscriptionId: subscriptionIdOf(socket),
      retryAfterMs: 500,
    });

    expect(first.onError).toHaveBeenCalledWith({
      code: "RATE_LIMITED",
      message: "Too many events",
      retryAfterMs: 500,
    });
  });

  it("unsubscribes individually and closes the socket with the last one", async () => {
    const adapter = createWebSocketRealtimeAdapter({
      url: "ws://localhost/ws/v1",
      WebSocket: FakeWebSocket,
    });
    const stopFirst = await adapter.subscribe(request(), CONTEXT, handlers());
    const stopSecond = await adapter.subscribe(
      request({ queryId: "q2" }),
      CONTEXT,
      handlers(),
    );

    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    socket.receive(connected());
    const secondId = subscriptionIdOf(socket);

    await stopFirst();
    expect(socket.readyState).toBe(1);
    expect(socket.sent.some((entry) => entry.type === "unsubscribe")).toBe(true);

    await stopSecond();
    expect(socket.readyState).toBe(3);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(
      socket.sent.filter(
        (entry) => entry.type === "unsubscribe" && entry.subscriptionId === secondId,
      ),
    ).toHaveLength(1);
  });

  it("reconnects with exponential backoff and resumes from the last sequence", async () => {
    vi.useFakeTimers();
    const adapter = createWebSocketRealtimeAdapter({
      url: "ws://localhost/ws/v1",
      WebSocket: FakeWebSocket,
      reconnect: { jitterRatio: 0, baseMs: 100 },
    });
    const first = handlers();
    await adapter.subscribe(request(), CONTEXT, first);

    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    socket.receive(connected());
    socket.receive({
      type: "snapshot",
      subscriptionId: subscriptionIdOf(socket),
      sequence: 7,
      timestamp: "2026-11-12T06:00:00.000Z",
      data: RESULT,
    });

    socket.serverClose(1006);
    expect(first.onStatus).toHaveBeenCalledWith("reconnecting");

    await vi.advanceTimersByTimeAsync(200);
    expect(FakeWebSocket.instances).toHaveLength(2);

    const resumed = FakeWebSocket.instances[1]!;
    resumed.open();
    resumed.receive(connected());

    expect(resumed.sent.find((entry) => entry.type === "subscribe")).toMatchObject({
      resumeFrom: 7,
    });
  });

  it("sends heartbeats and closes after missed server messages", async () => {
    vi.useFakeTimers();
    const adapter = createWebSocketRealtimeAdapter({
      url: "ws://localhost/ws/v1",
      WebSocket: FakeWebSocket,
    });
    await adapter.subscribe(request(), CONTEXT, handlers());

    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    socket.receive(connected(100));

    await vi.advanceTimersByTimeAsync(100);
    expect(socket.sent.some((entry) => entry.type === "heartbeat")).toBe(true);

    await vi.advanceTimersByTimeAsync(400);
    expect(socket.readyState).toBe(3);
  });

  it("passes the embed token as a subprotocol and stops after revocation", async () => {
    vi.useFakeTimers();
    const adapter = createWebSocketRealtimeAdapter({
      url: "ws://localhost/ws/v1",
      WebSocket: FakeWebSocket,
      embedToken: "opaque-token",
      reconnect: { jitterRatio: 0, baseMs: 100 },
    });
    const first = handlers();
    await adapter.subscribe(request(), CONTEXT, first);

    const socket = FakeWebSocket.instances[0]!;
    expect(socket.protocols).toEqual(["nama.embed.opaque-token"]);

    socket.open();
    socket.serverClose(4403);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(first.onStatus).toHaveBeenCalledWith("closed");
  });
});

describe("SSE realtime adapter", () => {
  it("streams one event source per subscription and resumes by sequence", async () => {
    const adapter = createSseRealtimeAdapter({
      url: "/api/",
      EventSource: FakeEventSource,
    });
    const first = handlers();
    const stop = await adapter.subscribe(request(), CONTEXT, first);

    expect(FakeEventSource.instances).toHaveLength(1);
    const source = FakeEventSource.instances[0]!;
    expect(source.url).toMatch(/^\/api\/v1\/stream\?/u);
    expect(source.url).toContain("dataSourceId=factory-01");
    expect(source.url).toContain("queryId=q");
    expect(source.url).toContain(
      `query=${encodeURIComponent(JSON.stringify(request().query))}`,
    );
    expect(source.init?.withCredentials).toBe(true);

    source.open();
    expect(first.onStatus).toHaveBeenCalledWith("open");

    const subscriptionId = new URL(`http://x${source.url}`).searchParams.get(
      "subscriptionId",
    )!;
    source.emit("subscribed", {
      type: "subscribed",
      subscriptionId,
      firstSequence: 3,
      mode: "snapshot-then-stream",
    });
    source.emit("snapshot", {
      type: "snapshot",
      subscriptionId,
      sequence: 3,
      timestamp: "2026-11-12T06:00:00.000Z",
      data: RESULT,
    });
    expect(first.onSnapshot).toHaveBeenCalledWith(RESULT);

    source.emit("data", {
      type: "data",
      subscriptionId,
      sequence: 4,
      timestamp: "2026-11-12T06:00:01.000Z",
      data: { production: 124 },
    });
    expect(first.onData).toHaveBeenCalledTimes(1);

    source.emit("gap", { type: "gap", subscriptionId, requiresSnapshot: true });
    expect(first.onGap).toHaveBeenCalledTimes(1);

    await stop();
    expect(source.closed).toBe(true);
    expect(first.onStatus).toHaveBeenCalledWith("closed");
  });
});
