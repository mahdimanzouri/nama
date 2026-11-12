import type { Locale, QueryContext } from "@nama/dashboard-types";

import type { DashboardRuntime } from "./context";

export function newRequestId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  return (
    random ?? `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}

/** The schema only supports `en` and `fa`; other locales fall back to `en`. */
export function queryLocale(locale: string): Locale {
  return locale.startsWith("fa") ? "fa" : "en";
}

export function createQueryContext(
  runtime: DashboardRuntime,
  signal: AbortSignal,
): QueryContext {
  return {
    signal,
    requestId: newRequestId(),
    dashboardId: runtime.dashboardId,
    locale: queryLocale(runtime.i18n.locale),
    timezone: runtime.timezone,
  };
}
