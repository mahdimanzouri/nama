import {
  queryRequestSchema,
  type DashboardWidget,
  type QueryRequest,
  type QueryTimeRange,
  type TimeRange,
} from "@nama/dashboard-types";

const UNIT_MS = { m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

const RELATIVE_PATTERN = /^([1-9]\d*)(m|h|d)$/u;

/**
 * Relative ranges are resolved when the query executes, against the clock at
 * that moment. Storage keeps the relative spec so cache keys stay stable.
 */
export function resolveQueryTimeRange(
  range: QueryTimeRange | undefined,
  now: Date,
): TimeRange | undefined {
  if (!range) return undefined;
  if (!("last" in range)) return { from: range.from, to: range.to };

  const match = RELATIVE_PATTERN.exec(range.last);
  if (!match) return undefined;

  const amount = Number(match[1]);
  const unit = match[2] as keyof typeof UNIT_MS;
  const to = now.getTime();

  return {
    from: new Date(to - amount * UNIT_MS[unit]).toISOString(),
    to: new Date(to).toISOString(),
  };
}

export interface BuildQueryRequestOptions {
  /** Clock used to resolve a relative range; tests pin it. */
  now?: Date;
  parameters?: Record<string, unknown>;
  /** Absolute override, e.g. from a dashboard time filter. */
  timeRange?: TimeRange;
}

/**
 * Builds the request for a widget's persisted query. Returns `undefined` when
 * the widget has no query or no data source, so the renderer shows an empty
 * state instead of calling the adapter.
 */
export function buildQueryRequest(
  widget: DashboardWidget,
  options: BuildQueryRequestOptions = {},
): QueryRequest | undefined {
  if (!widget.query || !widget.dataSourceId) return undefined;

  const { timeRange: persistedRange, ...definition } = widget.query;
  const { now = new Date(), parameters, timeRange } = options;
  const resolvedRange = timeRange ?? resolveQueryTimeRange(persistedRange, now);

  return queryRequestSchema.parse({
    queryId: definition.queryId,
    dataSourceId: widget.dataSourceId,
    query: definition,
    ...(parameters === undefined ? {} : { parameters }),
    ...(resolvedRange === undefined ? {} : { timeRange: resolvedRange }),
  });
}

export interface QueryKeyOptions {
  parameters?: Record<string, unknown>;
  /** Absolute range override; a relative range is part of the query itself. */
  timeRange?: TimeRange;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (typeof value !== "object" || value === null) return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, sortValue(entry)]),
  );
}

/** Stable stringification so key order never changes a cache key. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

/** Cache key for a fully resolved request, including filters and parameters. */
export function queryKeyForRequest(request: QueryRequest): readonly unknown[] {
  return [
    "nama-dashboard-query",
    request.dataSourceId,
    request.query.queryId,
    stableStringify(request.query),
    request.parameters ? stableStringify(request.parameters) : null,
    request.timeRange ? `${request.timeRange.from}/${request.timeRange.to}` : null,
  ];
}

/** Snapshot queries dedupe on the persisted query, not the resolved window. */
export function queryKeyFor(
  widget: DashboardWidget,
  options: QueryKeyOptions = {},
): readonly unknown[] {
  return [
    "nama-dashboard-query",
    widget.dataSourceId ?? null,
    widget.query?.queryId ?? null,
    widget.query ? stableStringify(widget.query) : null,
    options.parameters ? stableStringify(options.parameters) : null,
    options.timeRange ? `${options.timeRange.from}/${options.timeRange.to}` : null,
  ];
}
