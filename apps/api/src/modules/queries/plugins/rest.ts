import {
  queryColumnSchema,
  type QueryColumn,
  type QueryDefinition,
  type QueryResult,
} from "@nama/dashboard-types";
import { z } from "zod";

import { assertPublicUrl } from "./egress.ts";
import { applyQueryLocally, type Row } from "./local-query.ts";
import {
  DataSourceError,
  type PluginContext,
  type PluginQueryRequest,
  type ServerDataSourcePlugin,
  type ValidationResult,
} from "./types.ts";

export const REST_KIND = "rest";

const FORBIDDEN_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
]);

const configSchema = z
  .object({
    url: z.string().url(),
    method: z.enum(["GET", "POST"]).default("GET"),
    /** Dot path to the rows array inside the JSON response. */
    rowsPath: z.string().min(1).max(200).optional(),
    columns: z.array(queryColumnSchema).max(100).optional(),
  })
  .strict();

const credentialSchema = z
  .object({
    headers: z.record(z.string(), z.string()).optional(),
  })
  .strict();

type RestConfig = z.infer<typeof configSchema>;

function getPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (typeof current !== "object" || current === null) return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

function inferType(value: unknown, name: string): string {
  if (name === "timestamp" || name === "time" || /At$/u.test(name)) return "timestamp";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "string";
}

function extractRows(payload: unknown, config: RestConfig): Row[] {
  const candidate = config.rowsPath ? getPath(payload, config.rowsPath) : payload;
  const rows = Array.isArray(candidate)
    ? candidate
    : typeof candidate === "object" && candidate !== null
      ? (candidate as Record<string, unknown>).rows
      : undefined;

  if (!Array.isArray(rows)) {
    throw new DataSourceError(
      "QUERY_INVALID",
      "The data source did not return a JSON array of rows",
    );
  }

  return rows.map((row, index) => {
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
      throw new DataSourceError("QUERY_INVALID", `Row ${index} is not a JSON object`);
    }
    return row as Row;
  });
}

function columnsFor(rows: Row[], configured?: QueryColumn[]): QueryColumn[] {
  if (configured && configured.length > 0) return configured;
  const first = rows[0];
  if (!first) return [];
  return Object.entries(first).map(([name, value]) => ({
    name,
    type: inferType(value, name),
  }));
}

async function requestRows(
  request: PluginQueryRequest,
  config: RestConfig,
  context: PluginContext,
): Promise<{ rows: Row[]; columns: QueryColumn[]; latencyMs: number }> {
  const url = await assertPublicUrl(config.url, context.allowPrivateNetwork);

  const credentials = await context.credentials();
  const extraHeaders = z.record(z.string(), z.string()).safeParse(credentials.headers);
  const headers: Record<string, string> = { accept: "application/json" };

  if (extraHeaders.success) {
    for (const [name, value] of Object.entries(extraHeaders.data)) {
      if (!FORBIDDEN_HEADERS.has(name.toLowerCase())) headers[name] = value;
    }
  }

  const startedAt = performance.now();
  let response: Response;
  try {
    if (config.method === "POST") {
      headers["content-type"] = "application/json";
    }
    response = await context.fetch(url, {
      method: config.method,
      headers,
      body:
        config.method === "POST"
          ? JSON.stringify({
              queryId: request.queryId,
              query: request.query,
              parameters: request.parameters,
              ...(request.timeRange ? { timeRange: request.timeRange } : {}),
            })
          : undefined,
      redirect: "manual",
      signal: context.signal,
    });
  } catch (error) {
    if (context.signal.aborted) {
      throw new DataSourceError("CANCELLED", "The query was cancelled");
    }
    context.logger.warn(
      { dataSourceId: context.dataSourceId, error: (error as Error).name },
      "data-source request failed",
    );
    throw new DataSourceError(
      "DATASOURCE_UNREACHABLE",
      "The data source could not be reached",
    );
  }

  const latencyMs = Math.round((performance.now() - startedAt) * 100) / 100;

  if (response.status >= 300 && response.status < 400) {
    throw new DataSourceError(
      "DATASOURCE_UNREACHABLE",
      "The data source attempted a redirect, which is not allowed",
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new DataSourceError(
      "DATASOURCE_AUTH_FAILED",
      "The data source rejected the credentials",
    );
  }
  if (response.status === 429) {
    throw new DataSourceError("RATE_LIMITED", "The data source rate-limited the request");
  }
  if (response.status >= 500) {
    throw new DataSourceError(
      "DATASOURCE_UNREACHABLE",
      `The data source returned status ${response.status}`,
    );
  }
  if (!response.ok) {
    throw new DataSourceError(
      "QUERY_INVALID",
      `The data source returned status ${response.status}`,
    );
  }

  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > context.limits.maxBytes) {
    throw new DataSourceError(
      "RESULT_TOO_LARGE",
      "The data-source response exceeds the result byte limit",
    );
  }

  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > context.limits.maxBytes) {
    throw new DataSourceError(
      "RESULT_TOO_LARGE",
      "The data-source response exceeds the result byte limit",
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new DataSourceError("QUERY_INVALID", "The data source returned invalid JSON");
  }

  const rows = extractRows(payload, config);
  return { rows, columns: columnsFor(rows, config.columns), latencyMs };
}

export function createRestPlugin(): ServerDataSourcePlugin {
  return {
    kind: REST_KIND,
    manifest: { version: "1.0.0", name: "JSON over HTTP" },
    capabilities: {
      test: true,
      execute: true,
      schemaDiscovery: false,
    },
    configSchema,
    credentialSchema,

    async test(context) {
      const config = configSchema.parse(context.config);
      const url = await assertPublicUrl(config.url, context.allowPrivateNetwork);
      const startedAt = performance.now();

      const response = await context.fetch(url, {
        method: "GET",
        headers: { accept: "application/json" },
        redirect: "manual",
        signal: context.signal,
      });
      const latencyMs = Math.round((performance.now() - startedAt) * 100) / 100;

      return {
        ok: response.ok,
        latencyMs,
        message: response.ok
          ? `Reached the source with status ${response.status}`
          : `The source returned status ${response.status}`,
      };
    },

    async validate(query: QueryDefinition): Promise<ValidationResult> {
      if (query.fields.length === 0) {
        return {
          valid: false,
          issues: [{ path: ["query", "fields"], message: "Select at least one field" }],
        };
      }
      return { valid: true, issues: [] };
    },

    async execute(request, context): Promise<QueryResult> {
      const config = configSchema.parse(context.config);
      const { rows, columns, latencyMs } = await requestRows(request, config, context);
      const outcome = applyQueryLocally(rows, request.query);

      const known = new Map(columns.map((column) => [column.name, column]));
      const resultColumns = (config.columns ?? outcome.columns).map((column) => ({
        ...column,
        type: known.get(column.name)?.type ?? column.type,
      }));

      return {
        queryId: request.queryId,
        columns: resultColumns,
        rows: outcome.rows,
        timestamp: new Date().toISOString(),
        meta: {
          rowCount: outcome.rows.length,
          truncated: outcome.truncated,
          executionTimeMs: latencyMs,
          cached: false,
        },
      };
    },
  };
}
