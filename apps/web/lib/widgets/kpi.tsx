"use client";

import { z } from "zod";
import {
  defineWidget,
  type WidgetRenderProps,
  type WidgetSettingsProps,
} from "@nama/dashboard-builder";

import { TextSetting } from "./settings-controls";

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

function KpiSettings({ config, onChange, disabled }: WidgetSettingsProps<KpiConfig>) {
  return (
    <div className="app-stack app-stack--tight">
      <TextSetting
        label="Label"
        value={config.label}
        maxLength={120}
        disabled={disabled}
        onCommit={(label) => onChange({ ...config, label: label || config.label })}
      />
      <TextSetting
        label="Unit"
        value={config.unit ?? ""}
        maxLength={16}
        disabled={disabled}
        onCommit={(unit) => onChange({ ...config, unit: unit || undefined })}
      />
    </div>
  );
}

/** Matches the seeded data source served by the API walking skeleton. */
const DEMO_DATA_SOURCE_ID = "demo-source";

export const kpiWidget = defineWidget({
  manifest: { id: "kpi", version: "0.1.0", name: "KPI" },
  configVersion: 1,
  configSchema: kpiConfigSchema,
  defaultConfig: { label: "Metric" },
  defaultDataSourceId: DEMO_DATA_SOURCE_ID,
  defaultQuery: {
    queryId: "kpi-avg",
    dataset: "metrics",
    fields: ["value"],
    aggregations: [{ field: "value", fn: "avg" }],
    timeRange: { mode: "relative", last: "24h" },
  },
  defaultSize: { w: 3, h: 5 },
  capabilities: { filters: true },
  component: KpiWidget,
  settings: KpiSettings,
});
