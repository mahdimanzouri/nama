import type {
  DashboardConfig,
  DashboardWidget,
  DataAdapter,
} from "@nama/dashboard-types";

export const KPI_WIDGET_ID = "0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b21";
export const UNKNOWN_WIDGET_ID = "0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b25";

export function createKpiWidget(
  overrides: Partial<DashboardWidget> = {},
): DashboardWidget {
  return {
    id: KPI_WIDGET_ID,
    type: "kpi",
    configVersion: 1,
    title: "Production today",
    dataSourceId: "factory-01",
    query: { queryId: "production-output", fields: ["production"], limit: 1 },
    config: { label: "Units produced" },
    ...overrides,
  };
}

export function createUnknownWidget(): DashboardWidget {
  return {
    id: UNKNOWN_WIDGET_ID,
    type: "@acme/missing",
    configVersion: 1,
    title: "Mystery panel",
    config: {},
  };
}

export function createConfig(
  widgets: DashboardWidget[] = [createKpiWidget()],
): DashboardConfig {
  return {
    schemaVersion: 1,
    metadata: { title: "Factory dashboard" },
    settings: { refreshInterval: 0 },
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
          y: index * 4,
          w: 4,
          h: 4,
        })),
      },
      tablet: { columns: 8, rowHeight: 40, gap: 8, items: [] },
      mobile: { columns: 4, rowHeight: 40, gap: 8, items: [] },
    },
    widgets,
  };
}

/** Answers every query with one row so SSR tests do not need a backend. */
export const staticAdapter: DataAdapter = {
  async execute(request) {
    return {
      queryId: request.queryId,
      columns: [{ name: "production", type: "number" }],
      rows: [{ production: 1200 }],
      timestamp: "2026-11-12T10:00:00.000Z",
      meta: { rowCount: 1, truncated: false, executionTimeMs: 1, cached: false },
    };
  },
};
