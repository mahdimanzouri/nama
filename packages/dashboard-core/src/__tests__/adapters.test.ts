import { describe, expect, it, vi } from "vitest";
import type { QueryContext, QueryRequest } from "@nama/dashboard-types";

import {
  createHttpDataAdapter,
  createStaticDataAdapter,
  DataAdapterError,
} from "../adapters";

const CONTEXT: QueryContext = {
  signal: new AbortController().signal,
  requestId: "req-1",
  dashboardId: "dash-1",
  locale: "en",
  timezone: "UTC",
};

function request(overrides: Partial<QueryRequest> = {}): QueryRequest {
  return {
    queryId: "q",
    dataSourceId: "ds-1",
    query: { queryId: "q", dataset: "metrics", fields: ["timestamp", "value"] },
    ...overrides,
  };
}

const RESULT = {
  queryId: "q",
  columns: [
    { name: "timestamp", type: "timestamp" },
    { name: "value", type: "number" },
  ],
  rows: [{ timestamp: "2026-11-12T00:00:00.000Z", value: 3 }],
  timestamp: "2026-11-12T00:00:01.000Z",
  meta: { rowCount: 1, truncated: false, executionTimeMs: 1, cached: false },
};

describe("static data adapter", () => {
  const adapter = createStaticDataAdapter({
    metrics: [
      { timestamp: "2026-11-10T00:00:00.000Z", value: 1 },
      { timestamp: "2026-11-11T00:00:00.000Z", value: 5 },
      { timestamp: "2026-11-12T00:00:00.000Z", value: 9 },
    ],
  });

  it("filters, orders and truncates rows", async () => {
    const result = await adapter.execute(
      request({
        query: {
          queryId: "q",
          dataset: "metrics",
          fields: ["timestamp", "value"],
          filters: [{ field: "value", operator: "gte", value: 5 }],
          orderBy: [{ field: "value", direction: "desc" }],
          limit: 1,
        },
      }),
      CONTEXT,
    );

    expect(result.rows).toEqual([{ timestamp: "2026-11-12T00:00:00.000Z", value: 9 }]);
    expect(result.meta.truncated).toBe(true);
    expect(result.columns.map((column) => column.name)).toEqual(["timestamp", "value"]);
  });

  it("aggregates to a single row", async () => {
    const result = await adapter.execute(
      request({
        query: {
          queryId: "q",
          dataset: "metrics",
          fields: ["value"],
          aggregations: [{ field: "value", fn: "avg" }],
        },
      }),
      CONTEXT,
    );

    expect(result.rows).toEqual([{ value: 5 }]);
    expect(result.columns).toEqual([{ name: "value", type: "number" }]);
  });

  it("resolves a persisted relative range", async () => {
    const result = await adapter.execute(
      request({
        query: {
          queryId: "q",
          dataset: "metrics",
          fields: ["value"],
          timeRange: { mode: "relative", last: "1d" },
        },
      }),
      { ...CONTEXT },
    );

    expect(result.meta.rowCount).toBeGreaterThanOrEqual(1);
  });

  it("rejects an unknown dataset", async () => {
    await expect(
      adapter.execute(
        request({ query: { queryId: "q", dataset: "missing", fields: ["value"] } }),
        CONTEXT,
      ),
    ).rejects.toMatchObject({ code: "QUERY_INVALID" });
  });
});

describe("HTTP data adapter", () => {
  it("posts the request with CSRF and parses the result", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify(RESULT), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const adapter = createHttpDataAdapter({
      baseUrl: "/api/",
      fetch: fetchImpl as unknown as typeof globalThis.fetch,
      csrfToken: () => "csrf-token",
      headers: { "x-host": "web" },
    });

    const result = await adapter.execute(request(), CONTEXT);
    expect(result.rows).toHaveLength(1);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/queries/execute");
    expect(init.credentials).toBe("include");
    expect(init.headers).toMatchObject({
      "content-type": "application/json",
      "x-csrf-token": "csrf-token",
      "x-host": "web",
    });
    expect(init.signal).toBe(CONTEXT.signal);
  });

  it("surfaces the server error envelope", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: "QUERY_TIMEOUT", message: "too slow", requestId: "req-9" },
          }),
          { status: 504, headers: { "content-type": "application/json" } },
        ),
    );
    const adapter = createHttpDataAdapter({
      fetch: fetchImpl as unknown as typeof globalThis.fetch,
    });

    await expect(adapter.execute(request(), CONTEXT)).rejects.toMatchObject({
      name: "DataAdapterError",
      code: "QUERY_TIMEOUT",
      status: 504,
      requestId: "req-9",
    });
    await expect(adapter.execute(request(), CONTEXT)).rejects.toBeInstanceOf(
      DataAdapterError,
    );
  });
});
