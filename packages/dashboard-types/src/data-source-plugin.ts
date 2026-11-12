import type { ZodType } from "zod";

import { ISSUE_CODES, issuesFromZod, type ValidationIssue } from "./errors";
import { dataSourcePluginManifestSchema, type DataSourcePluginManifest } from "./plugin";
import type { QueryColumn, QueryDefinition, QueryErrorCode, QueryResult } from "./query";

/**
 * Public contract for server-side data-source plugins. The API executes these
 * plugins; the browser never loads them. The normative description lives in
 * `docs/plugins/data-source-plugin-contract.md`.
 */

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

export interface DataSourceValidationIssue {
  path: Array<string | number>;
  message: string;
}

export interface DataSourceValidationResult {
  valid: boolean;
  issues: DataSourceValidationIssue[];
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
  /** Stable connector kind, e.g. `rest`, `static`. */
  kind: string;
  manifest: { version: string; name: string };
  capabilities: {
    test: boolean;
    execute: boolean;
    stream?: boolean;
    rawSql?: boolean;
    schemaDiscovery?: boolean;
  };
  /** Non-secret connection configuration. */
  configSchema: ZodType;
  /** Secret credential shape; stored encrypted, never returned. */
  credentialSchema?: ZodType;
  test(context: PluginContext): Promise<TestResult>;
  validate(
    query: QueryDefinition,
    context: PluginContext,
  ): Promise<DataSourceValidationResult>;
  execute(request: PluginQueryRequest, context: PluginContext): Promise<QueryResult>;
  discover?(context: PluginContext): Promise<DatasetSchema[]>;
}

function issue(
  code: string,
  path: Array<string | number>,
  message: string,
): ValidationIssue {
  return { code, path, message };
}

function isZodType(value: unknown): value is ZodType {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { safeParse?: unknown }).safeParse === "function"
  );
}

/**
 * Validates a plugin's manifest, schemas, required methods and capability
 * declarations. A plugin whose capabilities promise a method it does not
 * implement, or implement a discovery method it does not declare, is rejected
 * instead of failing at the first request.
 */
export function validateDataSourcePlugin(
  plugin: ServerDataSourcePlugin,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (typeof plugin !== "object" || plugin === null) {
    return [
      issue(
        ISSUE_CODES.invalidDataSourcePlugin,
        [],
        "plugin must be an object implementing ServerDataSourcePlugin",
      ),
    ];
  }

  const manifest = dataSourcePluginManifestSchema.safeParse({
    kind: plugin.kind,
    version: plugin.manifest?.version,
    name: plugin.manifest?.name,
    capabilities: plugin.capabilities,
  });
  if (!manifest.success) {
    issues.push(...issuesFromZod(manifest.error));
  }

  if (!isZodType(plugin.configSchema)) {
    issues.push(
      issue(
        ISSUE_CODES.invalidDataSourcePlugin,
        ["configSchema"],
        "configSchema must be a Zod schema",
      ),
    );
  }

  if (plugin.credentialSchema !== undefined && !isZodType(plugin.credentialSchema)) {
    issues.push(
      issue(
        ISSUE_CODES.invalidDataSourcePlugin,
        ["credentialSchema"],
        "credentialSchema must be a Zod schema when present",
      ),
    );
  }

  for (const method of ["test", "validate", "execute"] as const) {
    if (typeof plugin[method] !== "function") {
      issues.push(
        issue(
          ISSUE_CODES.invalidDataSourcePlugin,
          [method],
          `plugin must implement ${method}()`,
        ),
      );
    }
  }

  const discovered = typeof plugin.discover === "function";
  if (plugin.capabilities?.schemaDiscovery === true && !discovered) {
    issues.push(
      issue(
        ISSUE_CODES.invalidDataSourcePlugin,
        ["capabilities", "schemaDiscovery"],
        "schemaDiscovery is declared but discover() is not implemented",
      ),
    );
  }
  if (plugin.capabilities?.schemaDiscovery !== true && discovered) {
    issues.push(
      issue(
        ISSUE_CODES.invalidDataSourcePlugin,
        ["capabilities", "schemaDiscovery"],
        "discover() is implemented but schemaDiscovery is not declared",
      ),
    );
  }

  return issues;
}

export function dataSourcePluginManifestOf(
  plugin: ServerDataSourcePlugin,
): DataSourcePluginManifest {
  return dataSourcePluginManifestSchema.parse({
    kind: plugin.kind,
    version: plugin.manifest.version,
    name: plugin.manifest.name,
    capabilities: plugin.capabilities,
  });
}

/** A data-source plugin failed manifest, schema or capability validation. */
export class DataSourcePluginRegistrationError extends Error {
  readonly code = "DATA_SOURCE_PLUGIN_REGISTRATION_FAILED" as const;

  constructor(
    readonly kind: string,
    readonly issues: ValidationIssue[],
  ) {
    super(
      `Data-source plugin ${kind} is invalid: ${issues
        .map((entry) => entry.message)
        .join("; ")}`,
    );
    this.name = "DataSourcePluginRegistrationError";
  }
}

export interface RegisterDataSourcePluginOptions {
  /** Replaces a plugin registered under the same kind. */
  replace?: boolean;
}

export interface DataSourcePluginRegistry {
  register(
    plugin: ServerDataSourcePlugin,
    options?: RegisterDataSourcePluginOptions,
  ): void;
  unregister(kind: string): void;
  get(kind: string): ServerDataSourcePlugin | undefined;
  list(): DataSourcePluginManifest[];
  has(kind: string): boolean;
}

/**
 * Explicit registration validated against the public contract. Installing a
 * plugin is a trust decision, so there is no discovery or remote loading.
 */
export function createDataSourcePluginRegistry(
  initial: readonly ServerDataSourcePlugin[] = [],
): DataSourcePluginRegistry {
  const plugins = new Map<string, ServerDataSourcePlugin>();

  function register(
    plugin: ServerDataSourcePlugin,
    options: RegisterDataSourcePluginOptions = {},
  ): void {
    const kind = typeof plugin?.kind === "string" ? plugin.kind : "<invalid>";
    const issues = validateDataSourcePlugin(plugin);

    if (issues.length > 0) {
      throw new DataSourcePluginRegistrationError(kind, issues);
    }

    if (plugins.has(kind) && !options.replace) {
      throw new DataSourcePluginRegistrationError(kind, [
        issue(
          ISSUE_CODES.duplicateDataSourceKind,
          ["kind"],
          `data-source kind "${kind}" is already registered`,
        ),
      ]);
    }

    plugins.set(kind, plugin);
  }

  for (const plugin of initial) {
    register(plugin);
  }

  return {
    register,
    unregister(kind) {
      plugins.delete(kind);
    },
    get(kind) {
      return plugins.get(kind);
    },
    list() {
      return [...plugins.values()].map(dataSourcePluginManifestOf);
    },
    has(kind) {
      return plugins.has(kind);
    },
  };
}
