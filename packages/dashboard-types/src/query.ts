import { z } from "zod";

import {
  opaqueIdSchema,
  timestampSchema,
  PLATFORM_LIMITS,
  type Locale,
  type Timestamp,
} from "./primitives";

export const FILTER_OPERATORS = [
  "eq",
  "neq",
  "in",
  "contains",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
] as const;

export const filterOperatorSchema = z.enum(FILTER_OPERATORS);
export type FilterOperator = z.infer<typeof filterOperatorSchema>;

export const AGGREGATION_FUNCTIONS = ["sum", "avg", "min", "max", "count"] as const;
export const aggregationFunctionSchema = z.enum(AGGREGATION_FUNCTIONS);
export type AggregationFunction = z.infer<typeof aggregationFunctionSchema>;

export const SORT_DIRECTIONS = ["asc", "desc"] as const;
export const sortDirectionSchema = z.enum(SORT_DIRECTIONS);
export type SortDirection = z.infer<typeof sortDirectionSchema>;

export const VARIABLE_BINDING_TARGETS = [
  "query.parameter",
  "query.timeRange",
  "filter.value",
] as const;

export const variableBindingSchema = z
  .object({
    target: z.enum(VARIABLE_BINDING_TARGETS),
    parameter: z.string().min(1).max(120),
  })
  .strict();

export type VariableBinding = z.infer<typeof variableBindingSchema>;

export const queryFilterSchema = z
  .object({
    field: z.string().min(1).max(200),
    operator: filterOperatorSchema,
    value: z.unknown(),
  })
  .strict();

export type QueryFilter = z.infer<typeof queryFilterSchema>;

export const aggregationSchema = z
  .object({
    field: z.string().min(1).max(200),
    fn: aggregationFunctionSchema,
  })
  .strict();

export type Aggregation = z.infer<typeof aggregationSchema>;

export const orderBySchema = z
  .object({
    field: z.string().min(1).max(200),
    direction: sortDirectionSchema,
  })
  .strict();

export type OrderBy = z.infer<typeof orderBySchema>;

/** Absolute UTC range; used when a relative range has been resolved. */
export const timeRangeSchema = z
  .object({
    from: timestampSchema,
    to: timestampSchema,
  })
  .strict()
  .refine((range) => Date.parse(range.from) <= Date.parse(range.to), {
    message: "from must not be after to",
    path: ["from"],
  });

export type TimeRange = z.infer<typeof timeRangeSchema>;

/** Persisted widget query range, e.g. `{ mode: "relative", last: "24h" }`. */
export const relativeTimeRangeSchema = z
  .object({
    mode: z.literal("relative"),
    last: z
      .string()
      .min(2)
      .max(16)
      .regex(/^[1-9]\d*(m|h|d)$/u, "must be a duration such as 15m, 24h or 7d"),
  })
  .strict();

export type RelativeTimeRange = z.infer<typeof relativeTimeRangeSchema>;

/** A persisted range is either relative (resolved on read) or absolute. */
export const queryTimeRangeSchema = z.union([relativeTimeRangeSchema, timeRangeSchema]);

export type QueryTimeRange = z.infer<typeof queryTimeRangeSchema>;

export const queryDefinitionSchema = z
  .object({
    queryId: z.string().min(1).max(200),
    dataset: z.string().min(1).max(200).optional(),
    fields: z.array(z.string().min(1).max(200)).min(1),
    aggregations: z.array(aggregationSchema).max(20).optional(),
    filters: z.array(queryFilterSchema).max(50).optional(),
    groupBy: z.array(z.string().min(1).max(200)).max(20).optional(),
    orderBy: z.array(orderBySchema).max(20).optional(),
    limit: z.number().int().min(1).max(PLATFORM_LIMITS.maxQueryRows).optional(),
    variableBindings: z.array(variableBindingSchema).max(50).optional(),
    timeRange: queryTimeRangeSchema.optional(),
  })
  .strict();

export type QueryDefinition = z.infer<typeof queryDefinitionSchema>;

export const queryRequestSchema = z
  .object({
    queryId: z.string().min(1).max(200),
    dataSourceId: opaqueIdSchema,
    query: queryDefinitionSchema,
    parameters: z.record(z.string(), z.unknown()).optional(),
    timeRange: timeRangeSchema.optional(),
  })
  .strict();

export type QueryRequest = z.infer<typeof queryRequestSchema>;

export const queryColumnSchema = z
  .object({
    name: z.string().min(1).max(200),
    type: z.string().min(1).max(64),
    label: z.string().max(200).optional(),
  })
  .strict();

export type QueryColumn = z.infer<typeof queryColumnSchema>;

export const queryResultSchema = z
  .object({
    queryId: z.string().min(1).max(200),
    columns: z.array(queryColumnSchema),
    rows: z.array(z.record(z.string(), z.unknown())),
    timestamp: timestampSchema,
    meta: z
      .object({
        rowCount: z.number().int().nonnegative(),
        truncated: z.boolean(),
        executionTimeMs: z.number().nonnegative(),
        cached: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type QueryResult = z.infer<typeof queryResultSchema>;

export const QUERY_ERROR_CODES = [
  "DATASOURCE_UNREACHABLE",
  "DATASOURCE_AUTH_FAILED",
  "QUERY_INVALID",
  "QUERY_TIMEOUT",
  "RESULT_TOO_LARGE",
  "RATE_LIMITED",
  "RAW_SQL_FORBIDDEN",
  "CANCELLED",
  "INTERNAL",
] as const;

export const queryErrorCodeSchema = z.enum(QUERY_ERROR_CODES);
export type QueryErrorCode = z.infer<typeof queryErrorCodeSchema>;

export const queryErrorSchema = z
  .object({
    code: queryErrorCodeSchema,
    message: z.string().min(1),
    fieldPaths: z.array(z.union([z.string(), z.number()])).optional(),
    requestId: z.string().min(1).optional(),
    retryAfterMs: z.number().int().nonnegative().optional(),
  })
  .strict();

export type QueryError = z.infer<typeof queryErrorSchema>;

export type SubscriptionStatus = "connecting" | "open" | "closed" | "reconnecting";

export interface DataEvent {
  sequence: number;
  timestamp: Timestamp;
  data: unknown;
}

export interface SubscriptionHandlers {
  onSnapshot(result: QueryResult): void;
  onData(event: DataEvent): void;
  onGap(): void;
  onError(error: QueryError): void;
  onStatus(status: SubscriptionStatus): void;
}

export type Unsubscribe = () => void | Promise<void>;

export interface QueryContext {
  signal: AbortSignal;
  requestId: string;
  dashboardId: string;
  locale: Locale;
  timezone: string;
}

/**
 * The host injects an adapter. The SDK never talks to a database and never
 * receives credentials; transport and authentication belong to the host.
 */
export interface DataAdapter {
  execute(request: QueryRequest, context: QueryContext): Promise<QueryResult>;
  subscribe?(
    request: QueryRequest,
    context: QueryContext,
    handlers: SubscriptionHandlers,
  ): Promise<Unsubscribe>;
}
