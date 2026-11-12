import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createDashboardI18n, createThemeTokens } from "@nama/dashboard-core";
import type { QueryResult } from "@nama/dashboard-types";

import {
  cartesianConfigSchema,
  gaugeConfigSchema,
  kpiConfigSchema,
  kpiWidget,
  NAMA_WIDGETS,
  tableConfigSchema,
  tableWidget,
} from "../widgets";
import {
  buildBarOption,
  buildGaugeOption,
  buildLineOption,
  buildPieOption,
} from "../widgets/chart-options";
import { latestValue, toSeries, type ChartColors } from "../widgets/chart-data";

const COLORS: ChartColors = {
  text: "#111111",
  muted: "#666666",
  border: "#dddddd",
  surface: "#ffffff",
  accent: "#0000ff",
  danger: "#ff0000",
  warning: "#ff9900",
  success: "#009900",
};

const CONTEXT = {
  colors: COLORS,
  animation: false,
  formatValue: (value: number) => value.toFixed(1),
};

const LOCALE = createDashboardI18n({ locale: "en", warn: () => {} });
const THEME = createThemeTokens();

function result(columns: QueryResult["columns"], rows: QueryResult["rows"]): QueryResult {
  return {
    queryId: "test",
    columns,
    rows,
    timestamp: "2026-11-12T10:00:00.000Z",
    meta: {
      rowCount: rows.length,
      truncated: false,
      executionTimeMs: 1,
      cached: false,
    },
  };
}

const SERIES_RESULT = result(
  [
    { name: "timestamp", type: "timestamp" },
    { name: "value", type: "number" },
  ],
  [
    { timestamp: "2026-11-12T08:00:00.000Z", value: 120 },
    { timestamp: "2026-11-12T09:00:00.000Z", value: 150 },
  ],
);

const WIDGET = {
  id: "0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b21",
  type: "kpi",
  configVersion: 1,
  title: "Units",
  config: {},
};

describe("built-in widget configuration", () => {
  it("applies defaults to legacy M4 configurations", () => {
    expect(cartesianConfigSchema.parse({ seriesLabel: "Output" })).toEqual({
      seriesLabel: "Output",
      smooth: false,
      area: false,
    });
    expect(kpiConfigSchema.parse({ label: "Units" })).toEqual({ label: "Units" });
    expect(tableConfigSchema.parse({})).toEqual({ maxRows: 25 });
  });

  it("rejects a gauge range that cannot be drawn", () => {
    expect(gaugeConfigSchema.safeParse({ min: 10, max: 5 }).success).toBe(false);
  });

  it("rejects a blank series label before it reaches the draft", () => {
    expect(cartesianConfigSchema.safeParse({ seriesLabel: "" }).success).toBe(false);
  });

  it("registers every built-in with a valid default configuration", () => {
    const ids = NAMA_WIDGETS.map((plugin) => plugin.manifest.id);
    expect(ids).toEqual(["kpi", "line", "area", "bar", "pie", "gauge", "table"]);

    for (const plugin of NAMA_WIDGETS) {
      expect(plugin.configSchema.safeParse(plugin.defaultConfig).success).toBe(true);
    }
  });
});

describe("chart option builders", () => {
  it("builds a line series without an area fill", () => {
    const option = buildLineOption(
      { labels: ["a", "b"], values: [1, 2], seriesName: "Output" },
      CONTEXT,
    );
    const series = option.series as Array<Record<string, unknown>>;

    expect(series[0]?.type).toBe("line");
    expect(series[0]?.data).toEqual([1, 2]);
    expect(series[0]?.areaStyle).toBeUndefined();
  });

  it("fills the area and disables animation when asked", () => {
    const option = buildLineOption(
      { labels: ["a"], values: [1], seriesName: "Output", area: true },
      CONTEXT,
    );
    const series = option.series as Array<Record<string, unknown>>;

    expect(series[0]?.areaStyle).toBeDefined();
    expect(option.animation).toBe(false);
  });

  it("builds bars and pie slices from the same series data", () => {
    const bar = buildBarOption(
      { labels: ["a"], values: [7], seriesName: "Output" },
      CONTEXT,
    );
    expect((bar.series as Array<Record<string, unknown>>)[0]?.type).toBe("bar");

    const pie = buildPieOption({ points: [{ label: "a", value: 7 }] }, CONTEXT);
    const pieSeries = pie.series as Array<Record<string, unknown>>;

    expect(pieSeries[0]?.data).toEqual([{ name: "a", value: 7 }]);
    expect(pieSeries[0]?.radius).toEqual(["38%", "68%"]);
  });

  it("renders tooltips as canvas text rather than HTML", () => {
    const option = buildLineOption(
      { labels: ["a"], values: [1], seriesName: "Output" },
      CONTEXT,
    );

    expect((option.tooltip as Record<string, unknown>).renderMode).toBe("richText");
  });

  it("formats the gauge value with its unit", () => {
    const option = buildGaugeOption(
      { value: 120, min: 0, max: 200, name: "", unit: "rpm" },
      CONTEXT,
    );
    const series = option.series as Array<Record<string, unknown>>;
    const detail = series[0]?.detail as { formatter: string };

    expect(series[0]?.min).toBe(0);
    expect(detail.formatter).toBe("120.0 rpm");
  });
});

describe("series projection", () => {
  it("uses the timestamp column as category and the value column as number", () => {
    const points = toSeries(SERIES_RESULT);

    expect(points).toHaveLength(2);
    expect(points[1]?.value).toBe(150);
    expect(latestValue(SERIES_RESULT, undefined)).toBe(150);
  });

  it("honours explicit field names", () => {
    const points = toSeries(SERIES_RESULT, {
      xField: "timestamp",
      yField: "value",
    });

    expect(points.map((point) => point.value)).toEqual([120, 150]);
  });
});

describe("built-in widget rendering", () => {
  it("renders a KPI value with its unit", () => {
    const html = renderToStaticMarkup(
      <kpiWidget.component
        widget={WIDGET}
        config={{ label: "Output", unit: "pcs" }}
        data={{
          status: "ready",
          result: result([{ name: "value", type: "number" }], [{ value: 1234.5 }]),
          lastUpdated: "2026-11-12T10:00:00.000Z",
        }}
        locale={LOCALE}
        theme={THEME}
        width={300}
        height={200}
        filters={{}}
      />,
    );

    expect(html).toContain("Output");
    expect(html).toContain("1,234.5");
    expect(html).toContain("pcs");
  });

  it("renders a table with formatted cells", () => {
    const html = renderToStaticMarkup(
      <tableWidget.component
        widget={{ ...WIDGET, type: "table", title: "Recent metrics" }}
        config={{ maxRows: 25 }}
        data={{
          status: "ready",
          result: SERIES_RESULT,
          lastUpdated: "2026-11-12T10:00:00.000Z",
        }}
        locale={LOCALE}
        theme={THEME}
        width={400}
        height={300}
        filters={{}}
      />,
    );

    expect(html).toContain("Recent metrics");
    expect(html).toContain(">value<");
    expect(html).toContain("150");
  });
});
