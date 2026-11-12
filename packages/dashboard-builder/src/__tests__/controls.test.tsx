import { describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { z } from "zod";
import { defineWidget, type ErasedWidgetPlugin } from "@nama/dashboard-core";
import type {
  DashboardConfig,
  DashboardControlValues,
  DashboardVariable,
} from "@nama/dashboard-types";

import { DashboardControls } from "../controls";
import { DashboardProvider } from "../provider";
import { DashboardViewer } from "../viewer";
import { createConfig, createKpiWidget, staticAdapter } from "./fixtures";

const probeConfigSchema = z.object({ label: z.string() });

const probePlugin: ErasedWidgetPlugin = defineWidget({
  manifest: { id: "probe", version: "1.0.0", name: "Probe" },
  configVersion: 1,
  configSchema: probeConfigSchema,
  defaultConfig: { label: "Probe" },
  defaultSize: { w: 4, h: 4 },
  component: ({ config, filters, onSelect }) => (
    <div
      data-testid="probe"
      data-selectable={onSelect ? "yes" : "no"}
      data-region={String(filters.region ?? "")}
    >
      {config.label}
    </div>
  ),
});

function variable(id: string, entry: Omit<DashboardVariable, "id">): DashboardVariable {
  return { id, ...entry };
}

function createControlsConfig(): DashboardConfig {
  const visible = createKpiWidget({
    type: "probe",
    title: "Visible probe",
    config: { label: "Visible probe" },
    query: { queryId: "probe-query", fields: ["region"], limit: 1 },
    interaction: { variable: "region" },
  });
  const hidden = createKpiWidget({
    id: "0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b22",
    type: "probe",
    title: "Hidden probe",
    config: { label: "Hidden probe" },
    query: { queryId: "probe-query", fields: ["region"], limit: 1 },
    visibility: { enabled: true, condition: "minValue > 10" },
  });

  return {
    ...createConfig([visible, hidden]),
    variables: [
      variable("0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b31", {
        name: "region",
        type: "string",
        defaultValue: "all",
        bindings: [{ target: "filter.value", parameter: "region" }],
      }),
      variable("0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b32", {
        name: "minValue",
        type: "number",
        defaultValue: 5,
        bindings: [],
      }),
      variable("0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b33", {
        name: "compare",
        type: "boolean",
        defaultValue: false,
        bindings: [],
      }),
      variable("0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b34", {
        name: "day",
        type: "date",
        defaultValue: "2026-11-12",
        bindings: [],
      }),
      variable("0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b35", {
        name: "window",
        type: "timeRange",
        defaultValue: {
          from: "2026-11-11T00:00:00.000Z",
          to: "2026-11-12T00:00:00.000Z",
        },
        bindings: [{ target: "query.timeRange", parameter: "window" }],
      }),
    ],
    filters: [
      {
        id: "0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b41",
        field: "region",
        operator: "eq",
        value: "all",
      },
    ],
  };
}

function render(
  children: ReactNode,
  options: {
    config?: DashboardConfig;
    initialControls?: Partial<DashboardControlValues>;
  } = {},
): string {
  return renderToStaticMarkup(
    <DashboardProvider
      config={options.config ?? createControlsConfig()}
      locale="en"
      direction="ltr"
      theme="light"
      dataAdapter={staticAdapter}
      widgets={[probePlugin]}
      {...(options.initialControls === undefined
        ? {}
        : { initialControls: options.initialControls })}
    >
      {children}
    </DashboardProvider>,
  );
}

describe("dashboard controls", () => {
  it("renders the time range presets, variable fields and reset action", () => {
    const html = render(<DashboardControls />);

    expect(html).toContain("Dashboard controls");
    expect(html).toContain("24 hours");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Variable region");
    expect(html).toContain('value="all"');
    expect(html).toContain('inputMode="decimal"');
    expect(html).toContain('value="5"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('type="date"');
    expect(html).toContain('type="datetime-local"');
    expect(html).toContain("Reset");
  });

  it("hides the picker and the reset action on request", () => {
    const html = render(<DashboardControls hideTimeRange hideReset />);

    expect(html).not.toContain("24 hours");
    expect(html).not.toContain("Reset");
    expect(html).toContain("Variable region");
  });

  it("renders nothing when there are no variables and the range picker is hidden", () => {
    const config = { ...createConfig(), variables: [] };
    const html = render(<DashboardControls hideTimeRange />, { config });

    expect(html).not.toContain("nama-controls");
    expect(html).not.toContain("Dashboard controls");
  });

  it("starts from host-provided control values", () => {
    const html = render(<DashboardControls />, {
      initialControls: { variables: { region: "emea" } },
    });

    expect(html).toContain('value="emea"');
    expect(html).not.toContain('value="all"');
  });
});

describe("viewer controls integration", () => {
  it("hides widgets whose visibility condition is false", () => {
    const html = render(<DashboardViewer />);

    expect(html).toContain("Visible probe");
    expect(html).not.toContain("Hidden probe");
    expect(html.match(/data-testid="probe"/gu)).toHaveLength(1);
  });

  it("resolves dashboard filters into widget render props", () => {
    expect(render(<DashboardViewer />)).toContain('data-region="all"');

    expect(
      render(<DashboardViewer />, {
        initialControls: { variables: { region: "emea" } },
      }),
    ).toContain('data-region="emea"');
  });

  it("only offers a selection callback to widgets with an interaction", () => {
    const html = render(<DashboardViewer />);
    expect(html).toContain('data-selectable="yes"');

    const config = createControlsConfig();
    const widgets = config.widgets.map((widget) => ({
      ...widget,
      interaction: undefined,
    }));
    const withoutInteraction = render(<DashboardViewer />, {
      config: { ...config, widgets },
    });
    expect(withoutInteraction).toContain('data-selectable="no"');
  });

  it("reports the localized empty state when every widget is hidden", () => {
    const config = createControlsConfig();
    const widgets = config.widgets.map((widget) => ({
      ...widget,
      visibility: { enabled: true, condition: "minValue > 1000" },
    }));

    const html = render(<DashboardViewer />, { config: { ...config, widgets } });

    expect(html).toContain("This dashboard has no widgets");
  });
});
