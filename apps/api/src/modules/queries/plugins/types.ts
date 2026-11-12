import type {
  QueryColumn,
  QueryDefinition,
  QueryErrorCode,
  QueryResult,
} from "@nama/dashboard-types";
import type { ZodType } from "zod";

export interface DataSourceLimits {
  timeoutMs: number;
  maxRows: number;
  maxBytes: number;
  maxConcurrent: number;
}

export interface DatasetSchema {
  name: string;
  fields: QueryColumn[];
}

export interface TestResult {
  ok: boolean;
  latencyMs: number;
  message?: string;
}

export interface ValidationIssue {
  path: Array<string | number>;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface PluginQueryRequest {
  queryId: string;
  query: QueryDefinition;
  parameters: Record<string, unknown>;
  timeRange?: { from: string; to: string };
}

export interface PluginLogger {
  warn(meta: Record<string, unknown>, message: string): void;
}

export interface PluginContext {
  organizationId: string;
  dataSourceId: string;
  requestId: string;
  /** Non-secret source configuration, already schema-validated. */
  config: Record<string, unknown>;
  /** Decrypted just in time; never logged or serialized. */
  credentials: () => Promise<Record<string, unknown>>;
  limits: DataSourceLimits;
  /** Test-only escape hatch for loopback fixtures; false outside tests. */
  allowPrivateNetwork: boolean;
  fetch: typeof globalThis.fetch;
  signal: AbortSignal;
  logger: PluginLogger;
}

/**
 * Stable connector failure. The query service maps it to the HTTP error
 * envelope without leaking connection details.
 */
export class DataSourceError extends Error {
  readonly code: QueryErrorCode;

  constructor(code: QueryErrorCode, message: string) {
    super(message);
    this.name = "DataSourceError";
    this.code = code;
  }
}

export interface ServerDataSourcePlugin {
  kind: string;
  manifest: { version: string; name: string };
  capabilities: {
    test: boolean;
    execute: boolean;
    stream?: boolean;
    rawSql?: boolean;
    schemaDiscovery?: boolean;
  };
  configSchema: ZodType;
  credentialSchema?: ZodType;
  test(context: PluginContext): Promise<TestResult>;
  validate(query: QueryDefinition, context: PluginContext): Promise<ValidationResult>;
  execute(request: PluginQueryRequest, context: PluginContext): Promise<QueryResult>;
  discover?(context: PluginContext): Promise<DatasetSchema[]>;
}
