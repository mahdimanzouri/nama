import { describe, expect, it } from "vitest";
import {
  dashboardConfigSchema,
  dashboardWidgetSchema,
  parseDashboardConfig,
  type DashboardConfig,
} from "@nama/dashboard-types";

import {
  addWidgetToConfig,
  createEmptyConfig,
  createWidget,
  desktopItemFor,
  moveWidgetInConfig,
  removeWidgetFromConfig,
  resizeWidgetInConfig,
  type WidgetPreset,
} from "../dashboard-config";

function addPreset(config: DashboardConfig, preset: WidgetPreset) {
  const { widget, size } = createWidget(preset);
  return { config: addWidgetToConfig(config, widget, size), widget };
}

function editorConfig(): DashboardConfig {
  let config = createEmptyConfig("Operations");
  config = addPreset(config, "kpi").config;
  config = addPreset(config, "line").config;
  return config;
}

describe("createEmptyConfig", () => {
  it("produces a configuration that passes the persisted schema", () => {
    const config = createEmptyConfig("Operations");

    expect(dashboardConfigSchema.safeParse(config).success).toBe(true);
    expect(parseDashboardConfig(config)).toMatchObject({ ok: true });
    expect(config.layouts.tablet.items).toHaveLength(0);
    expect(config.layouts.mobile.items).toHaveLength(0);
  });
});

describe("createWidget", () => {
  it("produces persisted widgets for both demo presets", () => {
    for (const preset of ["kpi", "line"] as const) {
      const { widget } = createWidget(preset);

      expect(dashboardWidgetSchema.safeParse(widget).success).toBe(true);
      expect(widget.dataSourceId).toBe("demo-source");
      expect(widget.configVersion).toBe(1);
    }
  });
});

describe("layout editing", () => {
  it("packs a KPI and a line chart side by side on the desktop grid", () => {
    const config = editorConfig();

    expect(dashboardConfigSchema.safeParse(config).success).toBe(true);
    expect(config.layouts.desktop.items).toHaveLength(2);
    expect(config.layouts.desktop.items[0]).toMatchObject({ x: 0, y: 0, w: 3, h: 5 });
    expect(config.layouts.desktop.items[1]).toMatchObject({ x: 3, y: 0, w: 9, h: 5 });
  });

  it("places further widgets below existing rows", () => {
    const base = editorConfig();
    const { config, widget } = addPreset(base, "kpi");
    const item = desktopItemFor(config, widget.id);

    expect(item).toBeDefined();
    expect(item?.y).toBeGreaterThanOrEqual(5);
    expect(parseDashboardConfig(config)).toMatchObject({ ok: true });
  });

  it("removes the widget from the list and every layout", () => {
    let config = editorConfig();
    const [first] = config.widgets;
    expect(first).toBeDefined();

    config = removeWidgetFromConfig(config, first!.id);

    expect(config.widgets.map((widget) => widget.id)).not.toContain(first!.id);
    for (const breakpoint of ["desktop", "tablet", "mobile"] as const) {
      expect(
        config.layouts[breakpoint].items.some((item) => item.widgetId === first!.id),
      ).toBe(false);
    }
    expect(parseDashboardConfig(config)).toMatchObject({ ok: true });
  });

  it("clamps moves to the grid and never to a negative row", () => {
    const base = editorConfig();
    const kpi = base.widgets[0]!;
    const line = base.widgets[1]!;

    const movedLeft = moveWidgetInConfig(base, kpi.id, -5, 3);
    expect(desktopItemFor(movedLeft, kpi.id)).toMatchObject({ x: 0, y: 3 });

    const movedRight = moveWidgetInConfig(base, line.id, 5, 0);
    expect(desktopItemFor(movedRight, line.id)?.x).toBe(3);
    expect(dashboardConfigSchema.safeParse(movedRight).success).toBe(true);
  });

  it("clamps resize to the columns and the minimum height", () => {
    const base = editorConfig();
    const kpi = base.widgets[0]!;
    const line = base.widgets[1]!;

    const wider = resizeWidgetInConfig(base, kpi.id, 20, 0);
    expect(desktopItemFor(wider, kpi.id)?.w).toBe(12);

    const narrower = resizeWidgetInConfig(base, line.id, -20, 0);
    expect(desktopItemFor(narrower, line.id)?.w).toBe(1);

    const shorter = resizeWidgetInConfig(base, kpi.id, 0, -20);
    expect(desktopItemFor(shorter, kpi.id)?.h).toBe(2);
    expect(dashboardConfigSchema.safeParse(shorter).success).toBe(true);
  });
});
