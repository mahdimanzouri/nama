import { createElement as h } from "react";
import { DashboardProvider, DashboardViewer } from "@nama/dashboard-builder";
import { defineWidget } from "@nama/dashboard-builder/plugins";
import { z } from "zod";

const KPI_WIDGET_ID = "0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a2b01";

const kpiPlugin = defineWidget({
  manifest: { id: "@example/kpi", version: "1.0.0", name: "KPI" },
  configVersion: 1,
  configSchema: z.object({ label: z.string() }),
  defaultConfig: { label: "Units produced" },
  defaultSize: { w: 3, h: 4 },
  component: ({ config, data }) =>
    h("strong", { "data-status": data.status }, config.label),
});

export const config = {
  schemaVersion: 1,
  metadata: { title: "Standalone dashboard" },
  settings: { refreshInterval: 0 },
  variables: [],
  filters: [],
  layouts: {
    desktop: {
      columns: 12,
      rowHeight: 40,
      gap: 8,
      items: [{ widgetId: KPI_WIDGET_ID, x: 0, y: 0, w: 3, h: 4 }],
    },
    tablet: { columns: 8, rowHeight: 40, gap: 8, items: [] },
    mobile: { columns: 4, rowHeight: 40, gap: 8, items: [] },
  },
  widgets: [
    {
      id: KPI_WIDGET_ID,
      type: "@example/kpi",
      configVersion: 1,
      title: "Production today",
      dataSourceId: "factory-01",
      query: { queryId: "production-output", fields: ["production"], limit: 1 },
      config: { label: "Units produced" },
    },
  ],
};

export const dataAdapter = {
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

export function renderDashboard() {
  return h(
    DashboardProvider,
    {
      config,
      locale: "en",
      direction: "ltr",
      theme: "light",
      dataAdapter,
      widgets: [kpiPlugin],
    },
    h(DashboardViewer),
  );
}
