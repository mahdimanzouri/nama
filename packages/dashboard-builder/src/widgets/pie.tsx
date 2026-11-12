import { useCallback, useMemo } from "react";
import { z } from "zod";
import {
  defineWidget,
  type WidgetRenderProps,
  type WidgetSettingsProps,
} from "@nama/dashboard-core";

import { useDashboardLocale } from "../hooks";
import { buildPieOption } from "./chart-options";
import { toSeries, type ChartColors, type SeriesPoint } from "./chart-data";
import {
  chartTable,
  formatCategory,
  formatChartValue,
  TruncatedNote,
  WidgetStateMessage,
} from "./common";
import { EChart } from "./echarts";
import { TextField, ToggleField } from "./settings-controls";

const fieldSchema = z.string().min(1).max(200).optional();

export const pieConfigSchema = z
  .object({
    labelField: fieldSchema,
    valueField: fieldSchema,
    donut: z.boolean().default(true),
  })
  .strict();

export type PieConfig = z.infer<typeof pieConfigSchema>;

const EMPTY_POINTS: readonly SeriesPoint[] = [];

function PieWidget({
  widget,
  config,
  data,
  locale,
  theme,
  onSelect,
}: WidgetRenderProps<PieConfig>) {
  const result = data.status === "ready" ? data.result : undefined;
  const points = useMemo(
    () =>
      result
        ? toSeries(result, {
            xField: config.labelField,
            yField: config.valueField,
            formatX: (value) => formatCategory(locale, value),
          })
        : EMPTY_POINTS,
    [result, config.labelField, config.valueField, locale],
  );

  const selectPoint = useCallback(
    (index: number) => {
      onSelect?.({ value: points[index]?.raw });
    },
    [onSelect, points],
  );

  const table = useMemo(
    () =>
      points.length === 0
        ? undefined
        : chartTable(locale, widget.title, points, formatChartValue(locale)),
    [locale, widget.title, points],
  );

  const buildOption = useCallback(
    (colors: ChartColors, animation: boolean) =>
      buildPieOption(
        { points },
        { colors, animation, formatValue: formatChartValue(locale) },
        { donut: config.donut },
      ),
    [points, config.donut, locale],
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

  if (points.length === 0) {
    return <WidgetStateMessage>{locale.translate("widget.empty")}</WidgetStateMessage>;
  }

  return (
    <div className="nama-chart-frame">
      <EChart
        ariaLabel={widget.title}
        ariaDescription={
          onSelect ? locale.translate("widget.chart.keyboardHint") : undefined
        }
        table={table}
        theme={theme}
        buildOption={buildOption}
        onSelect={onSelect ? selectPoint : undefined}
      />
      {data.truncated ? <TruncatedNote locale={locale} /> : null}
    </div>
  );
}

function PieSettings({ config, onChange, disabled }: WidgetSettingsProps<PieConfig>) {
  const translate = useDashboardLocale().translate;

  return (
    <div className="nama-settings__stack">
      <TextField
        label={translate("widgets.settings.labelField")}
        value={config.labelField ?? ""}
        placeholder={translate("widgets.settings.auto")}
        disabled={disabled}
        onCommit={(labelField) =>
          onChange({ ...config, labelField: labelField || undefined })
        }
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
      <ToggleField
        label={translate("widgets.settings.donut")}
        checked={config.donut}
        disabled={disabled}
        onCommit={(donut) => onChange({ ...config, donut })}
      />
    </div>
  );
}

export const pieWidget = defineWidget({
  manifest: { id: "pie", version: "0.2.0", name: "Pie chart" },
  configVersion: 1,
  configSchema: pieConfigSchema,
  defaultConfig: { donut: true },
  defaultSize: { w: 4, h: 5 },
  capabilities: { filters: true, realtime: true },
  component: PieWidget,
  settings: PieSettings,
});
