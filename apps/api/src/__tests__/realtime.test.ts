import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import type { FastifyInstance } from "fastify";
import type { AddressInfo } from "node:net";

import {
  createApp,
  demoConfig,
  login,
  mutationHeaders,
  type LoginResult,
} from "./helpers.ts";

interface AnyMessage {
  type: string;
  subscriptionId?: string;
  sequence?: number;
  firstSequence?: number;
  code?: string;
  data?: {
    columns?: Array<{ name: string }>;
    rows?: Array<Record<string, unknown>>;
  };
}

class TestClient {
  readonly messages: AnyMessage[] = [];
  private closeCode: number | undefined;
  private waiters: Array<{
    predicate: (message: AnyMessage) => boolean;
    resolve: (message: AnyMessage) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  private constructor(readonly socket: WebSocket) {
    socket.on("close", (code) => {
      this.closeCode = code;
    });
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString()) as AnyMessage;
      this.messages.push(message);
      for (const waiter of [...this.waiters]) {
        if (waiter.predicate(message)) {
          clearTimeout(waiter.timer);
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          waiter.resolve(message);
        }
      }
    });
  }

  static async connect(
    url: string,
    options: { cookie?: string; protocols?: string[] } = {},
  ): Promise<TestClient> {
    const socket = new WebSocket(url, options.protocols ?? [], {
      headers: options.cookie ? { cookie: options.cookie } : {},
    });
    const client = new TestClient(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => resolve());
      socket.once("error", (error) => reject(error));
      socket.once("unexpected-response", (_request, response) =>
        reject(new Error(`HTTP ${response.statusCode}`)),
      );
    });
    return client;
  }

  send(message: unknown): void {
    this.socket.send(JSON.stringify(message));
  }

  next(
    predicate: (message: AnyMessage) => boolean,
    timeoutMs = 2_000,
  ): Promise<AnyMessage> {
    const found = this.messages.find(predicate);
    if (found) {
      this.messages.splice(this.messages.indexOf(found), 1);
      return Promise.resolve(found);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        reject(new Error("Timed out waiting for a realtime message"));
      }, timeoutMs);
      const waiter = { predicate, resolve, reject, timer };
      this.waiters.push(waiter);
    });
  }

  closed(): Promise<number> {
    if (this.closeCode !== undefined) return Promise.resolve(this.closeCode);
    return new Promise((resolve) => {
      this.socket.once("close", (code) => resolve(code));
    });
  }

  close(): void {
    this.socket.close();
  }
}

const LIVE_QUERY = {
  queryId: "live-kpi",
  dataset: "metrics",
  fields: ["value"],
  aggregations: [{ field: "value" as const, fn: "avg" as const }],
  timeRange: { mode: "relative" as const, last: "24h" },
};

function subscribeMessage(subscriptionId: string, queryId = "live-kpi", extra = {}) {
  return {
    type: "subscribe",
    requestId: `req-${subscriptionId}`,
    subscriptionId,
    dataSourceId: "demo-source",
    queryId,
    query: { ...LIVE_QUERY, queryId },
    ...extra,
  };
}

describe("realtime gateway", () => {
  let app: FastifyInstance;
  let editor: LoginResult;
  let dashboardId: string;
  let embedToken: string;
  let url: string;

  beforeAll(async () => {
    app = await createApp({
      realtime: {
        pollIntervalMs: 40,
        throttleMs: 20,
        authTimeoutMs: 200,
        heartbeatIntervalMs: 5_000,
        replayMaxAgeMs: 5_000,
      },
    });
    editor = await login(app);

    const created = await app.inject({
      method: "POST",
      url: "/v1/dashboards",
      headers: mutationHeaders(editor),
      payload: { name: "Live" },
    });
    dashboardId = created.json().id;
    await app.inject({
      method: "PUT",
      url: `/v1/dashboards/${dashboardId}/draft`,
      headers: mutationHeaders(editor, 1),
      payload: { config: demoConfig("Live") },
    });
    await app.inject({
      method: "POST",
      url: `/v1/dashboards/${dashboardId}/publish`,
      headers: mutationHeaders(editor, 2),
    });
    const token = await app.inject({
      method: "POST",
      url: `/v1/dashboards/${dashboardId}/embed-tokens`,
      headers: mutationHeaders(editor),
      payload: { expiresInSeconds: 300 },
    });
    embedToken = token.json().token;

    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address() as AddressInfo;
    url = `ws://127.0.0.1:${address.port}/ws/v1`;
  });

  afterAll(async () => {
    await app.close();
  });

  it("shares one socket between subscriptions and streams snapshots", async () => {
    const client = await TestClient.connect(url, { cookie: editor.cookie });
    const connected = await client.next((message) => message.type === "connected");
    expect(connected).toMatchObject({ protocolVersion: 1, resumeWindowSeconds: 5 });

    client.send(subscribeMessage("kpi-a"));
    client.send(subscribeMessage("kpi-b", "live-kpi-2"));

    const subscribedA = await client.next(
      (message) => message.type === "subscribed" && message.subscriptionId === "kpi-a",
    );
    expect(subscribedA.firstSequence).toBe(1);
    const subscribedB = await client.next(
      (message) => message.type === "subscribed" && message.subscriptionId === "kpi-b",
    );
    expect(subscribedB.firstSequence).toBe(1);

    const snapshotA = await client.next(
      (message) => message.type === "snapshot" && message.subscriptionId === "kpi-a",
    );
    const snapshotB = await client.next(
      (message) => message.type === "snapshot" && message.subscriptionId === "kpi-b",
    );
    expect(snapshotA.sequence).toBe(1);
    expect(snapshotB.sequence).toBe(1);
    expect(snapshotA.data?.columns?.map((column) => column.name)).toEqual(["value"]);
    expect(snapshotB.data?.rows).toHaveLength(1);

    const secondA = await client.next(
      (message) =>
        message.type === "snapshot" &&
        message.subscriptionId === "kpi-a" &&
        (message.sequence ?? 0) >= 2,
    );
    expect(secondA.sequence).toBeGreaterThan(1);

    client.send({
      type: "unsubscribe",
      requestId: "req-unsub",
      subscriptionId: "kpi-a",
    });
    await client.next(
      (message) => message.type === "unsubscribed" && message.subscriptionId === "kpi-a",
    );

    const after = client.messages.length;
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(
      client.messages.slice(after).some((message) => message.subscriptionId === "kpi-a"),
    ).toBe(false);
    client.close();
  });

  it("replays the missing range after a reconnect", async () => {
    const first = await TestClient.connect(url, { cookie: editor.cookie });
    await first.next((message) => message.type === "connected");
    first.send(subscribeMessage("resume-sub"));
    await first.next((message) => message.type === "subscribed");
    const baseline = await first.next(
      (message) => message.type === "snapshot" && message.subscriptionId === "resume-sub",
    );
    const nextSnapshot = await first.next(
      (message) =>
        message.type === "snapshot" &&
        message.subscriptionId === "resume-sub" &&
        (message.sequence ?? 0) > (baseline.sequence ?? 0),
    );
    first.close();

    const second = await TestClient.connect(url, { cookie: editor.cookie });
    await second.next((message) => message.type === "connected");
    second.send(
      subscribeMessage("resume-sub", "live-kpi", { resumeFrom: baseline.sequence }),
    );
    const subscribed = await second.next((message) => message.type === "subscribed");
    expect(subscribed.firstSequence).toBe(nextSnapshot.sequence);

    const replayed = await second.next(
      (message) =>
        message.subscriptionId === "resume-sub" &&
        (message.type === "snapshot" || message.type === "data"),
    );
    expect(replayed.sequence).toBe(nextSnapshot.sequence);
    second.close();
  });

  it("sends a gap when the resume point is not buffered", async () => {
    const client = await TestClient.connect(url, { cookie: editor.cookie });
    await client.next((message) => message.type === "connected");
    client.send(subscribeMessage("gap-sub", "live-kpi", { resumeFrom: 10_000 }));
    const gap = await client.next(
      (message) => message.type === "gap" && message.subscriptionId === "gap-sub",
    );
    expect(gap).toMatchObject({ requiresSnapshot: true });
    const snapshot = await client.next(
      (message) => message.type === "snapshot" && message.subscriptionId === "gap-sub",
    );
    expect(snapshot.sequence).toBe(1);
    client.close();
  });

  it("rejects an unauthenticated socket after the auth timeout", async () => {
    const client = await TestClient.connect(url);
    expect(await client.closed()).toBe(4401);
  });

  it("authenticates an embed token and enforces the dashboard scope", async () => {
    const client = await TestClient.connect(url, {
      protocols: [`nama.embed.${embedToken}`],
    });
    const connected = await client.next((message) => message.type === "connected");
    expect(connected.type).toBe("connected");

    client.send(subscribeMessage("embed-sub"));
    await client.next(
      (message) =>
        message.type === "subscribed" && message.subscriptionId === "embed-sub",
    );
    await client.next(
      (message) => message.type === "snapshot" && message.subscriptionId === "embed-sub",
    );

    client.send({
      ...subscribeMessage("embed-other"),
      dataSourceId: "0192f4c2-0000-7000-8000-000000000000",
    });
    const denied = await client.next(
      (message) => message.type === "error" && message.subscriptionId === "embed-other",
    );
    expect(denied.code).toBe("FORBIDDEN");
    client.close();
  });

  it("rejects an invalid embed token during the upgrade", async () => {
    await expect(
      TestClient.connect(url, { protocols: ["nama.embed.not-a-token"] }),
    ).rejects.toThrow("HTTP 401");
  });

  it("streams SSE events and resumes from Last-Event-ID", async () => {
    const params = new URLSearchParams({
      dataSourceId: "demo-source",
      queryId: "live-kpi",
      query: JSON.stringify(LIVE_QUERY),
      mode: "snapshot-then-stream",
      subscriptionId: "sse-live",
    });
    const controller = new AbortController();
    const response = await fetch(
      `${url.replace("ws://", "http://").replace("/ws/v1", "")}/v1/stream?${params}`,
      {
        headers: { cookie: editor.cookie },
        signal: controller.signal,
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let snapshotId: number | undefined;

    while (snapshotId === undefined) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const match = /id: (\d+)\nevent: snapshot\n/u.exec(buffer);
      if (match) snapshotId = Number(match[1]);
    }
    expect(snapshotId).toBe(1);

    controller.abort();
    await reader.cancel().catch(() => undefined);

    const resume = new AbortController();
    const resumed = await fetch(
      `${url.replace("ws://", "http://").replace("/ws/v1", "")}/v1/stream?${params}`,
      {
        headers: { cookie: editor.cookie, "last-event-id": String(snapshotId) },
        signal: resume.signal,
      },
    );
    const reader2 = resumed.body!.getReader();
    let resumedBuffer = "";
    let sequence: number | undefined;
    while (sequence === undefined) {
      const { value, done } = await reader2.read();
      if (done) break;
      resumedBuffer += decoder.decode(value, { stream: true });
      const match = /id: (\d+)\nevent: (snapshot|data)\n/u.exec(resumedBuffer);
      if (match) sequence = Number(match[1]);
    }
    expect(sequence).toBeGreaterThan(snapshotId!);
    resume.abort();
    await reader2.cancel().catch(() => undefined);
    expect(dashboardId).toBeTruthy();
  });
});

describe("realtime heartbeat", () => {
  it("closes a silent connection with the heartbeat code", async () => {
    const app = await createApp({
      realtime: {
        heartbeatIntervalMs: 60,
        missedHeartbeats: 1,
        authTimeoutMs: 1_000,
        pollIntervalMs: 1_000,
      },
    });
    const session = await login(app);
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address() as AddressInfo;

    const client = await TestClient.connect(`ws://127.0.0.1:${address.port}/ws/v1`, {
      cookie: session.cookie,
    });
    await expect(client.closed()).resolves.toBe(4408);

    await app.close();
  });
});
