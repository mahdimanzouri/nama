import {
  BREAKPOINT_COLUMNS,
  DEFAULT_GAP,
  DEFAULT_ROW_HEIGHT,
  SCHEMA_VERSION,
  createId,
  type DashboardConfig,
  type DashboardFilter,
  type DashboardVariable,
  type DashboardWidget,
  type LayoutItem,
  type QueryDefinition,
} from "@nama/dashboard-types";

/**
 * Matches the static connector the API always serves, so template widgets
 * render immediately. Hosts with a real catalog supply their own templates.
 */
const DEMO_DATA_SOURCE_ID = "demo-source";
const LAST_DAY = { mode: "relative", last: "24h" } as const;

const AGGREGATE: QueryDefinition = {
  queryId: "template-aggregate",
  dataset: "metrics",
  fields: ["value"],
  aggregations: [{ field: "value", fn: "avg" }],
  timeRange: LAST_DAY,
};

const TREND: QueryDefinition = {
  queryId: "template-trend",
  dataset: "metrics",
  fields: ["timestamp", "value"],
  orderBy: [{ field: "timestamp", direction: "asc" }],
  limit: 300,
  timeRange: LAST_DAY,
};

const BARS: QueryDefinition = {
  ...TREND,
  queryId: "template-bars",
  limit: 60,
};

const RECENT: QueryDefinition = {
  queryId: "template-recent",
  dataset: "metrics",
  fields: ["timestamp", "value"],
  orderBy: [{ field: "timestamp", direction: "desc" }],
  limit: 8,
  timeRange: LAST_DAY,
};

const TABLE: QueryDefinition = {
  ...RECENT,
  queryId: "template-table",
  limit: 50,
};

/** `[x, y, w, h]` per breakpoint; narrower layouts are authored, not inherited. */
type Placement = readonly [number, number, number, number];

interface WidgetSeed {
  type: string;
  title: string;
  config: Record<string, unknown>;
  query: QueryDefinition;
  visibility?: DashboardWidget["visibility"];
  interaction?: DashboardWidget["interaction"];
  desktop: Placement;
  tablet: Placement;
  mobile: Placement;
}

interface TemplateSeed {
  id: string;
  name: string;
  description: string;
  variables: readonly Omit<DashboardVariable, "id">[];
  filters: readonly Omit<DashboardFilter, "id">[];
  widgets: readonly WidgetSeed[];
}

const CONTROL_VARIABLES: readonly Omit<DashboardVariable, "id">[] = [
  {
    name: "minValue",
    type: "number",
    defaultValue: 0,
    bindings: [{ target: "filter.value", parameter: "value" }],
  },
  {
    name: "focus",
    type: "string",
    defaultValue: "",
    bindings: [{ target: "filter.value", parameter: "timestamp" }],
  },
];

const CONTROL_FILTERS: readonly Omit<DashboardFilter, "id">[] = [
  { field: "value", operator: "gte", value: 0 },
  // `contains ""` matches every timestamp, so the filter is inert until a
  // chart click writes a selection into `focus`.
  { field: "timestamp", operator: "contains", value: "" },
];

const TEMPLATE_SEEDS: readonly TemplateSeed[] = [
  {
    id: "operations",
    name: "Operations overview",
    description:
      "KPI row, trend, recent samples and a category bar chart. Selecting a bar narrows the dashboard to that sample.",
    variables: CONTROL_VARIABLES,
    filters: CONTROL_FILTERS,
    widgets: [
      {
        type: "kpi",
        title: "Average value",
        config: { label: "Average value", valueField: "value" },
        query: AGGREGATE,
        desktop: [0, 0, 3, 5],
        tablet: [0, 0, 2, 5],
        mobile: [0, 0, 4, 4],
      },
      {
        type: "kpi",
        title: "Latest value",
        config: { label: "Latest value", valueField: "value" },
        query: TREND,
        desktop: [3, 0, 3, 5],
        tablet: [2, 0, 2, 5],
        mobile: [0, 4, 4, 4],
      },
      {
        type: "gauge",
        title: "Current level",
        config: { min: 0, max: 200, valueField: "value" },
        query: AGGREGATE,
        desktop: [6, 0, 3, 5],
        tablet: [4, 0, 2, 5],
        mobile: [0, 8, 4, 5],
      },
      {
        type: "kpi",
        title: "Selected sample",
        config: { label: "Selected sample", valueField: "value" },
        query: AGGREGATE,
        visibility: { enabled: true, condition: 'focus != ""' },
        desktop: [9, 0, 3, 5],
        tablet: [6, 0, 2, 5],
        mobile: [0, 13, 4, 4],
      },
      {
        type: "line",
        title: "Trend",
        config: {
          seriesLabel: "Value",
          xField: "timestamp",
          yField: "value",
          smooth: false,
        },
        query: TREND,
        interaction: { variable: "focus" },
        desktop: [0, 5, 8, 8],
        tablet: [0, 5, 5, 8],
        mobile: [0, 17, 4, 8],
      },
      {
        type: "table",
        title: "Recent samples",
        config: { maxRows: 25 },
        query: TABLE,
        desktop: [8, 5, 4, 8],
        tablet: [5, 5, 3, 8],
        mobile: [0, 25, 4, 8],
      },
      {
        type: "bar",
        title: "Sample values",
        config: { seriesLabel: "Value", xField: "timestamp", yField: "value" },
        query: BARS,
        interaction: { variable: "focus" },
        desktop: [0, 13, 12, 7],
        tablet: [0, 13, 8, 7],
        mobile: [0, 33, 4, 7],
      },
    ],
  },
  {
    id: "trend-analysis",
    name: "Trend analysis",
    description:
      "Trend and smoothed trend charts with a recent-sample breakdown. Clicking a series filters the table and reveals the selected sample.",
    variables: CONTROL_VARIABLES,
    filters: CONTROL_FILTERS,
    widgets: [
      {
        type: "line",
        title: "Trend",
        config: {
          seriesLabel: "Value",
          xField: "timestamp",
          yField: "value",
          smooth: false,
        },
        query: TREND,
        interaction: { variable: "focus" },
        desktop: [0, 0, 8, 9],
        tablet: [0, 0, 8, 9],
        mobile: [0, 0, 4, 8],
      },
      {
        type: "area",
        title: "Smoothed trend",
        config: {
          seriesLabel: "Value",
          xField: "timestamp",
          yField: "value",
          smooth: true,
          area: true,
        },
        query: TREND,
        desktop: [8, 0, 4, 9],
        tablet: [0, 9, 8, 8],
        mobile: [0, 8, 4, 8],
      },
      {
        type: "pie",
        title: "Recent samples",
        config: { labelField: "timestamp", valueField: "value", donut: true },
        query: RECENT,
        visibility: { enabled: true, condition: 'focus == ""' },
        desktop: [0, 9, 4, 8],
        tablet: [0, 17, 4, 8],
        mobile: [0, 16, 4, 8],
      },
      {
        type: "table",
        title: "Samples",
        config: { maxRows: 50 },
        query: TABLE,
        desktop: [4, 9, 8, 8],
        tablet: [4, 17, 4, 8],
        mobile: [0, 24, 4, 8],
      },
      {
        type: "kpi",
        title: "Selected sample",
        config: { label: "Selected sample", valueField: "value" },
        query: AGGREGATE,
        visibility: { enabled: true, condition: 'focus != ""' },
        desktop: [0, 17, 4, 5],
        tablet: [0, 25, 8, 5],
        mobile: [0, 32, 4, 4],
      },
      {
        type: "bar",
        title: "Distribution",
        config: { seriesLabel: "Value", xField: "timestamp", yField: "value" },
        query: BARS,
        interaction: { variable: "focus" },
        desktop: [4, 17, 8, 7],
        tablet: [0, 30, 8, 7],
        mobile: [0, 36, 4, 7],
      },
    ],
  },
];

function placementFor(id: string, placement: Placement): LayoutItem {
  const [x, y, w, h] = placement;
  return { widgetId: id, x, y, w, h };
}

function buildConfig(seed: TemplateSeed, title: string): DashboardConfig {
  const ids = seed.widgets.map(() => createId());

  const widgets: DashboardWidget[] = seed.widgets.map((widget, index) => ({
    id: ids[index] as string,
    type: widget.type,
    configVersion: 1,
    title: widget.title,
    dataSourceId: DEMO_DATA_SOURCE_ID,
    config: widget.config,
    query: widget.query,
    ...(widget.visibility === undefined ? {} : { visibility: widget.visibility }),
    ...(widget.interaction === undefined ? {} : { interaction: widget.interaction }),
  }));

  const layoutsFor = (breakpoint: keyof typeof BREAKPOINT_COLUMNS) => ({
    columns: BREAKPOINT_COLUMNS[breakpoint],
    rowHeight: DEFAULT_ROW_HEIGHT,
    gap: DEFAULT_GAP,
    items: seed.widgets.map((widget, index) =>
      placementFor(ids[index] as string, widget[breakpoint]),
    ),
  });

  return {
    schemaVersion: SCHEMA_VERSION,
    metadata: { title, description: seed.description },
    settings: { refreshInterval: 30 },
    variables: seed.variables.map((variable) => ({ ...variable, id: createId() })),
    filters: seed.filters.map((filter) => ({ ...filter, id: createId() })),
    layouts: {
      desktop: layoutsFor("desktop"),
      tablet: layoutsFor("tablet"),
      mobile: layoutsFor("mobile"),
    },
    widgets,
  };
}

export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  create: (title: string) => DashboardConfig;
}

export const DASHBOARD_TEMPLATES: readonly DashboardTemplate[] = TEMPLATE_SEEDS.map(
  (seed) => ({
    id: seed.id,
    name: seed.name,
    description: seed.description,
    create: (title: string) => buildConfig(seed, title),
  }),
);

export function findTemplate(id: string): DashboardTemplate | undefined {
  return DASHBOARD_TEMPLATES.find((template) => template.id === id);
}
