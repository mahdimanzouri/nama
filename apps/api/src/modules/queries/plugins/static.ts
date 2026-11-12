import type { QueryDefinition, QueryResult } from "@nama/dashboard-types";
import { z } from "zod";

import { applyQueryLocally, type Row } from "./local-query.ts";
import {
  DataSourceError,
  type ServerDataSourcePlugin,
  type ValidationResult,
} from "./types.ts";

export const STATIC_KIND = "static";
export const DEMO_DATA_SOURCE_ID = "demo-source";

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const MAX_POINTS = 240;
const KNOWN_FIELDS = new Set(["timestamp", "value"]);

const configSchema = z.object({}).strict();

function pseudoValue(index: number): number {
  const wave = Math.sin(index / 3.1) * 28 + Math.sin(index / 9.7 + 1.4) * 12;
  const noise = Math.sin(index * 12.9898) * 4;
  return Math.round((120 + wave + noise) * 10) / 10;
}

function generateMetrics(fromMs: number, toMs: number): Row[] {
  const span = Math.max(toMs - fromMs, MINUTE_MS);
  const stepMs = Math.max(
    MINUTE_MS,
    Math.ceil(span / MAX_POINTS / MINUTE_MS) * MINUTE_MS,
  );
  const rows: Row[] = [];

  for (let time = fromMs; time <= toMs; time += stepMs) {
    rows.push({
      timestamp: new Date(time).toISOString(),
      value: pseudoValue(rows.length),
    });
  }

  return rows;
}

function invalid(message: string): ValidationResult {
  return { valid: false, issues: [{ path: ["query"], message }] };
}

function validateQuery(query: QueryDefinition): ValidationResult {
  if ((query.dataset ?? "metrics") !== "metrics") {
    return invalid(`The static source provides only the "metrics" dataset`);
  }
  if (query.groupBy && query.groupBy.length > 0) {
    return invalid("The static source does not support groupBy");
  }

  const fields = [
    ...query.fields,
    ...(query.aggregations ?? []).map((aggregation) => aggregation.field),
    ...(query.filters ?? []).map((filter) => filter.field),
    ...(query.orderBy ?? []).map((order) => order.field),
  ];

  for (const field of fields) {
    if (!KNOWN_FIELDS.has(field)) {
      return {
        valid: false,
        issues: [{ path: ["query", "fields"], message: `Unknown field "${field}"` }],
      };
    }
  }

  return { valid: true, issues: [] };
}

/**
 * Deterministic in-process connector used by the demo dashboard, adapter tests
 * and offline previews. It exercises the real request, limit and truncation
 * contract without contacting an external system.
 */
export function createStaticPlugin(): ServerDataSourcePlugin {
  return {
    kind: STATIC_KIND,
    manifest: { version: "1.0.0", name: "Static dataset" },
    capabilities: {
      test: true,
      execute: true,
      schemaDiscovery: true,
    },
    configSchema,

    async test() {
      return { ok: true, latencyMs: 0, message: "Static datasets are local" };
    },

    async validate(query) {
      return validateQuery(query);
    },

    async execute(request, context): Promise<QueryResult> {
      const validation = validateQuery(request.query);
      if (!validation.valid) {
        throw new DataSourceError("QUERY_INVALID", validation.issues[0]?.message ?? "");
      }

      const toMs = request.timeRange ? Date.parse(request.timeRange.to) : Date.now();
      const fromMs = request.timeRange
        ? Date.parse(request.timeRange.from)
        : toMs - 24 * HOUR_MS;

      const outcome = applyQueryLocally(generateMetrics(fromMs, toMs), request.query);
      context.signal.throwIfAborted();

      return {
        queryId: request.queryId,
        columns: outcome.columns.map((column) => ({
          ...column,
          type: column.name === "timestamp" ? "timestamp" : "number",
        })),
        rows: outcome.rows,
        timestamp: new Date().toISOString(),
        meta: {
          rowCount: outcome.rows.length,
          truncated: outcome.truncated,
          executionTimeMs: 0,
          cached: false,
        },
      };
    },

    async discover() {
      return [
        {
          name: "metrics",
          fields: [
            { name: "timestamp", type: "timestamp", label: "Timestamp" },
            { name: "value", type: "number", label: "Value" },
          ],
        },
      ];
    },
  };
}
