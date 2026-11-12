import { useCallback, useMemo } from "react";
import { z } from "zod";
import {
  defineWidget,
  type WidgetRenderProps,
  type WidgetSettingsProps,
  type WidgetSize,
} from "@nama/dashboard-core";

import { useDashboardLocale } from "../hooks";
import { buildBarOption, buildLineOption } from "./chart-options";
import { toSeries, type SeriesPoint } from "./chart-data";
import {
  formatCategory,
  formatChartValue,
  TruncatedNote,
  WidgetStateMessage,
} from "./common";
import { EChart } from "./echarts";
import { TextField, ToggleField } from "./settings-controls";

const fieldSchema = z.string().min(1).max(200).optional();

export const cartesianConfigSchema = z
  .object({
    seriesLabel: z.string().min(1).max(120).default("Series"),
    xField: fieldSchema,
    yField: fieldSchema,
    smooth: z.boolean().default(false),
    area: z.boolean().default(false),
  })
  .strict();

export type CartesianConfig = z.infer<typeof cartesianConfigSchema>;

const EMPTY_POINTS: readonly SeriesPoint[] = [];

interface CartesianVariant {
  id: "line" | "area" | "bar";
  name: string;
  defaultSize: WidgetSize;
  defaultArea: boolean;
}

function CartesianWidget({
  widget,
  config,
  data,
  locale,
  theme,
  onSelect,
  kind,
}: WidgetRenderProps<CartesianConfig> & { kind: CartesianVariant["id"] }) {
  const result = data.status === "ready" ? data.result : undefined;
  const points = useMemo(
    () =>
      result
        ? toSeries(result, {
            xField: config.xField,
            yField: config.yField,
            formatX: (value) => formatCategory(locale, value),
          })
        : EMPTY_POINTS,
    [result, config.xField, config.yField, locale],
  );

  const selectPoint = useCallback(
    (index: number) => {
      onSelect?.({ value: points[index]?.raw });
    },
    [onSelect, points],
  );

  const buildOption = useCallback(
    (colors: Parameters<typeof buildLineOption>[1]["colors"], animation: boolean) => {
      const input = {
        labels: points.map((point) => point.label),
        values: points.map((point) => point.value),
        seriesName: config.seriesLabel,
        smooth: config.smooth,
        area: config.area,
      };
      const context = {
        colors,
        animation,
        formatValue: formatChartValue(locale),
      };

      return kind === "bar"
        ? buildBarOption(input, context)
        : buildLineOption(input, context);
    },
    [points, config.seriesLabel, config.smooth, config.area, locale, kind],
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
        theme={theme}
        buildOption={buildOption}
        onSelect={onSelect ? selectPoint : undefined}
      />
      {data.truncated ? <TruncatedNote locale={locale} /> : null}
    </div>
  );
}

function CartesianSettings({
  config,
  onChange,
  disabled,
  kind,
}: WidgetSettingsProps<CartesianConfig> & { kind: CartesianVariant["id"] }) {
  const locale = useDashboardLocale();
  const translate = locale.translate;

  return (
    <div className="nama-settings__stack">
      <TextField
        label={translate("widgets.settings.seriesLabel")}
        value={config.seriesLabel}
        maxLength={120}
        disabled={disabled}
        onCommit={(seriesLabel) => onChange({ ...config, seriesLabel })}
      />
      <TextField
        label={translate("widgets.settings.categoryField")}
        value={config.xField ?? ""}
        placeholder={translate("widgets.settings.auto")}
        disabled={disabled}
        onCommit={(xField) => onChange({ ...config, xField: xField || undefined })}
      />
      <TextField
        label={translate("widgets.settings.valueField")}
        value={config.yField ?? ""}
        placeholder={translate("widgets.settings.auto")}
        disabled={disabled}
        onCommit={(yField) => onChange({ ...config, yField: yField || undefined })}
      />
      {kind !== "bar" ? (
        <>
          <ToggleField
            label={translate("widgets.settings.smooth")}
            checked={config.smooth}
            disabled={disabled}
            onCommit={(smooth) => onChange({ ...config, smooth })}
          />
          <ToggleField
            label={translate("widgets.settings.area")}
            checked={config.area}
            disabled={disabled}
            onCommit={(area) => onChange({ ...config, area })}
          />
        </>
      ) : null}
    </div>
  );
}

function createCartesianWidget(variant: CartesianVariant) {
  const Component = (props: WidgetRenderProps<CartesianConfig>) => (
    <CartesianWidget {...props} kind={variant.id} />
  );
  const Settings = (props: WidgetSettingsProps<CartesianConfig>) => (
    <CartesianSettings {...props} kind={variant.id} />
  );

  return defineWidget({
    manifest: { id: variant.id, version: "0.2.0", name: variant.name },
    configVersion: 1,
    configSchema: cartesianConfigSchema,
    defaultConfig: {
      seriesLabel: "Series",
      smooth: false,
      area: variant.defaultArea,
    },
    defaultSize: variant.defaultSize,
    capabilities: { filters: true, realtime: true },
    component: Component,
    settings: Settings,
  });
}

export const lineWidget = createCartesianWidget({
  id: "line",
  name: "Line chart",
  defaultSize: { w: 9, h: 5 },
  defaultArea: false,
});

export const areaWidget = createCartesianWidget({
  id: "area",
  name: "Area chart",
  defaultSize: { w: 9, h: 5 },
  defaultArea: true,
});

export const barWidget = createCartesianWidget({
  id: "bar",
  name: "Bar chart",
  defaultSize: { w: 6, h: 5 },
  defaultArea: false,
});
