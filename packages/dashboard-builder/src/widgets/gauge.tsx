import { useCallback } from "react";
import { z } from "zod";
import {
  defineWidget,
  type WidgetRenderProps,
  type WidgetSettingsProps,
} from "@nama/dashboard-core";

import { useDashboardLocale } from "../hooks";
import { buildGaugeOption } from "./chart-options";
import { latestValue, type ChartColors } from "./chart-data";
import { formatChartValue, TruncatedNote, WidgetStateMessage } from "./common";
import { EChart } from "./echarts";
import { NumberField, TextField } from "./settings-controls";

const fieldSchema = z.string().min(1).max(200).optional();

export const gaugeConfigSchema = z
  .object({
    min: z.number().default(0),
    max: z.number().default(200),
    unit: z.string().max(16).optional(),
    valueField: fieldSchema,
  })
  .strict()
  .refine((config) => config.max > config.min, {
    message: "maximum must be greater than minimum",
    path: ["max"],
  });

export type GaugeConfig = z.infer<typeof gaugeConfigSchema>;

function GaugeWidget({
  widget,
  config,
  data,
  locale,
  theme,
}: WidgetRenderProps<GaugeConfig>) {
  const value =
    data.status === "ready" ? latestValue(data.result, config.valueField) : undefined;

  const buildOption = useCallback(
    (colors: ChartColors, animation: boolean) =>
      buildGaugeOption(
        {
          value: value ?? config.min,
          min: config.min,
          max: config.max,
          name: "",
          unit: config.unit,
        },
        { colors, animation, formatValue: formatChartValue(locale) },
      ),
    [value, config.min, config.max, config.unit, locale],
  );

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

  if (value === undefined) {
    return <WidgetStateMessage>{locale.translate("widget.empty")}</WidgetStateMessage>;
  }

  const readout = `${formatChartValue(locale)(value)}${config.unit ? ` ${config.unit}` : ""}`;

  return (
    <div className="nama-chart-frame">
      <EChart
        ariaLabel={`${widget.title}: ${readout}`}
        theme={theme}
        buildOption={buildOption}
      />
      {data.truncated ? <TruncatedNote locale={locale} /> : null}
    </div>
  );
}

function GaugeSettings({ config, onChange, disabled }: WidgetSettingsProps<GaugeConfig>) {
  const translate = useDashboardLocale().translate;

  return (
    <div className="nama-settings__stack">
      <NumberField
        label={translate("widgets.settings.min")}
        value={config.min}
        min={-1_000_000}
        max={1_000_000}
        disabled={disabled}
        onCommit={(min) => onChange({ ...config, min })}
      />
      <NumberField
        label={translate("widgets.settings.max")}
        value={config.max}
        min={-1_000_000}
        max={1_000_000}
        disabled={disabled}
        onCommit={(max) => onChange({ ...config, max })}
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

export const gaugeWidget = defineWidget({
  manifest: { id: "gauge", version: "0.2.0", name: "Gauge" },
  configVersion: 1,
  configSchema: gaugeConfigSchema,
  defaultConfig: { min: 0, max: 200 },
  defaultSize: { w: 4, h: 5 },
  capabilities: { filters: true, realtime: true },
  component: GaugeWidget,
  settings: GaugeSettings,
});
