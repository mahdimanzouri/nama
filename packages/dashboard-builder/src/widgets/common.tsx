import type { ReactNode } from "react";
import type { DashboardI18n } from "@nama/dashboard-core";

import { joinClassNames } from "../classnames";
import type { SeriesPoint } from "./chart-data";
import type { EChartTable } from "./echarts";

export function WidgetStateMessage({
  children,
  tone = "status",
  className,
}: {
  children: ReactNode;
  tone?: "status" | "alert";
  className?: string;
}) {
  return (
    <p
      className={joinClassNames(
        "nama-widget-state",
        tone === "alert" ? "nama-widget-state--error" : undefined,
        className,
      )}
      role={tone}
    >
      {children}
    </p>
  );
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T/u;

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

/** Category labels: ISO timestamps use the injected locale, everything else is textual. */
export function formatCategory(locale: DashboardI18n, value: unknown): string {
  if (typeof value === "string" && ISO_TIMESTAMP.test(value)) {
    return locale.formatDate(value, DATE_OPTIONS);
  }

  if (value instanceof Date) return locale.formatDate(value, DATE_OPTIONS);
  if (typeof value === "number") return locale.formatNumber(value);
  if (value === null || value === undefined) return "";

  return String(value);
}

export function formatChartValue(locale: DashboardI18n): (value: number) => string {
  return (value) => locale.formatNumber(value, { maximumFractionDigits: 1 });
}

/** Long series are summarised; the table exists for inspection, not bulk reading. */
const MAX_TABLE_ROWS = 100;

/**
 * Builds the table fallback for a chart. Screen readers get the same values the
 * canvas paints, without depending on the canvas or on pointer interaction.
 */
export function chartTable(
  locale: DashboardI18n,
  title: string,
  points: readonly SeriesPoint[],
  formatValue: (value: number) => string,
): EChartTable {
  const rows = points
    .slice(0, MAX_TABLE_ROWS)
    .map((point) => ({ label: point.label, value: formatValue(point.value) }));

  return {
    summary: locale.translate("widget.chart.dataTable"),
    caption: locale.translate("widget.chart.dataTableCaption", { title }),
    categoryHeader: locale.translate("widget.chart.categoryHeader"),
    valueHeader: locale.translate("widget.chart.valueHeader"),
    rows,
    ...(points.length > MAX_TABLE_ROWS
      ? {
          note: locale.translate("widget.chart.dataTableTruncated", {
            count: MAX_TABLE_ROWS,
            total: points.length,
          }),
        }
      : {}),
  };
}

export function TruncatedNote({ locale }: { locale: DashboardI18n }) {
  return (
    <p className="nama-chart-frame__note" role="status">
      {locale.translate("widget.truncated")}
    </p>
  );
}
