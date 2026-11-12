import { describe, expect, it } from "vitest";
import type { DashboardLayouts } from "@nama/dashboard-types";

import { createDashboardI18n, normalizeDigits } from "../i18n";
import { breakpointForWidth, resolveLayoutItems } from "../layout";
import { createThemeTokens, resolveTheme, THEME_TOKEN_VARS } from "../theme";

describe("i18n", () => {
  it("resolves host messages before SDK messages", () => {
    const i18n = createDashboardI18n({
      locale: "en",
      messages: { "builder.toolbar.save": "Save now" },
    });

    expect(i18n.translate("builder.toolbar.save")).toBe("Save now");
    expect(i18n.translate("builder.toolbar.publish")).toBe("Publish");
  });

  it("ships Persian messages and infers RTL", () => {
    const i18n = createDashboardI18n({ locale: "fa" });

    expect(i18n.direction).toBe("rtl");
    expect(i18n.translate("builder.toolbar.save")).toBe("ذخیرهٔ پیش‌نویس");
  });

  it("falls back to English for unsupported locales", () => {
    const i18n = createDashboardI18n({ locale: "de" });

    expect(i18n.direction).toBe("ltr");
    expect(i18n.translate("builder.toolbar.publish")).toBe("Publish");
  });

  it("interpolates values", () => {
    const i18n = createDashboardI18n({ locale: "en" });

    expect(i18n.translate("widget.unknown", { type: "@acme/gauge" })).toBe(
      "Unknown widget type: @acme/gauge",
    );
  });

  it("renders a missing key and warns once", () => {
    const warnings: string[] = [];
    const i18n = createDashboardI18n({
      locale: "en",
      warn: (message) => warnings.push(message),
    });

    expect(i18n.translate("missing.key")).toBe("missing.key");
    expect(i18n.translate("missing.key")).toBe("missing.key");
    expect(warnings).toHaveLength(1);
  });

  it("normalizes Persian and Arabic-Indic digits", () => {
    expect(normalizeDigits("۱۲۳۴۵۶۷۸۹۰")).toBe("1234567890");
    expect(normalizeDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
    expect(normalizeDigits("2026-11-12")).toBe("2026-11-12");
  });

  it("formats dates in the injected time zone", () => {
    const i18n = createDashboardI18n({ locale: "en", timezone: "UTC" });

    expect(
      i18n.formatDate("2026-01-01T00:00:00.000Z", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
    ).toBe("01/01/2026");
  });
});

describe("layout resolution", () => {
  const layout = (columns: number, items: DashboardLayouts["desktop"]["items"] = []) => ({
    columns,
    items,
    rowHeight: 40,
    gap: 8,
  });
  const empty = (columns: number) => layout(columns);

  it("maps widths to breakpoints", () => {
    expect(breakpointForWidth(1280)).toBe("desktop");
    expect(breakpointForWidth(1024)).toBe("desktop");
    expect(breakpointForWidth(1023)).toBe("tablet");
    expect(breakpointForWidth(639)).toBe("mobile");
  });

  it("inherits items from a wider breakpoint", () => {
    const layouts: DashboardLayouts = {
      desktop: layout(12, [{ widgetId: "a", x: 0, y: 0, w: 6, h: 4 }]),
      tablet: empty(8),
      mobile: empty(4),
    };

    expect(resolveLayoutItems(layouts, "tablet")).toEqual([
      { widgetId: "a", x: 0, y: 0, w: 6, h: 4, sourceBreakpoint: "desktop" },
    ]);
    expect(resolveLayoutItems(layouts, "mobile")[0]?.sourceBreakpoint).toBe("desktop");
  });

  it("prefers a local breakpoint item over a wider one", () => {
    const layouts: DashboardLayouts = {
      desktop: layout(12, [{ widgetId: "a", x: 0, y: 0, w: 6, h: 4 }]),
      tablet: layout(8, [{ widgetId: "a", x: 1, y: 2, w: 4, h: 3 }]),
      mobile: empty(4),
    };

    expect(resolveLayoutItems(layouts, "tablet")).toEqual([
      { widgetId: "a", x: 1, y: 2, w: 4, h: 3, sourceBreakpoint: "tablet" },
    ]);
  });

  it("clamps inherited items to narrower columns", () => {
    const layouts: DashboardLayouts = {
      desktop: layout(12, [{ widgetId: "a", x: 10, y: 0, w: 4, h: 4 }]),
      tablet: empty(8),
      mobile: empty(4),
    };

    expect(resolveLayoutItems(layouts, "tablet")).toEqual([
      { widgetId: "a", x: 7, y: 0, w: 1, h: 4, sourceBreakpoint: "desktop" },
    ]);
  });

  it("orders items by row and then column", () => {
    const layouts: DashboardLayouts = {
      desktop: layout(12, [
        { widgetId: "b", x: 6, y: 0, w: 3, h: 2 },
        { widgetId: "c", x: 0, y: 2, w: 3, h: 2 },
        { widgetId: "a", x: 0, y: 0, w: 3, h: 2 },
      ]),
      tablet: empty(8),
      mobile: empty(4),
    };

    expect(resolveLayoutItems(layouts, "desktop").map((item) => item.widgetId)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("theme", () => {
  it("exposes tokens as CSS variable references", () => {
    const tokens = createThemeTokens();

    expect(tokens.text).toBe(`var(${THEME_TOKEN_VARS.text})`);
    expect(Object.keys(tokens)).toHaveLength(Object.keys(THEME_TOKEN_VARS).length);
  });

  it("resolves system mode against the host preference", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});
