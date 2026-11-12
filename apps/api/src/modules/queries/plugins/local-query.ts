import type { QueryColumn, QueryDefinition } from "@nama/dashboard-types";

export type Row = Record<string, unknown>;

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

function aggregateValue(rows: Row[], aggregation: { field: string; fn: string }) {
  const values = rows
    .map((row) => row[aggregation.field])
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

export interface LocalQueryOutcome {
  rows: Row[];
  columns: QueryColumn[];
  /** A requested limit or the source cap dropped rows. */
  truncated: boolean;
}

/**
 * Applies the structured query to rows produced by a connector. Sources that
 * can push work down (SQL) skip this; JSON and static sources use it so widget
 * semantics are identical across kinds.
 */
export function applyQueryLocally(
  sourceRows: Row[],
  definition: QueryDefinition,
): LocalQueryOutcome {
  let rows = sourceRows;

  for (const filter of definition.filters ?? []) {
    rows = rows.filter((row) =>
      compareValues(row[filter.field], filter.value, filter.operator),
    );
  }

  for (const order of [...(definition.orderBy ?? [])].reverse()) {
    rows = [...rows].sort((left, right) => {
      const a = left[order.field];
      const b = right[order.field];
      if (a === b) return 0;
      if (a === undefined || a === null) return 1;
      if (b === undefined || b === null) return -1;
      const result =
        typeof a === "number" && typeof b === "number"
          ? a < b
            ? -1
            : 1
          : String(a).localeCompare(String(b));
      return order.direction === "asc" ? result : -result;
    });
  }

  let truncated = false;
  if (definition.limit !== undefined && rows.length > definition.limit) {
    rows = rows.slice(0, definition.limit);
    truncated = true;
  }

  if (definition.aggregations && definition.aggregations.length > 0) {
    const row = Object.fromEntries(
      definition.aggregations.flatMap((aggregation) => {
        const value = aggregateValue(rows, aggregation);
        return value === undefined ? [] : [[aggregation.field, value]];
      }),
    );
    const columns = Object.keys(row).map((name) => ({ name, type: "number" }));
    return { rows: [row], columns, truncated };
  }

  const fields = definition.fields;
  const projected = rows.map((row) =>
    Object.fromEntries(fields.map((field) => [field, row[field]])),
  );
  const columns = fields.map((field) => ({
    name: field,
    type: field === "timestamp" || /At$/u.test(field) ? "timestamp" : "unknown",
  }));

  return { rows: projected, columns, truncated };
}
