import {
  PLATFORM_LIMITS,
  type QueryResult,
  type QueryRequest,
} from "@nama/dashboard-types";

import { HttpError } from "../../infrastructure/errors.ts";

export const DEMO_DATA_SOURCE_ID = "demo-source";

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const MAX_POINTS = 240;

interface DemoRow {
  timestamp: string;
  value: number;
}

function pseudoValue(index: number): number {
  const wave = Math.sin(index / 3.1) * 28 + Math.sin(index / 9.7 + 1.4) * 12;
  const noise = Math.sin(index * 12.9898) * 4;
  return Math.round((120 + wave + noise) * 10) / 10;
}

function generateMetrics(fromMs: number, toMs: number): DemoRow[] {
  const span = Math.max(toMs - fromMs, MINUTE_MS);
  const stepMs = Math.max(
    MINUTE_MS,
    Math.ceil(span / MAX_POINTS / MINUTE_MS) * MINUTE_MS,
  );
  const rows: DemoRow[] = [];

  for (
    let time = fromMs;
    time <= toMs && rows.length < PLATFORM_LIMITS.maxQueryRows;
    time += stepMs
  ) {
    rows.push({
      timestamp: new Date(time).toISOString(),
      value: pseudoValue(rows.length),
    });
  }

  return rows;
}

function compareValues(left: unknown, right: unknown, operator: string): boolean {
  switch (operator) {
    case "eq":
      return left === right;
    case "neq":
      return left !== right;
    case "in":
      return Array.isArray(right) && right.includes(left);
    case "contains":
      return (
        typeof left === "string" && typeof right === "string" && left.includes(right)
      );
    case "gt":
      return typeof left === "number" && typeof right === "number" && left > right;
    case "gte":
      return typeof left === "number" && typeof right === "number" && left >= right;
    case "lt":
      return typeof left === "number" && typeof right === "number" && left < right;
    case "lte":
      return typeof left === "number" && typeof right === "number" && left <= right;
    case "between":
      return (
        typeof left === "number" &&
        Array.isArray(right) &&
        right.length === 2 &&
        typeof right[0] === "number" &&
        typeof right[1] === "number" &&
        left >= right[0] &&
        left <= right[1]
      );
    default:
      return false;
  }
}

function applyAggregation(
  rows: DemoRow[],
  aggregation: { field: string; fn: string },
): number | undefined {
  const values = rows
    .map((row) => row[aggregation.field as keyof DemoRow])
    .filter((value): value is number => typeof value === "number");

  if (values.length === 0) return undefined;

  switch (aggregation.fn) {
    case "sum":
      return values.reduce((total, value) => total + value, 0);
    case "avg":
      return values.reduce((total, value) => total + value, 0) / values.length;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
    case "count":
      return values.length;
    default:
      return undefined;
  }
}

/**
 * Deterministic demo execution for the walking skeleton. It exercises the real
 * request/response contract and limits; M6 replaces it with connector plugins.
 */
export function executeDemoQuery(request: QueryRequest, now: Date): QueryResult {
  const startedAt = performance.now();
  const definition = request.query;

  if ((definition.dataset ?? "metrics") !== "metrics") {
    throw new HttpError(422, {
      code: "QUERY_INVALID",
      message: `The demo source does not provide the dataset "${definition.dataset}"`,
    });
  }

  if (definition.groupBy && definition.groupBy.length > 0) {
    throw new HttpError(422, {
      code: "QUERY_INVALID",
      message: "The demo source does not support groupBy",
    });
  }

  const toMs = request.timeRange ? Date.parse(request.timeRange.to) : now.getTime();
  const fromMs = request.timeRange
    ? Date.parse(request.timeRange.from)
    : toMs - 24 * HOUR_MS;

  let rows: DemoRow[] = generateMetrics(fromMs, toMs);

  for (const filter of definition.filters ?? []) {
    rows = rows.filter((row) =>
      compareValues(row[filter.field as keyof DemoRow], filter.value, filter.operator),
    );
  }

  const limit = Math.min(definition.limit ?? 1_000, PLATFORM_LIMITS.maxQueryRows);
  const truncated = rows.length > limit;
  rows = rows.slice(0, limit);

  const timestamp = now.toISOString();
  const executionTimeMs = Math.round((performance.now() - startedAt) * 100) / 100;

  if (definition.aggregations && definition.aggregations.length > 0) {
    const aggregates = definition.aggregations.flatMap((aggregation) => {
      const value = applyAggregation(rows, aggregation);
      return value === undefined ? [] : [{ key: aggregation.field, value }];
    });

    const row = Object.fromEntries(aggregates.map((entry) => [entry.key, entry.value]));

    return {
      queryId: request.queryId,
      columns: aggregates.map((entry) => ({
        name: entry.key,
        type: "number",
      })),
      rows: [row],
      timestamp,
      meta: {
        rowCount: 1,
        truncated,
        executionTimeMs,
        cached: false,
      },
    };
  }

  const fields = definition.fields.filter(
    (field) => field in (rows[0] ?? { timestamp: "", value: 0 }),
  );
  const projected = rows.map((row) =>
    Object.fromEntries(fields.map((field) => [field, row[field as keyof DemoRow]])),
  );

  return {
    queryId: request.queryId,
    columns: fields.map((field) => ({
      name: field,
      type: field === "timestamp" ? "timestamp" : "number",
    })),
    rows: projected,
    timestamp,
    meta: {
      rowCount: projected.length,
      truncated,
      executionTimeMs,
      cached: false,
    },
  };
}
