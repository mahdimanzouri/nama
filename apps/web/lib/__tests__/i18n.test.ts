import { describe, expect, it } from "vitest";

import { createWebI18n, templateLabels } from "../i18n";

describe("web i18n catalog", () => {
  it("ships English chrome strings", () => {
    const i18n = createWebI18n("en");

    expect(i18n.direction).toBe("ltr");
    expect(i18n.translate("web.common.dashboards")).toBe("Dashboards");
    expect(
      i18n.translate("web.dashboards.signedInAs", { name: "Ada", role: "editor" }),
    ).toBe("signed in as Ada (editor)");
  });

  it("mirrors chrome and formats Persian dates and numbers", () => {
    const i18n = createWebI18n("fa", "UTC");

    expect(i18n.direction).toBe("rtl");
    expect(i18n.translate("web.common.dashboards")).toBe("داشبوردها");
    expect(i18n.formatNumber(1234)).toBe("۱٬۲۳۴");
    expect(
      i18n.formatDate("2026-01-01T00:00:00.000Z", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
    ).toBe("۱۴۰۴/۱۰/۱۱");
  });

  it("falls back to English for unsupported locales", () => {
    const i18n = createWebI18n("de");

    expect(i18n.direction).toBe("ltr");
    expect(i18n.translate("web.common.dashboards")).toBe("Dashboards");
  });

  it("localizes template labels without touching authored content", () => {
    const labels = templateLabels(createWebI18n("fa"));
    const operations = labels.find((label) => label.id === "operations");

    expect(operations?.name).toBe("نمای عملیات");
    expect(operations?.description).toContain("شاخص‌ها");
  });
});
