import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { createApp, login, mutationHeaders, type LoginResult } from "./helpers.ts";

const TIME_RANGE = {
  from: "2026-11-11T00:00:00.000Z",
  to: "2026-11-12T00:00:00.000Z",
};

describe("query execution", () => {
  let app: FastifyInstance;
  let viewer: LoginResult;

  beforeAll(async () => {
    app = await createApp();
    viewer = await login(app, "viewer@nama.local", "nama-viewer-123");
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns an aggregate for a KPI query", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/queries/execute",
      headers: mutationHeaders(viewer),
      payload: {
        queryId: "kpi-avg",
        dataSourceId: "demo-source",
        query: {
          queryId: "kpi-avg",
          dataset: "metrics",
          fields: ["value"],
          aggregations: [{ field: "value", fn: "avg" }],
        },
        timeRange: TIME_RANGE,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.queryId).toBe("kpi-avg");
    expect(body.rows).toHaveLength(1);
    expect(typeof body.rows[0].value).toBe("number");
    expect(body.meta.rowCount).toBe(1);
    expect(body.meta.truncated).toBe(false);
    expect(typeof body.timestamp).toBe("string");
  });

  it("returns a truncated time series for a line query", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/queries/execute",
      headers: mutationHeaders(viewer),
      payload: {
        queryId: "line-trend",
        dataSourceId: "demo-source",
        query: {
          queryId: "line-trend",
          dataset: "metrics",
          fields: ["timestamp", "value"],
          limit: 10,
        },
        timeRange: TIME_RANGE,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.rows).toHaveLength(10);
    expect(body.meta.truncated).toBe(true);
    expect(body.columns.map((column: { name: string }) => column.name)).toEqual([
      "timestamp",
      "value",
    ]);
    expect(Date.parse(body.rows[0].timestamp)).toBeLessThanOrEqual(
      Date.parse(body.rows[9].timestamp),
    );
  });

  it("rejects unknown data sources and malformed requests", async () => {
    const unknown = await app.inject({
      method: "POST",
      url: "/v1/queries/execute",
      headers: mutationHeaders(viewer),
      payload: {
        queryId: "q",
        dataSourceId: "missing-source",
        query: { queryId: "q", fields: ["value"] },
      },
    });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().error.code).toBe("NOT_FOUND");

    const malformed = await app.inject({
      method: "POST",
      url: "/v1/queries/execute",
      headers: mutationHeaders(viewer),
      payload: { queryId: "q" },
    });
    expect(malformed.statusCode).toBe(422);
    expect(malformed.json().error.code).toBe("QUERY_INVALID");
  });

  it("requires authentication and CSRF", async () => {
    const anonymous = await app.inject({
      method: "POST",
      url: "/v1/queries/execute",
      payload: {
        queryId: "q",
        dataSourceId: "demo-source",
        query: { queryId: "q", fields: ["value"] },
      },
    });
    expect(anonymous.statusCode).toBe(401);

    const withoutCsrf = await app.inject({
      method: "POST",
      url: "/v1/queries/execute",
      headers: { cookie: viewer.cookie },
      payload: {
        queryId: "q",
        dataSourceId: "demo-source",
        query: { queryId: "q", fields: ["value"] },
      },
    });
    expect(withoutCsrf.statusCode).toBe(403);
  });
});
