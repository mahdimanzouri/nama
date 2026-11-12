"use client";

import { z } from "zod";
import { defineWidget, type WidgetRenderProps } from "@nama/dashboard-builder";

const kpiConfigSchema = z
  .object({
    label: z.string().min(1).max(120),
    unit: z.string().max(16).optional(),
  })
  .strict();

type KpiConfig = z.infer<typeof kpiConfigSchema>;

function KpiWidget({ config, data, locale }: WidgetRenderProps<KpiConfig>) {
  if (data.status === "loading") {
    return <p className="app-widget-state">{locale.translate("widget.loading")}</p>;
  }

  if (data.status === "error") {
    return (
      <p className="app-widget-state" role="alert">
        {locale.translate("widget.error")}
      </p>
    );
  }

  const row = data.status === "ready" ? data.result.rows[0] : undefined;
  const value = row
    ? Object.values(row).find((entry): entry is number => typeof entry === "number")
    : undefined;

  if (value === undefined) {
    return <p className="app-widget-state">{locale.translate("widget.empty")}</p>;
  }

  return (
    <div className="app-kpi">
      <span className="app-kpi__label">{config.label}</span>
      <span className="app-kpi__value">
        {locale.formatNumber(value, { maximumFractionDigits: 1 })}
      </span>
      {config.unit ? <span className="app-kpi__unit">{config.unit}</span> : null}
    </div>
  );
}

export const kpiWidget = defineWidget({
  manifest: { id: "kpi", version: "0.1.0", name: "KPI" },
  configVersion: 1,
  configSchema: kpiConfigSchema,
  defaultConfig: { label: "Metric" },
  defaultSize: { w: 3, h: 5 },
  capabilities: { filters: true },
  component: KpiWidget,
});
