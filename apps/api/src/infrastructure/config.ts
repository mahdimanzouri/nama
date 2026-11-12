import {
  BREAKPOINT_COLUMNS,
  DEFAULT_GAP,
  DEFAULT_ROW_HEIGHT,
  SCHEMA_VERSION,
  type Breakpoint,
  type DashboardConfig,
} from "@nama/dashboard-types";

function emptyLayout<B extends Breakpoint>(breakpoint: B) {
  return {
    columns: BREAKPOINT_COLUMNS[breakpoint],
    rowHeight: DEFAULT_ROW_HEIGHT,
    gap: DEFAULT_GAP,
    items: [],
  };
}

export function createEmptyDashboardConfig(title: string): DashboardConfig {
  return {
    schemaVersion: SCHEMA_VERSION,
    metadata: { title },
    settings: { refreshInterval: 30 },
    variables: [],
    filters: [],
    layouts: {
      desktop: emptyLayout("desktop"),
      tablet: emptyLayout("tablet"),
      mobile: emptyLayout("mobile"),
    },
    widgets: [],
  };
}

export function nowIso(now: () => Date): string {
  return now().toISOString();
}
