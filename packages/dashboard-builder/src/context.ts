import { createContext, useContext } from "react";
import type {
  DashboardI18n,
  ResolvedTheme,
  ThemeTokens,
  WidgetRegistry,
} from "@nama/dashboard-core";
import type {
  DashboardConfig,
  DataAdapter,
  RealtimeAdapter,
  ThemeMode,
} from "@nama/dashboard-types";

/** Dependencies the host injects; the SDK makes no transport assumptions. */
export interface DashboardRuntime {
  config: DashboardConfig;
  revision: number;
  dashboardId: string;
  i18n: DashboardI18n;
  theme: {
    mode: ThemeMode;
    resolved: ResolvedTheme;
    tokens: ThemeTokens;
  };
  registry: WidgetRegistry;
  dataAdapter: DataAdapter;
  realtimeAdapter?: RealtimeAdapter;
  timezone: string;
}

export const DashboardRuntimeContext = createContext<DashboardRuntime | null>(null);

export function useDashboardRuntime(): DashboardRuntime {
  const runtime = useContext(DashboardRuntimeContext);

  if (!runtime) {
    throw new Error("[nama] DashboardProvider is missing above this component");
  }

  return runtime;
}
