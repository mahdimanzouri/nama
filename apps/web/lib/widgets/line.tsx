"use client";

import { z } from "zod";
import {
  defineWidget,
  type WidgetRenderProps,
  type WidgetSettingsProps,
} from "@nama/dashboard-builder";

import { TextSetting } from "./settings-controls";

const lineConfigSchema = z
  .object({
    seriesLabel: z.string().min(1).max(120),
  })
  .strict();

type LineConfig = z.infer<typeof lineConfigSchema>;

interface Point {
  t: number;
  v: number;
}

function toPoints(rows: readonly Record<string, unknown>[]): Point[] {
  const points: Point[] = [];

  for (const row of rows) {
    const time =
      typeof row.timestamp === "string" ? Date.parse(row.timestamp) : Number.NaN;
    const value = typeof row.value === "number" ? row.value : Number.NaN;
    if (Number.isFinite(time) && Number.isFinite(value))
      points.push({ t: time, v: value });
  }

  return points;
}

function LineWidget({
  config,
  data,
  locale,
  theme,
  width,
  height,
}: WidgetRenderProps<LineConfig>) {
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

  const points = data.status === "ready" ? toPoints(data.result.rows) : [];

  if (points.length === 0) {
    return <p className="app-widget-state">{locale.translate("widget.empty")}</p>;
  }

  const chartWidth = Math.max(width, 1);
  const chartHeight = Math.max(height, 1);
  const pad = 4;
  const first = points[0]!;
  const latest = points[points.length - 1]!;
  const timeSpan = Math.max(latest.t - first.t, 1);
  const values = points.map((point) => point.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const valueSpan = max - min || 1;
  const innerWidth = Math.max(chartWidth - pad * 2, 1);
  const innerHeight = Math.max(chartHeight - pad * 2, 1);

  const path = points
    .map((point, index) => {
      const x = pad + ((point.t - first.t) / timeSpan) * innerWidth;
      const y = pad + (1 - (point.v - min) / valueSpan) * innerHeight;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="app-line">
      <svg
        className="app-line__chart"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={config.seriesLabel}
      >
        <path
          d={path}
          fill="none"
          stroke={theme.accent}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="app-line__meta">
        <span>{config.seriesLabel}</span>
        <span>{locale.formatNumber(latest.v, { maximumFractionDigits: 1 })}</span>
      </div>
    </div>
  );
}

function LineSettings({ config, onChange, disabled }: WidgetSettingsProps<LineConfig>) {
  return (
    <TextSetting
      label="Series label"
      value={config.seriesLabel}
      maxLength={120}
      disabled={disabled}
      onCommit={(seriesLabel) =>
        onChange({ ...config, seriesLabel: seriesLabel || config.seriesLabel })
      }
    />
  );
}

/** Matches the seeded data source served by the API walking skeleton. */
const DEMO_DATA_SOURCE_ID = "demo-source";

export const lineWidget = defineWidget({
  manifest: { id: "line", version: "0.1.0", name: "Line chart" },
  configVersion: 1,
  configSchema: lineConfigSchema,
  defaultConfig: { seriesLabel: "Series" },
  defaultDataSourceId: DEMO_DATA_SOURCE_ID,
  defaultQuery: {
    queryId: "line-trend",
    dataset: "metrics",
    fields: ["timestamp", "value"],
    orderBy: [{ field: "timestamp", direction: "asc" }],
    limit: 240,
    timeRange: { mode: "relative", last: "24h" },
  },
  defaultSize: { w: 9, h: 5 },
  capabilities: { filters: true },
  component: LineWidget,
  settings: LineSettings,
});
