import { useMemo } from "react";
import {
  breakpointForWidth,
  resolveLayoutItems,
  type DashboardI18n,
  type ResolvedLayoutItem,
  type ResolvedTheme,
  type ThemeTokens,
  type WidgetRegistry,
} from "@nama/dashboard-core";
import type { Breakpoint, DashboardConfig, ThemeMode } from "@nama/dashboard-types";

import { useDashboardRuntime, type DashboardRuntime } from "./context";
import { useViewportWidth } from "./media";

export function useDashboard(): DashboardRuntime {
  return useDashboardRuntime();
}

export function useDashboardConfig(): {
  config: DashboardConfig;
  revision: number;
} {
  const { config, revision } = useDashboardRuntime();
  return { config, revision };
}

export function useDashboardLocale(): DashboardI18n {
  return useDashboardRuntime().i18n;
}

export function useDashboardTheme(): {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  tokens: ThemeTokens;
} {
  return useDashboardRuntime().theme;
}

export function useWidgetRegistry(): WidgetRegistry {
  return useDashboardRuntime().registry;
}

export interface DashboardLayoutState {
  breakpoint: Breakpoint;
  columns: number;
  rowHeight: number;
  gap: number;
  items: ResolvedLayoutItem[];
}

/** Resolves the active breakpoint and its items; wider layouts are inherited. */
export function useDashboardLayout(): DashboardLayoutState {
  const { config } = useDashboardRuntime();
  const width = useViewportWidth();
  const breakpoint = breakpointForWidth(width);

  return useMemo(() => {
    const layout = config.layouts[breakpoint];

    return {
      breakpoint,
      columns: layout.columns,
      rowHeight: layout.rowHeight,
      gap: layout.gap,
      items: resolveLayoutItems(config.layouts, breakpoint),
    };
  }, [config.layouts, breakpoint]);
}
