import { describe, expect, it } from "vitest";

import {
  DASHBOARD_EXPORT_KIND,
  ISSUE_CODES,
  dashboardConfigSchema,
  exportDashboardConfig,
  importDashboardConfig,
  type DashboardConfig,
} from "../index";
import {
  FILTER_ID,
  KPI_WIDGET_ID,
  LINE_WIDGET_ID,
  VARIABLE_ID,
  cloneConfig,
  createValidConfig,
} from "./fixtures";

const OPTIONS = { applicationVersion: "0.1.0", exportedAt: "2026-11-12T06:00:00Z" };

describe("dashboard transfer", () => {
  it("round-trips a configuration without changing it", () => {
    const config = createValidConfig();
    const envelope = exportDashboardConfig(config, OPTIONS);
    const result = importDashboardConfig(envelope, { regenerateIds: false });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(config);
  });

  it("regenerates widget, variable and filter ids and rewrites layout references", () => {
    const config = createValidConfig();
    const result = importDashboardConfig(exportDashboardConfig(config, OPTIONS));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const widgetIds = result.value.widgets.map((widget) => widget.id);
    expect(widgetIds).not.toContain(KPI_WIDGET_ID);
    expect(widgetIds).not.toContain(LINE_WIDGET_ID);
    expect(new Set(widgetIds).size).toBe(widgetIds.length);
    expect(result.value.variables[0]?.id).not.toBe(VARIABLE_ID);
    expect(result.value.filters[0]?.id).not.toBe(FILTER_ID);

    const laidOut = new Set(
      result.value.layouts.desktop.items.map((item) => item.widgetId),
    );
    expect(laidOut).toEqual(new Set(widgetIds));
  });

  it("preserves widgets of unknown types", () => {
    const config = cloneConfig(createValidConfig());
    config.widgets.push({
      id: "0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b25",
      type: "third-party-map",
      configVersion: 3,
      title: "Map",
      config: { layer: "roads" },
    });

    const result = importDashboardConfig(exportDashboardConfig(config, OPTIONS));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.widgets.map((widget) => widget.type)).toContain(
        "third-party-map",
      );
    }
  });

  it("rejects a document that is not an envelope", () => {
    const result = importDashboardConfig(createValidConfig());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.path).toContain("kind");
  });

  it("rejects a configuration newer than the supported schema", () => {
    const config = createValidConfig();
    const envelope = {
      ...exportDashboardConfig(config, OPTIONS),
      config: { ...config, schemaVersion: 2 },
    };

    const result = importDashboardConfig(envelope);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.code).toBe(ISSUE_CODES.unsupportedSchemaVersion);
    }
  });

  it("reports cap violations from the imported configuration", () => {
    const config = createValidConfig();
    const envelope = {
      ...exportDashboardConfig(config, OPTIONS),
      kind: DASHBOARD_EXPORT_KIND,
      config: { ...config, widgets: [...config.widgets, ...config.widgets] },
    };

    const result = importDashboardConfig(envelope);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some((issue) => issue.code === ISSUE_CODES.duplicateWidgetId),
      ).toBe(true);
    }
  });
});

describe("widget interaction", () => {
  it("accepts a variable name on a widget", () => {
    const config: DashboardConfig = cloneConfig(createValidConfig());
    const widget = config.widgets[1];
    if (!widget) throw new Error("fixture missing line widget");
    widget.interaction = { variable: "machineId" };

    expect(dashboardConfigSchema.safeParse(config).success).toBe(true);
  });

  it("rejects a variable name that is not an identifier", () => {
    const config = cloneConfig(createValidConfig());
    const widget = config.widgets[1];
    if (!widget) throw new Error("fixture missing line widget");
    widget.interaction = { variable: "machine id" };

    expect(dashboardConfigSchema.safeParse(config).success).toBe(false);
  });
});
