import {
  BREAKPOINT_COLUMNS,
  DEFAULT_GAP,
  DEFAULT_ROW_HEIGHT,
  PLATFORM_LIMITS,
  SCHEMA_VERSION,
  createId,
  type Breakpoint,
  type DashboardConfig,
  type DashboardWidget,
  type LayoutItem,
  type QueryDefinition,
} from "@nama/dashboard-types";

/** Matches the seeded data source served by the API walking skeleton. */
export const DEMO_DATA_SOURCE_ID = "demo-source";

export const MIN_WIDGET_HEIGHT = 2;
export const MAX_WIDGET_HEIGHT = 24;

export interface WidgetSize {
  w: number;
  h: number;
}

export type WidgetPreset = "kpi" | "line";

function emptyLayout<B extends Breakpoint>(breakpoint: B) {
  return {
    columns: BREAKPOINT_COLUMNS[breakpoint],
    rowHeight: DEFAULT_ROW_HEIGHT,
    gap: DEFAULT_GAP,
    items: [] as LayoutItem[],
  };
}

export function createEmptyConfig(title: string): DashboardConfig {
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

function kpiQuery(): QueryDefinition {
  return {
    queryId: "kpi-avg",
    dataset: "metrics",
    fields: ["value"],
    aggregations: [{ field: "value", fn: "avg" }],
    timeRange: { mode: "relative", last: "24h" },
  };
}

function lineQuery(): QueryDefinition {
  return {
    queryId: "line-trend",
    dataset: "metrics",
    fields: ["timestamp", "value"],
    orderBy: [{ field: "timestamp", direction: "asc" }],
    limit: 240,
    timeRange: { mode: "relative", last: "24h" },
  };
}

/**
 * Builds a demo widget for the editor. Identical queries share a TanStack cache
 * entry, so adding two KPIs fetches the average once.
 */
export function createWidget(preset: WidgetPreset): {
  widget: DashboardWidget;
  size: WidgetSize;
} {
  if (preset === "kpi") {
    return {
      widget: {
        id: createId(),
        type: "kpi",
        configVersion: 1,
        title: "Average throughput",
        dataSourceId: DEMO_DATA_SOURCE_ID,
        config: { label: "Average throughput" },
        query: kpiQuery(),
      },
      size: { w: 3, h: 5 },
    };
  }

  return {
    widget: {
      id: createId(),
      type: "line",
      configVersion: 1,
      title: "Throughput trend",
      dataSourceId: DEMO_DATA_SOURCE_ID,
      config: { seriesLabel: "Throughput" },
      query: lineQuery(),
    },
    size: { w: 9, h: 5 },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function overlaps(item: LayoutItem, other: LayoutItem): boolean {
  return (
    item.x < other.x + other.w &&
    other.x < item.x + item.w &&
    item.y < other.y + other.h &&
    other.y < item.y + item.h
  );
}

/** First-fit packing on the desktop grid; widths are clamped to the columns. */
function findFreePosition(
  items: readonly LayoutItem[],
  columns: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const maxY = items.reduce((bottom, item) => Math.max(bottom, item.y + item.h), 0);

  for (let y = 0; y <= maxY; y += 1) {
    for (let x = 0; x + width <= columns; x += 1) {
      if (
        !items.some((item) => overlaps({ x, y, w: width, h: height, widgetId: "" }, item))
      ) {
        return { x, y };
      }
    }
  }

  return { x: 0, y: maxY };
}

export function addWidgetToConfig(
  config: DashboardConfig,
  widget: DashboardWidget,
  size: WidgetSize,
): DashboardConfig {
  if (config.widgets.length >= PLATFORM_LIMITS.maxWidgets) return config;

  const desktop = config.layouts.desktop;
  const width = clamp(size.w, 1, desktop.columns);
  const height = clamp(size.h, 1, MAX_WIDGET_HEIGHT);
  const position = findFreePosition(desktop.items, desktop.columns, width, height);

  return {
    ...config,
    widgets: [...config.widgets, widget],
    layouts: {
      ...config.layouts,
      desktop: {
        ...desktop,
        items: [
          ...desktop.items,
          { widgetId: widget.id, ...position, w: width, h: height },
        ],
      },
    },
  };
}

function withoutItem(layout: DashboardConfig["layouts"]["desktop"], widgetId: string) {
  return { ...layout, items: layout.items.filter((item) => item.widgetId !== widgetId) };
}

export function removeWidgetFromConfig(
  config: DashboardConfig,
  widgetId: string,
): DashboardConfig {
  return {
    ...config,
    widgets: config.widgets.filter((widget) => widget.id !== widgetId),
    layouts: {
      desktop: withoutItem(config.layouts.desktop, widgetId),
      tablet: withoutItem(config.layouts.tablet, widgetId),
      mobile: withoutItem(config.layouts.mobile, widgetId),
    },
  };
}

/**
 * Editing always targets the desktop layout. Tablet and mobile keep no local
 * items, so they inherit the desktop positions and clamp to their own columns.
 */
export function moveWidgetInConfig(
  config: DashboardConfig,
  widgetId: string,
  dx: number,
  dy: number,
): DashboardConfig {
  const desktop = config.layouts.desktop;
  const items = desktop.items.map((item) => {
    if (item.widgetId !== widgetId) return item;

    return {
      ...item,
      x: clamp(item.x + dx, 0, Math.max(desktop.columns - item.w, 0)),
      y: Math.max(item.y + dy, 0),
    };
  });

  return { ...config, layouts: { ...config.layouts, desktop: { ...desktop, items } } };
}

export function resizeWidgetInConfig(
  config: DashboardConfig,
  widgetId: string,
  dw: number,
  dh: number,
): DashboardConfig {
  const desktop = config.layouts.desktop;
  const items = desktop.items.map((item) => {
    if (item.widgetId !== widgetId) return item;

    return {
      ...item,
      w: clamp(item.w + dw, 1, Math.max(desktop.columns - item.x, 1)),
      h: clamp(item.h + dh, MIN_WIDGET_HEIGHT, MAX_WIDGET_HEIGHT),
    };
  });

  return { ...config, layouts: { ...config.layouts, desktop: { ...desktop, items } } };
}

export function desktopItemFor(
  config: DashboardConfig,
  widgetId: string,
): LayoutItem | undefined {
  return config.layouts.desktop.items.find((item) => item.widgetId === widgetId);
}
