import {
  queryResultSchema,
  type QueryDefinition,
  type QueryRequest,
  type QueryResult,
} from "@nama/dashboard-types";

import {
  requireCredentialCipher,
  type CredentialCipher,
} from "../../infrastructure/credentials.ts";
import { HttpError, notFound } from "../../infrastructure/errors.ts";
import type { Metrics } from "../../infrastructure/metrics.ts";
import type {
  DataSourceRecord,
  Persistence,
  TenantScope,
} from "../../infrastructure/persistence/types.ts";
import { ConcurrencyGate, resolveLimits, type DataSourceLimits } from "./limits.ts";
import type { PluginRegistry } from "./plugins/registry.ts";
import { DEMO_DATA_SOURCE_ID } from "./plugins/static.ts";
import {
  DataSourceError,
  type DatasetSchema,
  type PluginContext,
  type PluginLogger,
  type ServerDataSourcePlugin,
  type TestResult,
  type ValidationResult,
} from "./plugins/types.ts";

export { DEMO_DATA_SOURCE_ID };

const ERROR_STATUS = {
  DATASOURCE_UNREACHABLE: 502,
  DATASOURCE_AUTH_FAILED: 502,
  QUERY_INVALID: 422,
  QUERY_TIMEOUT: 504,
  RESULT_TOO_LARGE: 422,
  RATE_LIMITED: 429,
  RAW_SQL_FORBIDDEN: 403,
  CANCELLED: 408,
  INTERNAL: 500,
} as const;

export interface QueryServiceDeps {
  persistence: Persistence;
  plugins: PluginRegistry;
  cipher: CredentialCipher | null;
  /** Test-only: lets fixtures reach a loopback address. */
  allowPrivateNetwork: boolean;
  fetch: typeof globalThis.fetch;
  concurrency?: ConcurrencyGate;
  metrics?: Metrics;
}

export interface ExecuteOptions {
  requestId: string;
  signal?: AbortSignal;
  logger?: PluginLogger;
}

/**
 * The identity a query runs as. Realtime embed sessions have no user session,
 * so the caller is explicit rather than derived from an HTTP request.
 */
export interface QueryCaller {
  organizationId: string;
  /** Tenant scope key; for embeds this is the issuer's user id. */
  userId: string;
  actorType?: "user" | "embed";
  actorId?: string;
}

export function callerFromAuth(auth: {
  organization: { id: string };
  user: { id: string };
}): QueryCaller {
  return { organizationId: auth.organization.id, userId: auth.user.id };
}

export interface DiscoveredSource {
  dataSourceId: string;
  kind: string;
  capabilities: ServerDataSourcePlugin["capabilities"];
  datasets: DatasetSchema[];
}

const SILENT_LOGGER: PluginLogger = { warn: () => {} };

function demoRecord(organizationId: string): DataSourceRecord {
  return {
    id: DEMO_DATA_SOURCE_ID,
    organizationId,
    name: "Demo metrics",
    kind: "static",
    config: {},
    allowRawSql: false,
    limits: {},
    status: "active",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function resultBytes(result: QueryResult): number {
  return Buffer.byteLength(JSON.stringify(result.rows), "utf8");
}

/**
 * Applies the source limits to a plugin result. Rows are cut at `maxRows`, and
 * when the payload still exceeds `maxBytes` the row prefix is found with a
 * binary search so the truncation flag stays accurate.
 */
export function enforceResultLimits(
  result: QueryResult,
  limits: DataSourceLimits,
): QueryResult {
  let rows = result.rows;
  let truncated = result.meta.truncated;

  if (rows.length > limits.maxRows) {
    rows = rows.slice(0, limits.maxRows);
    truncated = true;
  }

  const budget = (candidate: QueryResult["rows"]): QueryResult => ({
    ...result,
    rows: candidate,
    meta: {
      ...result.meta,
      rowCount: candidate.length,
      truncated,
    },
  });

  if (resultBytes(budget(rows)) <= limits.maxBytes) return budget(rows);

  let low = 0;
  let high = rows.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (resultBytes(budget(rows.slice(0, middle))) <= limits.maxBytes) low = middle;
    else high = middle - 1;
  }

  truncated = true;
  if (low === 0 && resultBytes(budget([])) > limits.maxBytes) {
    throw new DataSourceError(
      "RESULT_TOO_LARGE",
      "The query columns alone exceed the result byte limit",
    );
  }

  return budget(rows.slice(0, low));
}

export class QueryService {
  private readonly persistence: Persistence;
  private readonly plugins: PluginRegistry;
  private readonly cipher: CredentialCipher | null;
  private readonly allowPrivateNetwork: boolean;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly gate: ConcurrencyGate;
  private readonly metrics: Metrics | undefined;

  constructor({
    persistence,
    plugins,
    cipher,
    allowPrivateNetwork,
    fetch,
    concurrency = new ConcurrencyGate(),
    metrics,
  }: QueryServiceDeps) {
    this.persistence = persistence;
    this.plugins = plugins;
    this.cipher = cipher;
    this.allowPrivateNetwork = allowPrivateNetwork;
    this.fetchImpl = fetch;
    this.gate = concurrency;
    this.metrics = metrics;
  }

  private scope(caller: QueryCaller): TenantScope {
    return { organizationId: caller.organizationId, userId: caller.userId };
  }

  private async loadSource(
    caller: QueryCaller,
    dataSourceId: string,
  ): Promise<DataSourceRecord> {
    if (dataSourceId === DEMO_DATA_SOURCE_ID) {
      return demoRecord(caller.organizationId);
    }

    const record = await this.persistence.withTenant(this.scope(caller), () =>
      this.persistence.dataSources.find(caller.organizationId, dataSourceId),
    );
    if (!record) throw notFound("Data source not found");
    return record;
  }

  private pluginFor(record: DataSourceRecord): ServerDataSourcePlugin {
    const plugin = this.plugins.get(record.kind);
    if (!plugin) {
      throw new HttpError(501, {
        code: "NOT_IMPLEMENTED",
        message: `Data-source kind "${record.kind}" is not supported yet`,
      });
    }
    return plugin;
  }

  private pluginConfig(
    plugin: ServerDataSourcePlugin,
    record: DataSourceRecord,
  ): Record<string, unknown> {
    const parsed = plugin.configSchema.safeParse(record.config);
    if (!parsed.success) {
      throw new HttpError(422, {
        code: "QUERY_INVALID",
        message: `The "${record.name}" data source has an invalid configuration`,
        fieldPaths: parsed.error.issues.map((issue) => issue.path.join(".")),
      });
    }
    return parsed.data as Record<string, unknown>;
  }

  private async credentials(
    caller: QueryCaller,
    record: DataSourceRecord,
  ): Promise<Record<string, unknown>> {
    if (record.id === DEMO_DATA_SOURCE_ID) return {};

    const stored = await this.persistence.withTenant(this.scope(caller), () =>
      this.persistence.dataSources.getCredential(caller.organizationId, record.id),
    );
    if (!stored) return {};

    const cipher = requireCredentialCipher(this.cipher);
    try {
      const parsed: unknown = JSON.parse(
        cipher.decrypt(stored.ciphertext).toString("utf8"),
      );
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return {};
      }
      return parsed as Record<string, unknown>;
    } catch {
      throw new HttpError(500, {
        code: "INTERNAL",
        message: "The stored data-source credentials could not be read",
      });
    }
  }

  private async buildContext(
    caller: QueryCaller,
    record: DataSourceRecord,
    plugin: ServerDataSourcePlugin,
    options: { requestId: string; signal: AbortSignal; logger?: PluginLogger },
  ): Promise<{ context: PluginContext; limits: DataSourceLimits }> {
    const limits = resolveLimits(record.limits);
    let pending: Promise<Record<string, unknown>> | undefined;
    const context: PluginContext = {
      organizationId: caller.organizationId,
      dataSourceId: record.id,
      requestId: options.requestId,
      config: this.pluginConfig(plugin, record),
      credentials: () => {
        pending ??= this.credentials(caller, record);
        return pending;
      },
      limits,
      allowPrivateNetwork: this.allowPrivateNetwork,
      fetch: this.fetchImpl,
      signal: options.signal,
      logger: options.logger ?? SILENT_LOGGER,
    };
    return { context, limits };
  }

  async execute(
    caller: QueryCaller,
    request: QueryRequest,
    options: ExecuteOptions,
  ): Promise<QueryResult> {
    const record = await this.loadSource(caller, request.dataSourceId);
    if (record.status === "disabled") {
      throw new HttpError(422, {
        code: "QUERY_INVALID",
        message: "The data source is disabled",
      });
    }

    const plugin = this.pluginFor(record);
    const limits = resolveLimits(record.limits);

    const key = `${caller.organizationId}:${record.id}`;
    const release = this.gate.tryAcquire(key, limits.maxConcurrent);
    if (!release) {
      throw new HttpError(429, {
        code: "RATE_LIMITED",
        message: "Too many concurrent queries for this data source",
        retryAfterMs: 1_000,
      });
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, limits.timeoutMs);

    const forwardAbort = () => controller.abort();
    options.signal?.addEventListener("abort", forwardAbort, { once: true });
    if (options.signal?.aborted) controller.abort();

    const startedAt = performance.now();

    let outcome: "ok" | "truncated" | "error" = "error";
    try {
      const { context } = await this.buildContext(caller, record, plugin, {
        requestId: options.requestId,
        signal: controller.signal,
        logger: options.logger,
      });

      let raw: QueryResult;
      try {
        raw = await plugin.execute(
          {
            queryId: request.queryId,
            query: request.query,
            parameters: request.parameters ?? {},
            ...(request.timeRange ? { timeRange: request.timeRange } : {}),
          },
          context,
        );
      } catch (error) {
        throw this.mapError(error, {
          timedOut,
          externallyAborted: options.signal?.aborted === true,
        });
      }

      if (timedOut) {
        throw new HttpError(504, {
          code: "QUERY_TIMEOUT",
          message: `The query exceeded the ${limits.timeoutMs} ms timeout`,
        });
      }

      const parsed = queryResultSchema.safeParse(raw);
      if (!parsed.success) {
        options.logger?.warn(
          { dataSourceId: record.id, issues: parsed.error.issues },
          "data-source plugin returned an invalid result",
        );
        throw new HttpError(500, {
          code: "INTERNAL",
          message: "The data source returned an invalid result",
        });
      }

      const limited = enforceResultLimits(parsed.data, limits);
      outcome = limited.meta.truncated ? "truncated" : "ok";
      return {
        ...limited,
        meta: {
          ...limited.meta,
          executionTimeMs: Math.round((performance.now() - startedAt) * 100) / 100,
        },
      };
    } finally {
      this.metrics?.recordQuery(outcome);
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", forwardAbort);
      release();
    }
  }

  async validate(
    caller: QueryCaller,
    request: QueryRequest,
    options: Pick<ExecuteOptions, "requestId" | "logger">,
  ): Promise<ValidationResult> {
    const record = await this.loadSource(caller, request.dataSourceId);
    const plugin = this.pluginFor(record);
    const controller = new AbortController();
    const { context } = await this.buildContext(caller, record, plugin, {
      requestId: options.requestId,
      signal: controller.signal,
      logger: options.logger,
    });

    try {
      return await plugin.validate(request.query, context);
    } catch (error) {
      throw this.mapError(error, { timedOut: false, externallyAborted: false });
    }
  }

  async discover(
    caller: QueryCaller,
    dataSourceId: string,
    options: Pick<ExecuteOptions, "requestId" | "logger">,
  ): Promise<DiscoveredSource> {
    const record = await this.loadSource(caller, dataSourceId);
    const plugin = this.pluginFor(record);
    if (!plugin.discover) {
      throw new HttpError(501, {
        code: "NOT_IMPLEMENTED",
        message: `The "${record.kind}" connector does not support schema discovery`,
      });
    }

    const limits = resolveLimits(record.limits);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), limits.timeoutMs);
    const { context } = await this.buildContext(caller, record, plugin, {
      requestId: options.requestId,
      signal: controller.signal,
      logger: options.logger,
    });

    try {
      const datasets = await plugin.discover(context);
      return {
        dataSourceId: record.id,
        kind: record.kind,
        capabilities: plugin.capabilities,
        datasets,
      };
    } catch (error) {
      throw this.mapError(error, {
        timedOut: controller.signal.aborted,
        externallyAborted: false,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async test(
    caller: QueryCaller,
    dataSourceId: string,
    options: Pick<ExecuteOptions, "requestId" | "logger">,
  ): Promise<TestResult> {
    const record = await this.loadSource(caller, dataSourceId);
    const plugin = this.pluginFor(record);
    const limits = resolveLimits(record.limits);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), limits.timeoutMs);
    const { context } = await this.buildContext(caller, record, plugin, {
      requestId: options.requestId,
      signal: controller.signal,
      logger: options.logger,
    });

    try {
      const result = await plugin.test(context);
      if (record.id !== DEMO_DATA_SOURCE_ID) {
        await this.persistence.withTenant(this.scope(caller), () =>
          this.persistence.audit.record({
            organizationId: caller.organizationId,
            actorType: caller.actorType ?? "user",
            actorId: caller.actorId ?? caller.userId,
            action: "datasource.test",
            resourceType: "data_source",
            resourceId: record.id,
            metadata: { ok: result.ok },
            requestId: options.requestId,
          }),
        );
      }
      return result;
    } catch (error) {
      throw this.mapError(error, {
        timedOut: controller.signal.aborted,
        externallyAborted: false,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private mapError(
    error: unknown,
    state: { timedOut: boolean; externallyAborted: boolean },
  ): HttpError {
    if (error instanceof HttpError) return error;

    if (state.timedOut) {
      return new HttpError(504, {
        code: "QUERY_TIMEOUT",
        message: "The data source did not respond before the timeout",
      });
    }
    if (state.externallyAborted) {
      return new HttpError(408, {
        code: "CANCELLED",
        message: "The client cancelled the request",
      });
    }
    if (error instanceof DataSourceError) {
      return new HttpError(ERROR_STATUS[error.code], {
        code: error.code,
        message: error.message,
      });
    }

    return new HttpError(500, {
      code: "INTERNAL",
      message: "The data source failed unexpectedly",
    });
  }
}

export type { QueryDefinition };
