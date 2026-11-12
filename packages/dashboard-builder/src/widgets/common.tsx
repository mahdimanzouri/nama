import type { ReactNode } from "react";
import type { DashboardI18n } from "@nama/dashboard-core";

import { joinClassNames } from "../classnames";

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

export function TruncatedNote({ locale }: { locale: DashboardI18n }) {
  return (
    <p className="nama-chart-frame__note" role="status">
      {locale.translate("widget.truncated")}
    </p>
  );
}
