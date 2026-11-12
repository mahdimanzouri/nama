import {
  queryResultSchema,
  type DataAdapter,
  type QueryColumn,
  type QueryDefinition,
  type QueryFilter,
  type QueryResult,
  type QueryTimeRange,
  type TimeRange,
} from "@nama/dashboard-types";

/**
 * Transport failure surfaced by the SDK adapters. The HTTP adapter keeps the
 * server error code so hosts can react to `QUERY_TIMEOUT` or `RATE_LIMITED`.
 */
export class DataAdapterError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId?: string;

  constructor(code: string, message: string, status: number, requestId?: string) {
    super(message);
    this.name = "DataAdapterError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

export interface HttpDataAdapterOptions {
  /** Prefix prepended to `/v1/queries/execute`; defaults to same-origin. */
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  headers?: Record<string, string> | (() => Record<string, string>);
  /** Host-owned CSRF token; the SDK never reads cookies itself. */
  csrfToken?: () => string | undefined | Promise<string | undefined>;
}

function resolveHeaders(
  headers: HttpDataAdapterOptions["headers"],
): Record<string, string> {
  if (!headers) return {};
  return typeof headers === "function" ? headers() : { ...headers };
}

/**
 * Snapshot adapter over `POST /v1/queries/execute`. The host supplies the base
 * URL, transport, extra headers and CSRF token so the SDK stays transport- and
 * authentication-agnostic.
 */
export function createHttpDataAdapter(options: HttpDataAdapterOptions = {}): DataAdapter {
  const baseUrl = (options.baseUrl ?? "").replace(/\/$/u, "");
  const fetchImpl = options.fetch ?? globalThis.fetch;

  return {
    async execute(request, context) {
      const headers: Record<string, string> = {
        accept: "application/json",
        "content-type": "application/json",
        ...resolveHeaders(options.headers),
      };
      const csrf = await options.csrfToken?.();
      if (csrf) headers["x-csrf-token"] = csrf;

      const response = await fetchImpl(`${baseUrl}/v1/queries/execute`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify(request),
        signal: context.signal,
      });

      const payload: unknown = await response.json().catch(() => undefined);
      if (!response.ok) {
        const error = (payload as { error?: Record<string, unknown> } | undefined)?.error;
        throw new DataAdapterError(
          typeof error?.code === "string" ? error.code : "INTERNAL",
          typeof error?.message === "string"
            ? error.message
            : `The query failed with status ${response.status}`,
          response.status,
          typeof error?.requestId === "string" ? error.requestId : undefined,
        );
      }

      return queryResultSchema.parse(payload);
    },
  };
}

export type StaticRows = Record<string, unknown>;

const UNIT_MS = { m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

function resolveRange(
  range: QueryTimeRange | undefined,
  now: Date,
): TimeRange | undefined {
  if (!range) return undefined;
  if (!("last" in range)) return range;
  const match = /^([1-9]\d*)(m|h|d)$/u.exec(range.last);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unit = match[2] as keyof typeof UNIT_MS;
  const to = now.getTime();
  return {
    from: new Date(to - amount * UNIT_MS[unit]).toISOString(),
    to: new Date(to).toISOString(),
  };
}

function compare(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right));
}

function matches(filter: QueryFilter, value: unknown): boolean {
  switch (filter.operator) {
    case "eq":
      return value === filter.value;
    case "neq":
      return value !== filter.value;
    case "in":
      return Array.isArray(filter.value) && filter.value.includes(value);
    case "contains":
      return (
        typeof value === "string" &&
        typeof filter.value === "string" &&
        value.includes(filter.value)
      );
    case "gt":
      return (
        typeof value === "number" &&
        typeof filter.value === "number" &&
        value > filter.value
      );
    case "gte":
      return (
        typeof value === "number" &&
        typeof filter.value === "number" &&
        value >= filter.value
      );
    case "lt":
      return (
        typeof value === "number" &&
        typeof filter.value === "number" &&
        value < filter.value
      );
    case "lte":
      return (
        typeof value === "number" &&
        typeof filter.value === "number" &&
        value <= filter.value
      );
    case "between":
      return (
        typeof value === "number" &&
        Array.isArray(filter.value) &&
        typeof filter.value[0] === "number" &&
        typeof filter.value[1] === "number" &&
        value >= filter.value[0] &&
        value <= filter.value[1]
      );
    default:
      return false;
  }
}

function inferType(name: string, value: unknown): string {
  if (name === "timestamp" || name === "time" || /At$/u.test(name)) return "timestamp";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "string";
}

function columnsFor(rows: StaticRows[], fields: string[]): QueryColumn[] {
  const first = rows[0] ?? {};
  return fields.map((name) => ({ name, type: inferType(name, first[name]) }));
}

function aggregate(rows: StaticRows[], definition: QueryDefinition): QueryResult["rows"] {
  const row = Object.fromEntries(
    (definition.aggregations ?? []).flatMap((aggregation) => {
      const values = rows
        .map((entry) => entry[aggregation.field])
        .filter((value): value is number => typeof value === "number");
      if (values.length === 0) return [];
      switch (aggregation.fn) {
        case "sum":
          return [[aggregation.field, values.reduce((total, value) => total + value, 0)]];
        case "avg":
          return [
            [
              aggregation.field,
              values.reduce((total, value) => total + value, 0) / values.length,
            ],
          ];
        case "min":
          return [[aggregation.field, Math.min(...values)]];
        case "max":
          return [[aggregation.field, Math.max(...values)]];
        case "count":
          return [[aggregation.field, values.length]];
        default:
          return [];
      }
    }),
  );
  return [row];
}

export interface StaticDataAdapterOptions {
  /** Clock used to resolve persisted relative time ranges. */
  now?: () => Date;
}

/**
 * In-memory adapter for demos, tests and offline previews. It evaluates the
 * structured query locally over fixed rows, so no network is involved.
 */
export function createStaticDataAdapter(
  datasets: Record<string, StaticRows[]>,
  options: StaticDataAdapterOptions = {},
): DataAdapter {
  return {
    async execute(request, context) {
      const startedAt = performance.now();
      context.signal.throwIfAborted();

      const dataset = request.query.dataset ?? Object.keys(datasets)[0];
      const source = dataset ? datasets[dataset] : undefined;
      if (!source) {
        throw new DataAdapterError(
          "QUERY_INVALID",
          `The static adapter has no dataset "${dataset ?? ""}"`,
          422,
        );
      }

      const range =
        request.timeRange ??
        resolveRange(request.query.timeRange, (options.now ?? (() => new Date()))());
      let rows = source;

      if (range) {
        const from = Date.parse(range.from);
        const to = Date.parse(range.to);
        rows = rows.filter((row) => {
          const stamp = row.timestamp;
          if (typeof stamp !== "string") return true;
          const time = Date.parse(stamp);
          return Number.isNaN(time) || (time >= from && time <= to);
        });
      }

      for (const filter of request.query.filters ?? []) {
        rows = rows.filter((row) => matches(filter, row[filter.field]));
      }

      const ordered = [...rows];
      for (const order of request.query.orderBy ?? []) {
        ordered.sort((left, right) => {
          const result = compare(left[order.field], right[order.field]);
          return order.direction === "desc" ? -result : result;
        });
      }

      const limit = request.query.limit ?? ordered.length;
      const truncated = ordered.length > limit;
      const selected = ordered.slice(0, limit);

      const aggregationFields = (request.query.aggregations ?? []).map(
        (aggregation) => aggregation.field,
      );
      const resultRows =
        aggregationFields.length > 0
          ? aggregate(selected, request.query)
          : selected.map((row) =>
              Object.fromEntries(
                request.query.fields.map((field) => [field, row[field]]),
              ),
            );
      const fields =
        aggregationFields.length > 0 ? aggregationFields : request.query.fields;

      return {
        queryId: request.queryId,
        columns: columnsFor(resultRows, fields),
        rows: resultRows,
        timestamp: new Date().toISOString(),
        meta: {
          rowCount: resultRows.length,
          truncated,
          executionTimeMs: Math.round((performance.now() - startedAt) * 100) / 100,
          cached: false,
        },
      };
    },
  };
}
