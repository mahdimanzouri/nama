import { z } from "zod";
import { DataSourceError } from "@nama/dashboard-types";

export const MEMORY_KIND = "memory";

const configSchema = z
  .object({
    rows: z.array(z.record(z.string(), z.unknown())).max(1000).default([]),
  })
  .strict();

function fieldsOf(rows) {
  const first = rows[0];
  if (!first) return [];
  return Object.entries(first).map(([name, value]) => ({
    name,
    type:
      typeof value === "number"
        ? "number"
        : typeof value === "boolean"
          ? "boolean"
          : "string",
  }));
}

function unknownField(query, rows) {
  const known = new Set(fieldsOf(rows).map((field) => field.name));
  const requested = [
    ...query.fields,
    ...(query.aggregations ?? []).map((entry) => entry.field),
    ...(query.filters ?? []).map((entry) => entry.field),
    ...(query.orderBy ?? []).map((entry) => entry.field),
  ];
  return requested.find((field) => !known.has(field));
}

/**
 * Example data-source plugin: serves rows supplied in the source configuration.
 * It implements the documented contract without network access, so it is safe
 * in tests and offline demos.
 */
export function createMemoryPlugin() {
  return {
    kind: MEMORY_KIND,
    manifest: { version: "1.0.0", name: "In-memory rows" },
    capabilities: { test: true, execute: true, schemaDiscovery: true },
    configSchema,

    async test(context) {
      const rows = context.config.rows ?? [];
      return { ok: true, latencyMs: 0, message: `${rows.length} rows configured` };
    },

    async validate(query, context) {
      const missing = unknownField(query, context.config.rows ?? []);
      if (missing) {
        return {
          valid: false,
          issues: [{ path: ["query", "fields"], message: `Unknown field "${missing}"` }],
        };
      }
      if (query.groupBy && query.groupBy.length > 0) {
        return {
          valid: false,
          issues: [{ path: ["query", "groupBy"], message: "groupBy is not supported" }],
        };
      }
      return { valid: true, issues: [] };
    },

    async execute(request, context) {
      const rows = context.config.rows ?? [];
      const missing = unknownField(request.query, rows);
      if (missing) {
        throw new DataSourceError("QUERY_INVALID", `Unknown field "${missing}"`);
      }

      const requested = request.query.limit ?? rows.length;
      const limit = Math.min(requested, context.limits.maxRows, rows.length);
      const selected = rows.slice(0, limit);
      context.signal.throwIfAborted();

      return {
        queryId: request.queryId,
        columns: fieldsOf(rows),
        rows: selected,
        timestamp: new Date().toISOString(),
        meta: {
          rowCount: selected.length,
          truncated: limit < rows.length,
          executionTimeMs: 0,
          cached: false,
        },
      };
    },

    async discover(context) {
      const rows = context.config.rows ?? [];
      return [{ name: "rows", fields: fieldsOf(rows) }];
    },
  };
}
