import { z } from "zod";
import {
  defineWidget,
  type WidgetRenderProps,
  type WidgetSettingsProps,
} from "@nama/dashboard-core";

import { useDashboardLocale } from "../hooks";
import { latestValue } from "./chart-data";
import { WidgetStateMessage } from "./common";
import { TextField } from "./settings-controls";

const fieldSchema = z.string().min(1).max(200).optional();

export const kpiConfigSchema = z
  .object({
    label: z.string().min(1).max(120).default("Metric"),
    unit: z.string().max(16).optional(),
    valueField: fieldSchema,
  })
  .strict();

export type KpiConfig = z.infer<typeof kpiConfigSchema>;

function KpiWidget({ config, data, locale }: WidgetRenderProps<KpiConfig>) {
  if (data.status === "idle" || data.status === "loading") {
    return <WidgetStateMessage>{locale.translate("widget.loading")}</WidgetStateMessage>;
  }

  if (data.status === "error") {
    return (
      <WidgetStateMessage tone="alert">
        {locale.translate("widget.error")}
      </WidgetStateMessage>
    );
  }

  const value = latestValue(data.result, config.valueField);
  if (value === undefined) {
    return <WidgetStateMessage>{locale.translate("widget.empty")}</WidgetStateMessage>;
  }

  return (
    <div className="nama-kpi">
      <span className="nama-kpi__label">{config.label}</span>
      <span className="nama-kpi__value">
        {locale.formatNumber(value, { maximumFractionDigits: 1 })}
      </span>
      {config.unit ? <span className="nama-kpi__unit">{config.unit}</span> : null}
    </div>
  );
}

function KpiSettings({ config, onChange, disabled }: WidgetSettingsProps<KpiConfig>) {
  const translate = useDashboardLocale().translate;

  return (
    <div className="nama-settings__stack">
      <TextField
        label={translate("widgets.settings.label")}
        value={config.label}
        maxLength={120}
        disabled={disabled}
        onCommit={(label) => {
          if (label) onChange({ ...config, label });
        }}
      />
      <TextField
        label={translate("widgets.settings.unit")}
        value={config.unit ?? ""}
        maxLength={16}
        disabled={disabled}
        onCommit={(unit) => onChange({ ...config, unit: unit || undefined })}
      />
      <TextField
        label={translate("widgets.settings.valueField")}
        value={config.valueField ?? ""}
        placeholder={translate("widgets.settings.auto")}
        disabled={disabled}
        onCommit={(valueField) =>
          onChange({ ...config, valueField: valueField || undefined })
        }
      />
    </div>
  );
}

export const kpiWidget = defineWidget({
  manifest: { id: "kpi", version: "0.2.0", name: "KPI" },
  configVersion: 1,
  configSchema: kpiConfigSchema,
  defaultConfig: { label: "Metric" },
  defaultSize: { w: 3, h: 5 },
  capabilities: { filters: true, realtime: true },
  component: KpiWidget,
  settings: KpiSettings,
});
