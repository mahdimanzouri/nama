import { describe, expect, it } from "vitest";
import type {
  DashboardConfig,
  DashboardControlValues,
  DashboardWidget,
} from "@nama/dashboard-types";

import {
  buildControlledQueryRequest,
  defaultVariables,
  evaluateVisibilityCondition,
  isWidgetVisible,
  resolveControlValues,
  resolveDashboardFilters,
} from "../controls";

const NOW = new Date("2026-11-12T12:00:00.000Z");

function createConfig(
  overrides: Partial<Pick<DashboardConfig, "variables" | "filters">> = {},
): Pick<DashboardConfig, "variables" | "filters"> {
  return {
    variables: [
      {
        id: "0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b23",
        name: "machineId",
        type: "string",
        defaultValue: "machine-01",
        bindings: [{ target: "query.parameter", parameter: "machine" }],
      },
      {
        id: "0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b26",
        name: "window",
        type: "timeRange",
        defaultValue: {
          from: "2026-11-01T00:00:00.000Z",
          to: "2026-11-02T00:00:00.000Z",
        },
        bindings: [{ target: "query.timeRange", parameter: "range" }],
      },
      {
        id: "0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b27",
        name: "line",
        type: "string",
        defaultValue: "A",
        bindings: [{ target: "filter.value", parameter: "filter-line" }],
      },
    ],
    filters: [
      { id: "filter-line", field: "line", operator: "eq", value: "A" },
      { id: "filter-region", field: "region", operator: "eq", value: "eu" },
      { id: "filter-shift", field: "shift", operator: "eq", value: "day" },
    ],
    ...overrides,
  };
}

function createWidget(overrides: Partial<DashboardWidget> = {}): DashboardWidget {
  return {
    id: "widget-1",
    type: "line",
    configVersion: 1,
    title: "Output",
    dataSourceId: "ds-1",
    config: {},
    query: {
      queryId: "output",
      fields: ["timestamp", "line", "value"],
      timeRange: { mode: "relative", last: "24h" },
    },
    ...overrides,
  };
}

describe("control values", () => {
  it("starts from variable defaults", () => {
    expect(defaultVariables(createConfig())).toEqual({
      machineId: "machine-01",
      window: {
        from: "2026-11-01T00:00:00.000Z",
        to: "2026-11-02T00:00:00.000Z",
      },
      line: "A",
    });
  });

  it("keeps valid overrides and falls back on type mismatches", () => {
    const values = resolveControlValues(createConfig(), {
      variables: { machineId: "machine-02", line: 7, unknown: "ignored" },
    });

    expect(values.variables.machineId).toBe("machine-02");
    expect(values.variables.line).toBe("A");
    expect(values.variables).not.toHaveProperty("unknown");
  });

  it("ignores an invalid dashboard range", () => {
    const values = resolveControlValues(createConfig(), {
      timeRange: { from: "2026-11-02T00:00:00.000Z", to: "2026-11-01T00:00:00.000Z" },
    });

    expect(values.timeRange).toBeUndefined();
  });
});

describe("filter resolution", () => {
  it("substitutes variable-bound filter values by id", () => {
    const values: DashboardControlValues = {
      variables: { machineId: "m", window: undefined, line: "B" },
    };

    expect(
      resolveDashboardFilters(createConfig(), values).map((filter) => filter.value),
    ).toEqual(["B", "eu", "day"]);
  });

  it("can bind a filter by field name", () => {
    const config = createConfig({
      variables: [
        {
          id: "0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b28",
          name: "region",
          type: "string",
          defaultValue: "us",
          bindings: [{ target: "filter.value", parameter: "region" }],
        },
      ],
    });
    const values: DashboardControlValues = { variables: { region: "apac" } };

    expect(resolveDashboardFilters(config, values)[1]?.value).toBe("apac");
  });
});

describe("controlled query building", () => {
  it("resolves parameters, filter values and the bound range", () => {
    const values = {
      variables: { machineId: "machine-02", line: "B" },
    };

    const request = buildControlledQueryRequest(createWidget(), createConfig(), {
      now: NOW,
      variables: values.variables,
    });

    expect(request?.parameters).toEqual({ machine: "machine-02" });
    expect(request?.timeRange).toEqual({
      from: "2026-11-01T00:00:00.000Z",
      to: "2026-11-02T00:00:00.000Z",
    });
    expect(request?.query.filters).toEqual([
      { field: "line", operator: "eq", value: "B" },
    ]);
  });

  it("lets the dashboard range win over bindings and the persisted range", () => {
    const request = buildControlledQueryRequest(createWidget(), createConfig(), {
      now: NOW,
      timeRange: { mode: "relative", last: "1h" },
    });

    expect(request?.timeRange).toEqual({
      from: "2026-11-12T11:00:00.000Z",
      to: "2026-11-12T12:00:00.000Z",
    });
  });

  it("applies only filters whose field the query selects", () => {
    const request = buildControlledQueryRequest(createWidget(), createConfig(), {
      now: NOW,
    });

    expect(request?.query.filters?.map((filter) => filter.field)).toEqual(["line"]);
  });

  it("keeps query filters ahead of dashboard filters", () => {
    const widget = createWidget({
      query: {
        queryId: "output",
        fields: ["value"],
        filters: [{ field: "value", operator: "gt", value: 0 }],
      },
    });
    const config = createConfig({
      filters: [{ id: "f", field: "value", operator: "lt", value: 10 }],
      variables: [],
    });

    const request = buildControlledQueryRequest(widget, config, { now: NOW });

    expect(request?.query.filters).toEqual([
      { field: "value", operator: "gt", value: 0 },
      { field: "value", operator: "lt", value: 10 },
    ]);
  });
});

describe("visibility conditions", () => {
  it("evaluates bare variables, negation and comparisons", () => {
    const variables = { region: "eu", count: 5, enabled: true, empty: "" };

    expect(evaluateVisibilityCondition("region", variables)).toBe(true);
    expect(evaluateVisibilityCondition("empty", variables)).toBe(false);
    expect(evaluateVisibilityCondition("not enabled", variables)).toBe(false);
    expect(evaluateVisibilityCondition('region == "eu"', variables)).toBe(true);
    expect(evaluateVisibilityCondition('region != "us"', variables)).toBe(true);
    expect(evaluateVisibilityCondition("count >= 5", variables)).toBe(true);
    expect(evaluateVisibilityCondition("count < 5", variables)).toBe(false);
  });

  it("binds and more tightly than or", () => {
    const variables = { a: false, b: true, c: true };

    expect(evaluateVisibilityCondition("a and b or c", variables)).toBe(true);
    expect(evaluateVisibilityCondition("c or a and b", variables)).toBe(true);
    expect(evaluateVisibilityCondition("a and b", variables)).toBe(false);
  });

  it("treats missing variables as false and malformed input as visible", () => {
    expect(evaluateVisibilityCondition("missing", {})).toBe(false);
    expect(evaluateVisibilityCondition("missing == 1", {})).toBe(false);
    expect(evaluateVisibilityCondition("region ==", { region: "eu" })).toBe(true);
    expect(evaluateVisibilityCondition("region @@ eu", { region: "eu" })).toBe(true);
  });
});

describe("widget visibility", () => {
  it("combines the enabled flag with the condition", () => {
    const values: DashboardControlValues = { variables: { region: "eu" } };

    expect(isWidgetVisible({}, values)).toBe(true);
    expect(isWidgetVisible({ visibility: { enabled: false } }, values)).toBe(false);
    expect(
      isWidgetVisible(
        { visibility: { enabled: true, condition: 'region == "eu"' } },
        values,
      ),
    ).toBe(true);
    expect(
      isWidgetVisible(
        { visibility: { enabled: true, condition: 'region == "us"' } },
        values,
      ),
    ).toBe(false);
  });
});
