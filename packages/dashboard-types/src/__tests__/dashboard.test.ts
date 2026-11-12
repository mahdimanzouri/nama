import { describe, expect, it } from "vitest";

import {
  ISSUE_CODES,
  dashboardConfigSchema,
  dashboardDocumentSchema,
  parseDashboardConfig,
  type DashboardConfig,
} from "../index";
import {
  FILTER_ID,
  KPI_WIDGET_ID,
  LINE_WIDGET_ID,
  cloneConfig,
  createConfigWithWidgets,
  createValidConfig,
  generatedId,
  must,
} from "./fixtures";

function parseInvalid(mutate: (config: DashboardConfig) => void) {
  const config = cloneConfig(createValidConfig());
  mutate(config);
  return parseDashboardConfig(config);
}

function hasIssue(
  result: ReturnType<typeof parseDashboardConfig>,
  code: string,
  path: Array<string | number>,
): boolean {
  return (
    !result.ok &&
    result.issues.some(
      (issue) => issue.code === code && issue.path.join(".") === path.join("."),
    )
  );
}

function hasAnyIssueAt(
  result: ReturnType<typeof parseDashboardConfig>,
  path: Array<string | number>,
): boolean {
  return (
    !result.ok && result.issues.some((issue) => issue.path.join(".") === path.join("."))
  );
}

describe("parseDashboardConfig", () => {
  it("accepts the documented KPI and line examples", () => {
    const result = parseDashboardConfig(createValidConfig());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([]);
    expect(result.value.widgets).toHaveLength(2);
    expect(result.value.layouts.desktop.items).toHaveLength(2);
  });

  it("applies the documented settings default", () => {
    const config = cloneConfig(createValidConfig());
    config.settings = {} as DashboardConfig["settings"];

    const result = parseDashboardConfig(config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.settings.refreshInterval).toBe(60);
  });

  it("reports the field path for an invalid title", () => {
    const result = parseInvalid((config) => {
      config.metadata.title = "";
    });

    expect(hasAnyIssueAt(result, ["metadata", "title"])).toBe(true);
  });

  it("rejects a refresh interval between 1 and 4 seconds", () => {
    const result = parseInvalid((config) => {
      config.settings.refreshInterval = 3;
    });

    expect(hasAnyIssueAt(result, ["settings", "refreshInterval"])).toBe(true);
  });

  it("rejects an unknown IANA time zone", () => {
    const result = parseInvalid((config) => {
      config.settings.timezone = "Mars/Olympus";
    });

    expect(hasAnyIssueAt(result, ["settings", "timezone"])).toBe(true);
  });

  it("rejects duplicate widget identifiers", () => {
    const result = parseInvalid((config) => {
      must(config.widgets[1], "line widget").id = must(
        config.widgets[0],
        "kpi widget",
      ).id;
    });

    expect(hasIssue(result, ISSUE_CODES.duplicateWidgetId, ["widgets", 1, "id"])).toBe(
      true,
    );
  });

  it("rejects duplicate variable names", () => {
    const result = parseInvalid((config) => {
      config.variables.push({
        id: generatedId(500),
        name: "machineId",
        type: "string",
        defaultValue: "machine-02",
        bindings: [],
      });
    });

    expect(
      hasIssue(result, ISSUE_CODES.duplicateVariableName, ["variables", 1, "name"]),
    ).toBe(true);
  });

  it("rejects a defaultValue that does not match the variable type", () => {
    const result = parseInvalid((config) => {
      must(config.variables[0], "variable").defaultValue = 42;
    });

    expect(hasAnyIssueAt(result, ["variables", 0, "defaultValue"])).toBe(true);
  });

  it("rejects layout items that reference unknown widgets", () => {
    const result = parseInvalid((config) => {
      must(config.layouts.desktop.items[0], "first item").widgetId = generatedId(999);
    });

    expect(
      hasIssue(result, ISSUE_CODES.layoutUnknownWidget, [
        "layouts",
        "desktop",
        "items",
        0,
        "widgetId",
      ]),
    ).toBe(true);
  });

  it("rejects an item that overflows the desktop grid", () => {
    const result = parseInvalid((config) => {
      must(config.layouts.desktop.items[0], "first item").w = 13;
    });

    expect(hasAnyIssueAt(result, ["layouts", "desktop", "items", 0, "w"])).toBe(true);
  });

  it("rejects a widget positioned twice in one breakpoint", () => {
    const result = parseInvalid((config) => {
      config.layouts.desktop.items.push({
        widgetId: KPI_WIDGET_ID,
        x: 0,
        y: 10,
        w: 3,
        h: 4,
      });
    });

    expect(
      hasIssue(result, ISSUE_CODES.layoutDuplicateWidget, [
        "layouts",
        "desktop",
        "items",
        2,
        "widgetId",
      ]),
    ).toBe(true);
  });

  it("rejects a breakpoint with the wrong column count", () => {
    const result = parseInvalid((config) => {
      (config.layouts.tablet as { columns: number }).columns = 10;
    });

    expect(hasAnyIssueAt(result, ["layouts", "tablet", "columns"])).toBe(true);
  });

  it("rejects unknown top-level keys instead of silently dropping them", () => {
    const result = parseDashboardConfig({
      ...cloneConfig(createValidConfig()),
      unknownKey: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.code === "unrecognized_keys")).toBe(true);
  });

  it("rejects a schema version newer than supported", () => {
    const result = parseInvalid((config) => {
      (config as { schemaVersion: number }).schemaVersion = 2;
    });

    expect(
      hasIssue(result, ISSUE_CODES.unsupportedSchemaVersion, ["schemaVersion"]),
    ).toBe(true);
  });
});

describe("caps and warnings", () => {
  it("warns above 50 widgets without failing", () => {
    const result = parseDashboardConfig(createConfigWithWidgets(51));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      ISSUE_CODES.manyWidgets,
    ]);
  });

  it("rejects more than 100 widgets", () => {
    const result = parseDashboardConfig(createConfigWithWidgets(101));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.path.join(".") === "widgets")).toBe(true);
  });

  it("warns about a widget that is not positioned in any layout", () => {
    const result = parseInvalid((config) => {
      config.layouts.desktop.items = config.layouts.desktop.items.filter(
        (item) => item.widgetId !== LINE_WIDGET_ID,
      );
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: ISSUE_CODES.widgetNotLaidOut,
        path: ["widgets", 1],
      }),
    );
  });

  it("rejects a serialized configuration above 1 MiB", () => {
    const result = parseInvalid((config) => {
      must(config.widgets[0], "kpi widget").config = {
        valueField: "production",
        blob: "x".repeat(1_100_000),
      };
    });

    expect(hasIssue(result, ISSUE_CODES.configTooLarge, [])).toBe(true);
  });
});

describe("dashboardConfigSchema", () => {
  it("rejects an unknown widget field", () => {
    const config = cloneConfig(createValidConfig());
    const widget = must(config.widgets[0], "kpi widget") as unknown as Record<
      string,
      unknown
    >;
    widget.unexpected = true;

    const result = dashboardConfigSchema.safeParse(config);

    expect(result.success).toBe(false);
  });

  it("accepts a document without a published configuration", () => {
    const config = createValidConfig();
    const document = {
      id: generatedId(700),
      organizationId: generatedId(701),
      name: "Production overview",
      draftConfig: config,
      revision: 0,
      updatedAt: "2026-11-12T06:00:00Z",
    };

    expect(dashboardDocumentSchema.safeParse(document).success).toBe(true);
  });

  it("keeps the filter and variable identifiers distinct", () => {
    const config = createValidConfig();

    expect(config.filters[0]?.id).toBe(FILTER_ID);
    expect(config.widgets.map((widget) => widget.id)).toContain(KPI_WIDGET_ID);
  });
});
