import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ISSUE_CODES, type DashboardWidget } from "@nama/dashboard-types";

import { WidgetRegistrationError } from "../errors";
import { resolveWidgetConfig, type ErasedWidgetPlugin } from "../plugin";
import { createWidgetRegistry } from "../registry";

const kpiSchema = z.object({ label: z.string(), prefix: z.string().optional() });

function createPlugin(overrides: Partial<ErasedWidgetPlugin> = {}): ErasedWidgetPlugin {
  return {
    manifest: { id: "@acme/kpi", version: "1.0.0", name: "KPI" },
    configVersion: 1,
    configSchema: kpiSchema,
    defaultConfig: { label: "Revenue" },
    defaultSize: { w: 3, h: 4 },
    component: () => null,
    ...overrides,
  };
}

function createWidget(overrides: Partial<DashboardWidget> = {}): DashboardWidget {
  return {
    id: "widget-1",
    type: "@acme/kpi",
    configVersion: 1,
    title: "Revenue",
    config: { label: "Revenue" },
    ...overrides,
  };
}

describe("widget registry", () => {
  it("registers a valid plugin and lists its manifest", () => {
    const registry = createWidgetRegistry([createPlugin()]);

    expect(registry.has("@acme/kpi")).toBe(true);
    expect(registry.get("@acme/kpi")?.configVersion).toBe(1);
    expect(registry.list()).toEqual([createPlugin().manifest]);
  });

  it("rejects a plugin whose manifest is invalid", () => {
    const registry = createWidgetRegistry();
    const plugin = createPlugin({
      manifest: { id: "Not Scoped", version: "1.0", name: "" },
    });

    expect(() => registry.register(plugin)).toThrow(WidgetRegistrationError);
    expect(registry.has("Not Scoped")).toBe(false);
  });

  it("rejects a plugin whose default config does not match its schema", () => {
    const registry = createWidgetRegistry();
    const plugin = createPlugin({ defaultConfig: { prefix: "#" } });

    try {
      registry.register(plugin);
      throw new Error("expected registration to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(WidgetRegistrationError);
      const issues = (error as WidgetRegistrationError).issues;
      expect(issues[0]?.path).toEqual(["defaultConfig", "label"]);
    }
  });

  it("rejects configVersion zero and non-positive sizes", () => {
    const registry = createWidgetRegistry();
    const plugin = createPlugin({ configVersion: 0, defaultSize: { w: 0, h: -1 } });

    try {
      registry.register(plugin);
      throw new Error("expected registration to fail");
    } catch (error) {
      const codes = (error as WidgetRegistrationError).issues.map((issue) => issue.code);
      expect(codes).toContain(ISSUE_CODES.invalidWidgetPlugin);
    }
  });

  it("rejects duplicate types unless the host replaces them", () => {
    const registry = createWidgetRegistry([createPlugin()]);

    expect(() => registry.register(createPlugin())).toThrow(WidgetRegistrationError);

    const replacement = createPlugin({
      manifest: { id: "@acme/kpi", version: "2.0.0", name: "KPI v2" },
    });
    registry.register(replacement, { replace: true });

    expect(registry.list()).toEqual([replacement.manifest]);
  });

  it("unregister removes a plugin and is idempotent", () => {
    const registry = createWidgetRegistry([createPlugin()]);

    registry.unregister("@acme/kpi");
    registry.unregister("@acme/kpi");

    expect(registry.has("@acme/kpi")).toBe(false);
    expect(registry.list()).toEqual([]);
  });

  it("does not let hosts mutate the registered manifest", () => {
    const plugin = createPlugin();
    const registry = createWidgetRegistry([plugin]);

    plugin.manifest.name = "changed";

    expect(registry.get("@acme/kpi")?.manifest.name).toBe("KPI");
  });
});

describe("widget config resolution", () => {
  it("reports an unknown type when no plugin is registered", () => {
    expect(resolveWidgetConfig(undefined, createWidget())).toEqual({
      status: "unknownType",
    });
  });

  it("validates a current config", () => {
    const resolved = resolveWidgetConfig(createPlugin(), createWidget());

    expect(resolved).toEqual({ status: "ready", config: { label: "Revenue" } });
  });

  it("rejects a config newer than the plugin supports", () => {
    const resolved = resolveWidgetConfig(
      createPlugin(),
      createWidget({ configVersion: 2 }),
    );

    expect(resolved).toEqual({
      status: "unsupportedVersion",
      fromVersion: 2,
      supportedVersion: 1,
    });
  });

  it("migrates an older config through the plugin migration", () => {
    const plugin = createPlugin({
      configVersion: 2,
      migrate: (config) => ({ ...(config as { label: string }), prefix: "$" }),
    });

    const resolved = resolveWidgetConfig(plugin, createWidget({ configVersion: 1 }));

    expect(resolved).toEqual({
      status: "ready",
      config: { label: "Revenue", prefix: "$" },
    });
  });

  it("reports an unsupported version when no migration exists", () => {
    const plugin = createPlugin({ configVersion: 2 });

    const resolved = resolveWidgetConfig(plugin, createWidget({ configVersion: 1 }));

    expect(resolved.status).toBe("unsupportedVersion");
  });

  it("reports invalid config after a failed migration", () => {
    const plugin = createPlugin({
      configVersion: 2,
      migrate: () => {
        throw new Error("cannot migrate");
      },
    });

    const resolved = resolveWidgetConfig(plugin, createWidget({ configVersion: 1 }));

    expect(resolved).toEqual({
      status: "invalidConfig",
      issues: [
        {
          code: ISSUE_CODES.widgetMigrationFailed,
          path: [],
          message: "cannot migrate",
        },
      ],
    });
  });

  it("reports invalid config that fails schema validation", () => {
    const resolved = resolveWidgetConfig(
      createPlugin(),
      createWidget({ config: { label: 42 } }),
    );

    expect(resolved.status).toBe("invalidConfig");
  });
});
