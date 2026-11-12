import type { Direction } from "@nama/dashboard-builder";

/** Chrome direction follows the locale; the dashboard canvas stays LTR. */
export function directionFor(locale: string): Direction {
  return locale.startsWith("fa") || locale.startsWith("ar") ? "rtl" : "ltr";
}
