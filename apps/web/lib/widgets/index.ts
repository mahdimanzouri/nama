import { NAMA_WIDGETS } from "@nama/dashboard-builder/widgets";
import type { ErasedWidgetPlugin } from "@nama/dashboard-builder";
import type { QueryDefinition } from "@nama/dashboard-types";

/** Matches the seeded data source served by the API walking skeleton. */
const DEMO_DATA_SOURCE_ID = "demo-source";
const LAST_DAY = { mode: "relative", last: "24h" } as const;

const AGGREGATE: QueryDefinition = {
  queryId: "demo-aggregate",
  dataset: "metrics",
  fields: ["value"],
  aggregations: [{ field: "value", fn: "avg" }],
  timeRange: LAST_DAY,
};

const TREND: QueryDefinition = {
  queryId: "demo-trend",
  dataset: "metrics",
  fields: ["timestamp", "value"],
  orderBy: [{ field: "timestamp", direction: "asc" }],
  limit: 300,
  timeRange: LAST_DAY,
};

const BARS: QueryDefinition = {
  ...TREND,
  queryId: "demo-bars",
  limit: 60,
};

const RECENT: QueryDefinition = {
  queryId: "demo-recent",
  dataset: "metrics",
  fields: ["timestamp", "value"],
  orderBy: [{ field: "timestamp", direction: "desc" }],
  limit: 8,
  timeRange: LAST_DAY,
};

const TABLE: QueryDefinition = {
  queryId: "demo-table",
  dataset: "metrics",
  fields: ["timestamp", "value"],
  orderBy: [{ field: "timestamp", direction: "desc" }],
  limit: 50,
  timeRange: LAST_DAY,
};

/**
 * The SDK built-ins are host-agnostic. This demo app binds them to the seeded
 * `demo-source`; a real host resolves defaults from its own data catalog.
 */
const DEMO_QUERIES: Readonly<Record<string, QueryDefinition>> = {
  kpi: AGGREGATE,
  gauge: AGGREGATE,
  line: TREND,
  area: TREND,
  bar: BARS,
  pie: RECENT,
  table: TABLE,
};

function withDemoData(plugin: ErasedWidgetPlugin): ErasedWidgetPlugin {
  const defaultQuery = DEMO_QUERIES[plugin.manifest.id];
  if (!defaultQuery) return plugin;

  return { ...plugin, defaultDataSourceId: DEMO_DATA_SOURCE_ID, defaultQuery };
}

/** Module-level constant so the provider does not rebuild its registry. */
export const WEB_WIDGETS: readonly ErasedWidgetPlugin[] = NAMA_WIDGETS.map(withDemoData);
