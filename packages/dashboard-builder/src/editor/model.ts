import {
  BREAKPOINT_COLUMNS,
  PLATFORM_LIMITS,
  createId,
  type Breakpoint,
  type DashboardConfig,
  type DashboardWidget,
  type LayoutItem,
} from "@nama/dashboard-types";
import { resolveLayoutItems } from "@nama/dashboard-core";

export const MIN_WIDGET_HEIGHT = 2;
export const MAX_WIDGET_HEIGHT = 24;

export interface WidgetDraftInput {
  type: string;
  title: string;
  config: Record<string, unknown>;
  defaultSize: { w: number; h: number };
  dataSourceId?: string;
  query?: DashboardWidget["query"];
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

export function findFreePosition(
  items: readonly LayoutItem[],
  columns: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const maxY = items.reduce((bottom, item) => Math.max(bottom, item.y + item.h), 0);

  for (let y = 0; y <= maxY; y += 1) {
    for (let x = 0; x + width <= columns; x += 1) {
      const candidate = { widgetId: "", x, y, w: width, h: height };
      if (!items.some((item) => overlaps(candidate, item))) return { x, y };
    }
  }

  return { x: 0, y: maxY };
}

/**
 * Replaces one breakpoint's items with the fully materialized set. Editing a
 * narrower breakpoint records every inherited position locally so that later
 * changes to wider layouts no longer move it.
 */
export function withBreakpointItems(
  config: DashboardConfig,
  breakpoint: Breakpoint,
  items: readonly LayoutItem[],
): DashboardConfig {
  const layout = config.layouts[breakpoint];

  return {
    ...config,
    layouts: {
      ...config.layouts,
      [breakpoint]: { ...layout, items: items.map((item) => ({ ...item })) },
    },
  };
}

/** The items an editor sees for a breakpoint, including inherited positions. */
export function editableItems(
  config: DashboardConfig,
  breakpoint: Breakpoint,
): LayoutItem[] {
  return resolveLayoutItems(config.layouts, breakpoint).map(
    ({ widgetId, x, y, w, h }) => ({ widgetId, x, y, w, h }),
  );
}

export function addWidgetToConfig(
  config: DashboardConfig,
  breakpoint: Breakpoint,
  widget: WidgetDraftInput,
): DashboardConfig {
  if (config.widgets.length >= PLATFORM_LIMITS.maxWidgets) return config;

  const columns = BREAKPOINT_COLUMNS[breakpoint];
  const width = clamp(widget.defaultSize.w, 1, columns);
  const height = clamp(widget.defaultSize.h, 1, MAX_WIDGET_HEIGHT);
  const items = editableItems(config, breakpoint);
  const position = findFreePosition(items, columns, width, height);
  const id = createId();
  const placed: DashboardWidget = {
    id,
    type: widget.type,
    configVersion: 1,
    title: widget.title,
    dataSourceId: widget.dataSourceId ?? "default",
    config: widget.config,
    ...(widget.query === undefined ? {} : { query: widget.query }),
  };

  return withBreakpointItems(
    { ...config, widgets: [...config.widgets, placed] },
    breakpoint,
    [...items, { widgetId: id, ...position, w: width, h: height }],
  );
}

export function removeWidgetFromConfig(
  config: DashboardConfig,
  widgetId: string,
): DashboardConfig {
  const layouts = { ...config.layouts };

  for (const breakpoint of Object.keys(layouts) as Breakpoint[]) {
    const layout = layouts[breakpoint];
    layouts[breakpoint] = {
      ...layout,
      items: layout.items.filter((item) => item.widgetId !== widgetId),
    };
  }

  return {
    ...config,
    widgets: config.widgets.filter((widget) => widget.id !== widgetId),
    layouts,
  };
}

export function setWidgetRect(
  config: DashboardConfig,
  breakpoint: Breakpoint,
  widgetId: string,
  rect: { x?: number; y?: number; w?: number; h?: number },
): DashboardConfig {
  const columns = BREAKPOINT_COLUMNS[breakpoint];
  const items = editableItems(config, breakpoint);
  const index = items.findIndex((item) => item.widgetId === widgetId);

  if (index === -1) return config;

  const current = items[index]!;
  const w = clamp(rect.w ?? current.w, 1, columns);
  const h = clamp(rect.h ?? current.h, MIN_WIDGET_HEIGHT, MAX_WIDGET_HEIGHT);
  const x = clamp(rect.x ?? current.x, 0, Math.max(columns - w, 0));
  const y = Math.max(rect.y ?? current.y, 0);
  const next = [...items];
  next[index] = { ...current, x, y, w, h };

  return withBreakpointItems(config, breakpoint, next);
}

/** Shares a data source id with the rest of the dashboard when one exists. */
export function defaultDataSourceId(config: DashboardConfig): string | undefined {
  return config.widgets[0]?.dataSourceId;
}

export function updateWidgetInConfig(
  config: DashboardConfig,
  widgetId: string,
  patch: { title?: string; config?: unknown; query?: DashboardWidget["query"] },
): DashboardConfig {
  return {
    ...config,
    widgets: config.widgets.map((widget) =>
      widget.id === widgetId ? ({ ...widget, ...patch } as DashboardWidget) : widget,
    ),
  };
}

export function updateMetadataInConfig(
  config: DashboardConfig,
  patch: { title?: string },
): DashboardConfig {
  return {
    ...config,
    metadata: { ...config.metadata, ...patch },
  };
}

/** RGL layout entries map 1:1 onto persisted items. */
export function fromGridLayout(
  layout: readonly { i: string; x: number; y: number; w: number; h: number }[],
): LayoutItem[] {
  return layout.map(({ i, x, y, w, h }) => ({ widgetId: i, x, y, w, h }));
}

export function toGridLayout(items: readonly LayoutItem[]) {
  return items.map(({ widgetId, x, y, w, h }) => ({ i: widgetId, x, y, w, h }));
}
