import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { z } from "zod";
import { defineWidget, InvalidDashboardConfigError } from "@nama/dashboard-core";

import { DashboardProvider, type DashboardProviderProps } from "../provider";
import { DashboardViewer } from "../viewer";
import {
  createConfig,
  createKpiWidget,
  createUnknownWidget,
  staticAdapter,
} from "./fixtures";

const kpiSchema = z.object({ label: z.string() });

const kpiPlugin = defineWidget({
  manifest: { id: "kpi", version: "1.0.0", name: "KPI" },
  configVersion: 1,
  configSchema: kpiSchema,
  defaultConfig: { label: "KPI" },
  defaultSize: { w: 3, h: 4 },
  component: ({ config, data }) => (
    <div data-testid="kpi">
      {config.label} ({data.status})
    </div>
  ),
});

function renderViewer(
  overrides: Partial<Omit<DashboardProviderProps, "children">> = {},
): string {
  const props: Omit<DashboardProviderProps, "children"> = {
    config: createConfig(),
    locale: "en",
    direction: "ltr",
    theme: "light",
    dataAdapter: staticAdapter,
    widgets: [kpiPlugin],
    ...overrides,
  };

  return renderToStaticMarkup(
    <DashboardProvider {...props}>
      <DashboardViewer />
    </DashboardProvider>,
  );
}

describe("DashboardViewer server rendering", () => {
  it("renders a registered widget through the provider", () => {
    const html = renderViewer();

    expect(html).toContain("Factory dashboard");
    expect(html).toContain("Production today");
    expect(html).toContain('data-widget-type="kpi"');
    expect(html).toContain("Units produced");
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('data-theme="light"');
  });

  it("applies the dark theme to the provider root", () => {
    expect(renderViewer({ theme: "dark" })).toContain('data-theme="dark"');
  });

  it("renders a localized placeholder for an unregistered type", () => {
    const html = renderViewer({
      config: createConfig([createUnknownWidget()]),
    });

    expect(html).toContain("Unknown widget type: @acme/missing");
    expect(html).toContain("Mystery panel");
  });

  it("renders a placeholder for a config version newer than the plugin", () => {
    const html = renderViewer({
      config: createConfig([createKpiWidget({ configVersion: 2 })]),
    });

    expect(html).toContain("kpi config version 2 is not supported");
  });

  it("renders a placeholder for config that fails validation", () => {
    const html = renderViewer({
      config: createConfig([createKpiWidget({ config: { label: 42 } })]),
    });

    expect(html).toContain("This widget&#x27;s configuration is invalid");
  });

  it("shows the empty state when no widget is visible", () => {
    const hidden = createKpiWidget({ visibility: { enabled: false } });
    const html = renderViewer({ config: createConfig([hidden]) });

    expect(html).toContain("This dashboard has no widgets");
    expect(html).not.toContain('data-widget-type="kpi"');
  });

  it("discloses the LTR-only canvas in RTL locales", () => {
    const html = renderViewer({ locale: "fa", direction: "rtl" });

    expect(html).toContain('dir="rtl"');
    expect(html).toContain("nama-canvas__notice");
    expect(html).toContain("ویرایشگر داشبورد");
    expect(html).toContain('class="nama-canvas" dir="ltr"');
  });

  it("does not show the notice in LTR locales", () => {
    expect(renderViewer()).not.toContain("nama-canvas__notice");
  });

  it("rejects an invalid configuration at the provider boundary", () => {
    const config = { ...createConfig(), settings: undefined };

    expect(() =>
      renderViewer({ config: config as unknown as DashboardProviderProps["config"] }),
    ).toThrow(InvalidDashboardConfigError);
  });

  it("accepts a host-supplied widget plugin type-safely", () => {
    const html = renderViewer({
      widgets: [kpiPlugin],
      config: createConfig([createKpiWidget({ type: "kpi" })]),
    });

    expect(html).toContain("Units produced");
  });
});
