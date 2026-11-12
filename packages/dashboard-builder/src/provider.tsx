import { useMemo, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createDashboardI18n,
  createThemeTokens,
  createWidgetRegistry,
  InvalidDashboardConfigError,
  resolveTheme,
  type Direction,
  type ErasedWidgetPlugin,
} from "@nama/dashboard-core";
import {
  dashboardConfigSchema,
  issuesFromZod,
  type DashboardConfig,
  type DataAdapter,
  type RealtimeAdapter,
  type ThemeMode,
} from "@nama/dashboard-types";

import { DashboardRuntimeContext, type DashboardRuntime } from "./context";
import { useSystemPrefersDark } from "./media";

export interface DashboardProviderProps {
  /** Persisted configuration; viewers receive the published one only. */
  config: DashboardConfig;
  /** Last known server revision; conflict handling uses it from M4. */
  revision?: number;
  /** Stable dashboard id passed to data adapters. */
  dashboardId?: string;
  locale: string;
  direction: Direction;
  theme: ThemeMode;
  /** Host translation overrides; fall back to SDK messages, then English. */
  messages?: Readonly<Record<string, string>>;
  /** User time zone; falls back to the dashboard setting, then UTC. */
  timezone?: string;

  dataAdapter: DataAdapter;
  realtimeAdapter?: RealtimeAdapter;

  /** Pass a stable array; the registry is rebuilt when this identity changes. */
  widgets?: readonly ErasedWidgetPlugin[];
  /** Share a cache when the host already owns one. */
  queryClient?: QueryClient;

  children: ReactNode;
}

function parseConfig(config: DashboardConfig): DashboardConfig {
  const result = dashboardConfigSchema.safeParse(config);

  if (!result.success) {
    throw new InvalidDashboardConfigError(issuesFromZod(result.error));
  }

  return result.data;
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, refetchOnWindowFocus: false },
    },
  });
}

export function DashboardProvider({
  config,
  revision = 0,
  dashboardId = "dashboard",
  locale,
  direction,
  theme,
  messages,
  timezone,
  dataAdapter,
  realtimeAdapter,
  widgets,
  queryClient,
  children,
}: DashboardProviderProps) {
  const [defaultClient] = useState(createQueryClient);
  const client = queryClient ?? defaultClient;
  const parsedConfig = useMemo(() => parseConfig(config), [config]);
  const prefersDark = useSystemPrefersDark();
  const resolvedTheme = resolveTheme(theme, prefersDark);
  const tokens = useMemo(() => createThemeTokens(), []);
  const registry = useMemo(() => createWidgetRegistry(widgets ?? []), [widgets]);
  const i18n = useMemo(
    () => createDashboardI18n({ locale, direction, messages, timezone }),
    [locale, direction, messages, timezone],
  );
  const resolvedTimeZone = timezone ?? parsedConfig.settings.timezone ?? "UTC";

  const runtime = useMemo<DashboardRuntime>(
    () => ({
      config: parsedConfig,
      revision,
      dashboardId,
      i18n,
      theme: { mode: theme, resolved: resolvedTheme, tokens },
      registry,
      dataAdapter,
      realtimeAdapter,
      timezone: resolvedTimeZone,
    }),
    [
      parsedConfig,
      revision,
      dashboardId,
      i18n,
      theme,
      resolvedTheme,
      tokens,
      registry,
      dataAdapter,
      realtimeAdapter,
      resolvedTimeZone,
    ],
  );

  return (
    <QueryClientProvider client={client}>
      <DashboardRuntimeContext.Provider value={runtime}>
        <div
          className="nama-root"
          data-theme={resolvedTheme}
          dir={direction}
          // The system theme can only be known on the client.
          suppressHydrationWarning
        >
          {children}
        </div>
      </DashboardRuntimeContext.Provider>
    </QueryClientProvider>
  );
}
