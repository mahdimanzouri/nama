import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { AddressInfo } from "node:net";

import { buildApp } from "../app.ts";
import { testEnv } from "./helpers.ts";
import { login, type LoginResult } from "./helpers.ts";

const LIVE_QUERY = {
  queryId: "live-kpi",
  dataset: "metrics",
  fields: ["value"],
  aggregations: [{ field: "value" as const, fn: "avg" as const }],
  timeRange: { mode: "relative" as const, last: "24h" },
};

const TIME_RANGE = {
  from: "2026-11-11T00:00:00.000Z",
  to: "2026-11-12T00:00:00.000Z",
};

function queryPayload(queryId = "kpi-avg") {
  return {
    queryId,
    dataSourceId: "demo-source",
    query: {
      queryId,
      dataset: "metrics",
      fields: ["value"],
      aggregations: [{ field: "value", fn: "avg" }],
    },
    timeRange: TIME_RANGE,
  };
}

function mutationHeaders(auth: LoginResult): Record<string, string> {
  return {
    cookie: auth.cookie,
    "x-csrf-token": auth.csrfToken,
  };
}

describe("operational hardening", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp(testEnv(), {
      rateLimits: {
        login: { limit: 2, windowMs: 60_000 },
        query: { limit: 1, windowMs: 60_000 },
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("reports readiness and echoes a request id", async () => {
    const ready = await app.inject({ method: "GET", url: "/readyz" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: "ready", persistence: "memory" });

    const health = await app.inject({ method: "GET", url: "/healthz" });
    expect(health.headers["x-request-id"]).toBeTruthy();
  });

  it("limits repeated login attempts per address and email", async () => {
    const attempt = () =>
      app.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: { email: "missing@nama.local", password: "wrong-password" },
      });

    expect((await attempt()).statusCode).toBe(401);
    expect((await attempt()).statusCode).toBe(401);

    const limited = await attempt();
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error).toMatchObject({ code: "RATE_LIMITED" });
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("limits query executions per user", async () => {
    const viewer = await login(app, "viewer@nama.local", "nama-viewer-123");

    const first = await app.inject({
      method: "POST",
      url: "/v1/queries/execute",
      headers: mutationHeaders(viewer),
      payload: queryPayload(),
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: "POST",
      url: "/v1/queries/execute",
      headers: mutationHeaders(viewer),
      payload: queryPayload("kpi-avg-2"),
    });
    expect(second.statusCode).toBe(429);
    expect(second.json().error.code).toBe("RATE_LIMITED");
  });

  it("exposes Prometheus counters for HTTP, queries and rate limits", async () => {
    const response = await app.inject({ method: "GET", url: "/metrics" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");

    const body = response.body;
    expect(body).toContain("# TYPE nama_http_requests_total counter");
    expect(body).toContain(
      'nama_http_requests_total{method="GET",route="/readyz",status="200"}',
    );
    expect(body).toContain("# TYPE nama_query_executions_total counter");
    expect(body).toContain('nama_query_executions_total{outcome="ok"}');
    expect(body).toContain('nama_rate_limited_total{scope="login"}');
    expect(body).toContain('nama_rate_limited_total{scope="query"}');
    expect(body).toContain("# TYPE nama_realtime_connections gauge");
    expect(body).toContain("nama_uptime_seconds");
  });
});

describe("metrics authentication", () => {
  it("requires the configured bearer token", async () => {
    const app = buildApp(testEnv({ METRICS_TOKEN: "metrics-token-value" }));
    try {
      const denied = await app.inject({ method: "GET", url: "/metrics" });
      expect(denied.statusCode).toBe(401);

      const allowed = await app.inject({
        method: "GET",
        url: "/metrics",
        headers: { authorization: "Bearer metrics-token-value" },
      });
      expect(allowed.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});

describe("realtime connection cap", () => {
  let app: FastifyInstance;
  let editor: LoginResult;
  let origin: string;

  beforeAll(async () => {
    app = buildApp(testEnv(), { realtime: { maxConnections: 1 } });
    editor = await login(app);
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address() as AddressInfo;
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects a second stream with 503 while the first is open", async () => {
    const params = new URLSearchParams({
      dataSourceId: "demo-source",
      queryId: "live-kpi",
      query: JSON.stringify(LIVE_QUERY),
      mode: "snapshot-then-stream",
      subscriptionId: "cap-a",
    });

    const controller = new AbortController();
    const first = await fetch(`${origin}/v1/stream?${params}`, {
      headers: { cookie: editor.cookie },
      signal: controller.signal,
    });
    expect(first.status).toBe(200);

    const second = await fetch(
      `${origin}/v1/stream?${params.toString().replace("cap-a", "cap-b")}`,
      { headers: { cookie: editor.cookie } },
    );
    expect(second.status).toBe(503);

    controller.abort();
    await first.body?.cancel().catch(() => undefined);
  });
});
