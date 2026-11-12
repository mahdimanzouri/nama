import type { DashboardConfig } from "../dashboard";
import type { DashboardWidget } from "../widget";

export const KPI_WIDGET_ID = "0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b21";
export const LINE_WIDGET_ID = "0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b22";
export const VARIABLE_ID = "0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b23";
export const FILTER_ID = "0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b24";

/** UUIDv7 shaped ids for generated fixtures; index must stay below 0x1000. */
export function generatedId(index: number): string {
  return `0192f4c2-7a1e-7cc3-9a0e-${index.toString(16).padStart(12, "0")}`;
}

export function cloneConfig(config: DashboardConfig): DashboardConfig {
  return structuredClone(config);
}

export function must<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`missing fixture value: ${label}`);
  return value;
}

/** The KPI and line examples from `docs/architecture/dashboard-schema.md`. */
export function createValidConfig(): DashboardConfig {
  return {
    schemaVersion: 1,
    metadata: {
      title: "Production overview",
      description: "Factory line output",
      tags: ["production"],
    },
    settings: {
      refreshInterval: 60,
      timezone: "Asia/Tehran",
    },
    variables: [
      {
        id: VARIABLE_ID,
        name: "machineId",
        type: "string",
        defaultValue: "machine-01",
        bindings: [{ target: "query.parameter", parameter: "machineId" }],
      },
    ],
    filters: [
      {
        id: FILTER_ID,
        field: "line",
        operator: "eq",
        value: "A",
      },
    ],
    layouts: {
      desktop: {
        columns: 12,
        rowHeight: 40,
        gap: 8,
        items: [
          { widgetId: KPI_WIDGET_ID, x: 0, y: 0, w: 3, h: 4 },
          { widgetId: LINE_WIDGET_ID, x: 3, y: 0, w: 9, h: 8 },
        ],
      },
      tablet: { columns: 8, rowHeight: 40, gap: 8, items: [] },
      mobile: { columns: 4, rowHeight: 40, gap: 8, items: [] },
    },
    widgets: [
      {
        id: KPI_WIDGET_ID,
        type: "kpi",
        configVersion: 1,
        title: "Production today",
        dataSourceId: "factory-01",
        query: { queryId: "production-output", fields: ["production"], limit: 1 },
        config: {
          valueField: "production",
          label: "Units produced",
          format: { style: "decimal", maximumFractionDigits: 0 },
          comparison: { mode: "previousPeriod" },
          thresholds: [
            { value: 1000, tone: "warning" },
            { value: 800, tone: "danger" },
          ],
        },
      },
      {
        id: LINE_WIDGET_ID,
        type: "line",
        configVersion: 1,
        title: "Output trend",
        dataSourceId: "factory-01",
        query: {
          queryId: "production-timeseries",
          fields: ["timestamp", "production"],
          timeRange: { mode: "relative", last: "24h" },
        },
        config: {
          xField: "timestamp",
          series: [{ field: "production", label: "Production" }],
          smooth: true,
          showLegend: true,
        },
      },
    ],
  };
}

export function createWidget(index: number): DashboardWidget {
  return {
    id: generatedId(index),
    type: "kpi",
    configVersion: 1,
    title: `Widget ${index}`,
    config: { valueField: "value" },
  };
}

/** A configuration whose widgets are all positioned on the desktop grid. */
export function createConfigWithWidgets(count: number): DashboardConfig {
  const widgets = Array.from({ length: count }, (_, index) => createWidget(index));

  return {
    schemaVersion: 1,
    metadata: { title: "Wide dashboard" },
    settings: { refreshInterval: 60 },
    variables: [],
    filters: [],
    layouts: {
      desktop: {
        columns: 12,
        rowHeight: 40,
        gap: 8,
        items: widgets.map((widget, index) => ({
          widgetId: widget.id,
          x: 0,
          y: index,
          w: 1,
          h: 1,
        })),
      },
      tablet: { columns: 8, rowHeight: 40, gap: 8, items: [] },
      mobile: { columns: 4, rowHeight: 40, gap: 8, items: [] },
    },
    widgets,
  };
}
