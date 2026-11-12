import type { EChartsCoreOption } from "echarts/core";

import type { ChartColors, SeriesPoint } from "./chart-data";

/** Resolved per render: the caller injects colour tokens and formatters. */
export interface ChartContext {
  colors: ChartColors;
  animation: boolean;
  formatValue: (value: number) => string;
}

export interface ChartSeriesInput {
  labels: readonly string[];
  values: readonly number[];
}

export interface LineOptions extends ChartSeriesInput {
  seriesName: string;
  area?: boolean;
  smooth?: boolean;
}

export interface PieOptions {
  points: readonly SeriesPoint[];
}

export interface GaugeOptions {
  value: number;
  min: number;
  max: number;
  name: string;
  unit?: string;
}

function baseOption(context: ChartContext): EChartsCoreOption {
  const { colors } = context;

  return {
    animation: context.animation,
    animationDuration: 220,
    animationDurationUpdate: 160,
    textStyle: { color: colors.text },
    tooltip: {
      trigger: "axis",
      // Canvas-rendered tooltips never interpolate data into HTML.
      renderMode: "richText",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      textStyle: { color: colors.text },
      valueFormatter: context.formatValue,
    },
  };
}

function categoryAxis(labels: readonly string[], colors: ChartColors): EChartsCoreOption {
  return {
    type: "category",
    data: [...labels],
    boundaryGap: true,
    axisTick: { show: false },
    axisLine: { lineStyle: { color: colors.border } },
    axisLabel: { color: colors.muted, hideOverlap: true },
  };
}

function valueAxis(colors: ChartColors, formatValue: (value: number) => string) {
  return {
    type: "value",
    scale: true,
    axisLabel: { color: colors.muted, formatter: formatValue },
    splitLine: { lineStyle: { color: colors.border } },
  };
}

/** ECharts 6 replacement for `containLabel: true`. */
const GRID = {
  left: 8,
  right: 12,
  top: 12,
  bottom: 8,
  outerBoundsMode: "same",
  outerBoundsContain: "axisLabel",
} as const;

export function buildLineOption(
  options: LineOptions,
  context: ChartContext,
): EChartsCoreOption {
  const { colors } = context;

  return {
    ...baseOption(context),
    grid: GRID,
    xAxis: { ...categoryAxis(options.labels, colors), boundaryGap: false },
    yAxis: valueAxis(colors, context.formatValue),
    series: [
      {
        type: "line",
        name: options.seriesName,
        data: [...options.values],
        showSymbol: false,
        smooth: options.smooth ?? false,
        lineStyle: { width: 2, color: colors.accent },
        itemStyle: { color: colors.accent },
        areaStyle: options.area ? { color: colors.accent, opacity: 0.16 } : undefined,
      },
    ],
  };
}

export function buildBarOption(
  options: LineOptions,
  context: ChartContext,
): EChartsCoreOption {
  const { colors } = context;

  return {
    ...baseOption(context),
    grid: GRID,
    xAxis: categoryAxis(options.labels, colors),
    yAxis: valueAxis(colors, context.formatValue),
    series: [
      {
        type: "bar",
        name: options.seriesName,
        data: [...options.values],
        barMaxWidth: 32,
        itemStyle: { color: colors.accent, borderRadius: [3, 3, 0, 0] },
      },
    ],
  };
}

const SERIES_PALETTE = (colors: ChartColors): string[] => [
  colors.accent,
  colors.success,
  colors.warning,
  colors.danger,
  colors.muted,
];

export function buildPieOption(
  options: PieOptions,
  context: ChartContext,
  variant: { donut?: boolean } = {},
): EChartsCoreOption {
  const { colors } = context;

  return {
    animation: context.animation,
    animationDuration: 220,
    textStyle: { color: colors.text },
    color: SERIES_PALETTE(colors),
    tooltip: {
      trigger: "item",
      renderMode: "richText",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      textStyle: { color: colors.text },
      valueFormatter: context.formatValue,
    },
    series: [
      {
        type: "pie",
        radius: variant.donut === false ? "68%" : ["38%", "68%"],
        center: ["50%", "52%"],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: colors.surface, borderWidth: 1 },
        // Slice names are query labels (often timestamps); the percentage keeps
        // the pie readable and the tooltip still shows the full label.
        label: { color: colors.muted, fontSize: 11, formatter: "{d}%" },
        labelLine: { lineStyle: { color: colors.border } },
        data: options.points.map((point) => ({
          name: point.label,
          value: point.value,
        })),
      },
    ],
  };
}

export function buildGaugeOption(
  options: GaugeOptions,
  context: ChartContext,
): EChartsCoreOption {
  const { colors } = context;
  const detail = options.unit
    ? `${context.formatValue(options.value)} ${options.unit}`
    : context.formatValue(options.value);

  return {
    animation: context.animation,
    animationDuration: 220,
    textStyle: { color: colors.text },
    series: [
      {
        type: "gauge",
        min: options.min,
        max: options.max,
        startAngle: 210,
        endAngle: -30,
        progress: { show: true, width: 10, itemStyle: { color: colors.accent } },
        axisLine: { lineStyle: { width: 10, color: [[1, colors.border]] } },
        axisTick: { show: false },
        splitLine: {
          distance: -10,
          length: 8,
          lineStyle: { color: colors.border, width: 1 },
        },
        splitNumber: 5,
        axisLabel: { color: colors.muted, fontSize: 10, distance: 14 },
        pointer: { itemStyle: { color: colors.text } },
        anchor: { show: true, size: 6, itemStyle: { color: colors.text } },
        detail: {
          valueAnimation: context.animation,
          offsetCenter: [0, "62%"],
          color: colors.text,
          fontSize: 18,
          formatter: detail,
        },
        title: {
          show: Boolean(options.name),
          offsetCenter: [0, "88%"],
          color: colors.muted,
          fontSize: 11,
        },
        data: [{ value: options.value, name: options.name }],
      },
    ],
  };
}
