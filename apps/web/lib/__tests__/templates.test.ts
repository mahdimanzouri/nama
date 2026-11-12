import { describe, expect, it } from "vitest";
import {
  BREAKPOINT_COLUMNS,
  parseDashboardConfig,
  type Breakpoint,
  type DashboardConfig,
} from "@nama/dashboard-types";

import { DASHBOARD_TEMPLATES, findTemplate } from "../templates";

const BREAKPOINTS: readonly Breakpoint[] = ["desktop", "tablet", "mobile"];

function assertTemplate(templateId: string, title: string): DashboardConfig {
  const template = findTemplate(templateId);
  expect(template).toBeDefined();

  const config = template!.create(title);
  const parsed = parseDashboardConfig(config);

  expect(parsed.ok).toBe(true);
  expect(parsed.warnings).toEqual([]);
  return config;
}

describe("dashboard templates", () => {
  it("ships at least two distinct templates", () => {
    expect(DASHBOARD_TEMPLATES.length).toBeGreaterThanOrEqual(2);
    expect(new Set(DASHBOARD_TEMPLATES.map((entry) => entry.id)).size).toBe(
      DASHBOARD_TEMPLATES.length,
    );
  });

  it.each(DASHBOARD_TEMPLATES.map((template) => [template.id] as const))(
    "%s produces a valid configuration for the requested title",
    (templateId) => {
      const config = assertTemplate(templateId, "Created from template");

      expect(config.metadata.title).toBe("Created from template");
      expect(config.widgets.length).toBeGreaterThan(0);
      expect(config.variables.some((variable) => variable.name === "focus")).toBe(true);
    },
  );

  it("positions every widget within each breakpoint's columns", () => {
    for (const template of DASHBOARD_TEMPLATES) {
      const config = template.create(template.name);

      for (const breakpoint of BREAKPOINTS) {
        const layout = config.layouts[breakpoint];
        expect(layout.columns).toBe(BREAKPOINT_COLUMNS[breakpoint]);
        expect(layout.items).toHaveLength(config.widgets.length);

        for (const item of layout.items) {
          expect(item.x + item.w).toBeLessThanOrEqual(layout.columns);
          expect(config.widgets.some((widget) => widget.id === item.widgetId)).toBe(true);
        }
      }
    }
  });

  it("mints fresh widget and variable ids for every creation", () => {
    const first = assertTemplate("operations", "First");
    const second = assertTemplate("operations", "Second");

    expect(first.widgets.map((widget) => widget.id)).not.toEqual(
      second.widgets.map((widget) => widget.id),
    );
    expect(first.variables.map((variable) => variable.id)).not.toEqual(
      second.variables.map((variable) => variable.id),
    );
  });

  it("binds every template query to the always-available demo source", () => {
    for (const template of DASHBOARD_TEMPLATES) {
      const config = template.create(template.name);
      for (const widget of config.widgets) {
        expect(widget.dataSourceId).toBe("demo-source");
        expect(widget.query).toBeDefined();
      }
    }
  });

  it("uses the contains-empty filter so a selection narrows without hiding data", () => {
    const config = assertTemplate("operations", "Filtered");
    const timestampFilter = config.filters.find((filter) => filter.field === "timestamp");

    expect(timestampFilter).toEqual({
      id: expect.any(String),
      field: "timestamp",
      operator: "contains",
      value: "",
    });
  });
});
