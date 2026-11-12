import { describe, expect, it } from "vitest";
import type { DashboardWidget } from "@nama/dashboard-types";

import {
  buildQueryRequest,
  queryKeyFor,
  resolveQueryTimeRange,
  stableStringify,
} from "../query";

const NOW = new Date("2026-11-12T12:00:00.000Z");

function createWidget(overrides: Partial<DashboardWidget> = {}): DashboardWidget {
  return {
    id: "widget-1",
    type: "@acme/line",
    configVersion: 1,
    title: "Requests",
    dataSourceId: "ds-1",
    config: {},
    query: {
      queryId: "requests-over-time",
      fields: ["timestamp", "count"],
      filters: [
        { field: "status", operator: "eq", value: "ok" },
        { field: "region", operator: "in", value: ["eu", "us"] },
      ],
      timeRange: { mode: "relative", last: "24h" },
    },
    ...overrides,
  };
}

describe("time range resolution", () => {
  it("resolves relative ranges against the supplied clock", () => {
    expect(resolveQueryTimeRange({ mode: "relative", last: "24h" }, NOW)).toEqual({
      from: "2026-11-11T12:00:00.000Z",
      to: "2026-11-12T12:00:00.000Z",
    });
    expect(resolveQueryTimeRange({ mode: "relative", last: "30m" }, NOW)?.from).toBe(
      "2026-11-12T11:30:00.000Z",
    );
  });

  it("passes absolute ranges through and ignores undefined", () => {
    const range = { from: "2026-01-01T00:00:00.000Z", to: "2026-01-02T00:00:00.000Z" };

    expect(resolveQueryTimeRange(range, NOW)).toEqual(range);
    expect(resolveQueryTimeRange(undefined, NOW)).toBeUndefined();
  });
});

describe("query request building", () => {
  it("returns undefined without a query or data source", () => {
    expect(buildQueryRequest(createWidget({ dataSourceId: undefined }))).toBeUndefined();
    expect(buildQueryRequest(createWidget({ query: undefined }))).toBeUndefined();
  });

  it("moves the persisted range into an absolute request range", () => {
    const request = buildQueryRequest(createWidget(), { now: NOW });

    expect(request?.dataSourceId).toBe("ds-1");
    expect(request?.queryId).toBe("requests-over-time");
    expect(request?.timeRange).toEqual({
      from: "2026-11-11T12:00:00.000Z",
      to: "2026-11-12T12:00:00.000Z",
    });
    expect(request?.query).not.toHaveProperty("timeRange");
  });

  it("honors an absolute override", () => {
    const override = {
      from: "2026-02-01T00:00:00.000Z",
      to: "2026-02-02T00:00:00.000Z",
    };

    expect(buildQueryRequest(createWidget(), { timeRange: override })?.timeRange).toEqual(
      override,
    );
  });

  it("passes request parameters through", () => {
    const request = buildQueryRequest(createWidget(), {
      now: NOW,
      parameters: { tenant: "acme" },
    });

    expect(request?.parameters).toEqual({ tenant: "acme" });
  });
});

describe("query keys", () => {
  it("stays stable when object keys are reordered", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } })).toBe(
      stableStringify({ a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 }),
    );
    expect(stableStringify({ a: undefined, b: 1 })).toBe('{"b":1}');
  });

  it("keys on the persisted query, not the resolved window", () => {
    const widget = createWidget();
    const key = queryKeyFor(widget);

    expect(key).toEqual([
      "nama-dashboard-query",
      "ds-1",
      "requests-over-time",
      stableStringify(widget.query),
      null,
      null,
    ]);
    expect(queryKeyFor(widget)).toEqual(key);
  });

  it("includes parameters and an absolute override", () => {
    const key = queryKeyFor(createWidget(), {
      parameters: { tenant: "acme" },
      timeRange: { from: "2026-01-01T00:00:00.000Z", to: "2026-01-02T00:00:00.000Z" },
    });

    expect(key[4]).toBe('{"tenant":"acme"}');
    expect(key[5]).toBe("2026-01-01T00:00:00.000Z/2026-01-02T00:00:00.000Z");
  });
});
