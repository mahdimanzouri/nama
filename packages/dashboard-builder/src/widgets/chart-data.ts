import type { ThemeTokens } from "@nama/dashboard-core";
import type { QueryResult } from "@nama/dashboard-types";

export interface ChartColors {
  text: string;
  muted: string;
  border: string;
  surface: string;
  accent: string;
  danger: string;
  warning: string;
  success: string;
}

const FALLBACK_COLORS: ChartColors = {
  text: "#111827",
  muted: "#6b7280",
  border: "#e5e7eb",
  surface: "#f5f7fa",
  accent: "#2563eb",
  danger: "#dc2626",
  warning: "#d97706",
  success: "#059669",
};

const TOKEN_FALLBACKS: Record<keyof ChartColors, string> = {
  text: FALLBACK_COLORS.text,
  muted: FALLBACK_COLORS.muted,
  border: FALLBACK_COLORS.border,
  surface: FALLBACK_COLORS.surface,
  accent: FALLBACK_COLORS.accent,
  danger: FALLBACK_COLORS.danger,
  warning: FALLBACK_COLORS.warning,
  success: FALLBACK_COLORS.success,
};

/**
 * Canvas charts cannot paint CSS variables, so the tokens are resolved against
 * the element inside the provider root. Called from an effect, after the theme
 * attribute has been committed.
 */
export function resolveChartColors(
  tokens: ThemeTokens,
  element: Element | null,
): ChartColors {
  if (!element || typeof window === "undefined") return FALLBACK_COLORS;

  const style = window.getComputedStyle(element);
  const read = (token: keyof ChartColors): string => {
    const raw = tokens[token];
    if (!raw.startsWith("var(")) return raw || TOKEN_FALLBACKS[token];
    const name = raw.slice(4, -1).trim();
    return style.getPropertyValue(name).trim() || TOKEN_FALLBACKS[token];
  };

  return {
    text: read("text"),
    muted: read("muted"),
    border: read("border"),
    surface: read("surface"),
    accent: read("accent"),
    danger: read("danger"),
    warning: read("warning"),
    success: read("success"),
  };
}

export interface SeriesPoint {
  label: string;
  value: number;
  /** Unformatted category value, used when a click writes a variable. */
  raw?: unknown;
}

export interface SeriesOptions {
  xField?: string;
  yField?: string;
  formatX?: (value: unknown) => string;
}

function isNumericColumn(type: string | undefined): boolean {
  return type === "number";
}

/** Picks the configured field or the first column of the requested kind. */
export function pickField(
  result: QueryResult,
  preferred: string | undefined,
  kind: "number" | "category",
): string | undefined {
  if (preferred) return preferred;

  const numeric = result.columns.find((column) => isNumericColumn(column.type));
  if (kind === "number") return numeric?.name;

  const category = result.columns.find(
    (column) => column.name !== numeric?.name && column.type !== "number",
  );
  return category?.name ?? numeric?.name ?? result.columns[0]?.name;
}

function formatLabel(value: unknown, fallback: string): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  return fallback;
}

/**
 * Projects rows into labelled numeric points. Timestamp columns are formatted
 * with the injected formatter; other values fall back to their string form.
 */
export function toSeries(
  result: QueryResult,
  options: SeriesOptions = {},
): SeriesPoint[] {
  const yField = pickField(result, options.yField, "number");
  const xField = pickField(result, options.xField ?? undefined, "category");
  const formatX =
    options.formatX ??
    ((value: unknown) =>
      typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/u.test(value)
        ? new Date(value).toISOString()
        : String(value ?? ""));

  return result.rows.flatMap((row, index) => {
    const value = yField === undefined ? undefined : row[yField];
    if (typeof value !== "number" || !Number.isFinite(value)) return [];

    const rawLabel = xField === undefined ? index : row[xField];
    return [
      { label: formatLabel(formatX(rawLabel), String(index + 1)), value, raw: rawLabel },
    ];
  });
}

/** Latest numeric value, used by KPI and gauge widgets. */
export function latestValue(
  result: QueryResult,
  preferred: string | undefined,
): number | undefined {
  const field = pickField(result, preferred, "number");
  if (!field) return undefined;

  for (let index = result.rows.length - 1; index >= 0; index -= 1) {
    const value = result.rows[index]?.[field];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }

  return undefined;
}
