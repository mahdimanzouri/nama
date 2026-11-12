import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  createDataSourcePluginRegistry,
  DataSourcePluginRegistrationError,
  ISSUE_CODES,
  validateDataSourcePlugin,
  type PluginContext,
  type ServerDataSourcePlugin,
} from "../index";

function createPlugin(
  overrides: Partial<ServerDataSourcePlugin> = {},
): ServerDataSourcePlugin {
  return {
    kind: "memory",
    manifest: { version: "1.0.0", name: "In-memory rows" },
    capabilities: { test: true, execute: true },
    configSchema: z.object({}),
    async test() {
      return { ok: true, latencyMs: 0 };
    },
    async validate() {
      return { valid: true, issues: [] };
    },
    async execute(request) {
      return {
        queryId: request.queryId,
        columns: [],
        rows: [],
        timestamp: "2026-11-12T00:00:00.000Z",
        meta: { rowCount: 0, truncated: false, executionTimeMs: 0, cached: false },
      };
    },
    ...overrides,
  } as ServerDataSourcePlugin;
}

const context = {} as PluginContext;

describe("validateDataSourcePlugin", () => {
  it("accepts a plugin that matches its declared capabilities", () => {
    expect(validateDataSourcePlugin(createPlugin())).toEqual([]);
  });

  it("accepts discovery only when the capability is declared", () => {
    const plugin = createPlugin({
      capabilities: { test: true, execute: true, schemaDiscovery: true },
      async discover() {
        return [{ name: "rows", fields: [{ name: "value", type: "number" }] }];
      },
    });

    expect(validateDataSourcePlugin(plugin)).toEqual([]);
  });

  it("rejects a discovery capability with no discover()", () => {
    const issues = validateDataSourcePlugin(
      createPlugin({
        capabilities: { test: true, execute: true, schemaDiscovery: true },
      }),
    );

    expect(issues.map((entry) => entry.path.join("."))).toContain(
      "capabilities.schemaDiscovery",
    );
  });

  it("rejects discover() when schemaDiscovery is not declared", () => {
    const issues = validateDataSourcePlugin(
      createPlugin({
        async discover() {
          return [];
        },
      }),
    );

    expect(issues.map((entry) => entry.message)).toContain(
      "discover() is implemented but schemaDiscovery is not declared",
    );
  });

  it("rejects an invalid manifest and missing methods", () => {
    const issues = validateDataSourcePlugin(
      createPlugin({
        kind: "Memory",
        manifest: { version: "1", name: "" },
        execute: undefined as unknown as ServerDataSourcePlugin["execute"],
        configSchema: {} as ServerDataSourcePlugin["configSchema"],
      }),
    );
    const paths = issues.map((entry) => entry.path.join("."));

    expect(paths).toEqual(expect.arrayContaining(["kind", "version", "name"]));
    expect(paths).toEqual(expect.arrayContaining(["execute", "configSchema"]));
    expect(
      issues.some((entry) => entry.code === ISSUE_CODES.invalidDataSourcePlugin),
    ).toBe(true);
  });

  it("rejects a non-object plugin", () => {
    const issues = validateDataSourcePlugin(null as unknown as ServerDataSourcePlugin);

    expect(issues[0]?.code).toBe(ISSUE_CODES.invalidDataSourcePlugin);
  });
});

describe("createDataSourcePluginRegistry", () => {
  it("registers an initial plugin and exposes its manifest", () => {
    const registry = createDataSourcePluginRegistry([createPlugin()]);

    expect(registry.has("memory")).toBe(true);
    expect(registry.list()).toEqual([
      {
        kind: "memory",
        version: "1.0.0",
        name: "In-memory rows",
        capabilities: { test: true, execute: true },
      },
    ]);
  });

  it("rejects a duplicate kind unless replacement is explicit", () => {
    const registry = createDataSourcePluginRegistry([createPlugin()]);

    expect(() => registry.register(createPlugin())).toThrow(
      DataSourcePluginRegistrationError,
    );
    expect(() => registry.register(createPlugin())).toThrow(/already registered/u);

    const replacement = createPlugin({ manifest: { version: "2.0.0", name: "v2" } });
    registry.register(replacement, { replace: true });

    expect(registry.get("memory")?.manifest.version).toBe("2.0.0");
    expect(registry.list()).toHaveLength(1);
  });

  it("throws for an invalid plugin and keeps the registry unchanged", () => {
    const registry = createDataSourcePluginRegistry();

    expect(() => registry.register(createPlugin({ kind: "Memory" }))).toThrow(
      DataSourcePluginRegistrationError,
    );
    expect(registry.has("Memory")).toBe(false);
    expect(registry.list()).toEqual([]);
  });

  it("unregisters by kind", () => {
    const registry = createDataSourcePluginRegistry([createPlugin()]);
    registry.unregister("memory");

    expect(registry.get("memory")).toBeUndefined();
  });

  it("exposes a context shape plugins can execute against", async () => {
    const result = await createPlugin().execute(
      { queryId: "q", query: { queryId: "q", fields: ["value"] }, parameters: {} },
      context,
    );

    expect(result.queryId).toBe("q");
  });
});
