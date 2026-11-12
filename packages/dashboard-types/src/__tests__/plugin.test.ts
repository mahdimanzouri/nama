import { describe, expect, it } from "vitest";

import {
  dataSourcePluginManifestSchema,
  pluginIdSchema,
  semverSchema,
  widgetCapabilitiesSchema,
  widgetManifestSchema,
} from "../index";

describe("widget manifests", () => {
  it("accepts the documented KPI manifest", () => {
    const result = widgetManifestSchema.safeParse({
      id: "@nama/kpi",
      version: "1.0.0",
      name: "KPI",
      description: "Single-value stat card",
    });

    expect(result.success).toBe(true);
  });

  it("accepts an unscoped identifier", () => {
    expect(pluginIdSchema.safeParse("gauge").success).toBe(true);
  });

  it("rejects uppercase identifiers", () => {
    expect(pluginIdSchema.safeParse("@Nama/KPI").success).toBe(false);
  });

  it("rejects a version that is not semantic", () => {
    expect(semverSchema.safeParse("1.0").success).toBe(false);
    expect(semverSchema.safeParse("1.0.0").success).toBe(true);
    expect(semverSchema.safeParse("1.0.0-rc.1+build.5").success).toBe(true);
  });

  it("rejects unknown manifest fields", () => {
    const result = widgetManifestSchema.safeParse({
      id: "kpi",
      version: "1.0.0",
      name: "KPI",
      configVersion: 1,
    });

    expect(result.success).toBe(false);
  });

  it("accepts the three documented capabilities", () => {
    const result = widgetCapabilitiesSchema.safeParse({
      realtime: true,
      export: false,
      filters: true,
    });

    expect(result.success).toBe(true);
  });
});

describe("data-source plugin manifests", () => {
  it("accepts a REST connector", () => {
    const result = dataSourcePluginManifestSchema.safeParse({
      kind: "rest",
      version: "1.0.0",
      name: "REST connector",
      capabilities: { test: true, execute: true },
    });

    expect(result.success).toBe(true);
  });

  it("accepts a streaming SQL connector", () => {
    const result = dataSourcePluginManifestSchema.safeParse({
      kind: "postgres",
      version: "1.2.3",
      name: "PostgreSQL",
      capabilities: {
        test: true,
        execute: true,
        stream: true,
        rawSql: true,
        schemaDiscovery: true,
      },
    });

    expect(result.success).toBe(true);
  });

  it("requires test and execute capabilities", () => {
    const result = dataSourcePluginManifestSchema.safeParse({
      kind: "mqtt",
      version: "0.1.0",
      name: "MQTT",
      capabilities: { stream: true },
    });

    expect(result.success).toBe(false);
  });

  it("rejects an uppercase connector kind", () => {
    const result = dataSourcePluginManifestSchema.safeParse({
      kind: "REST",
      version: "1.0.0",
      name: "REST connector",
      capabilities: { test: true, execute: true },
    });

    expect(result.success).toBe(false);
  });
});
