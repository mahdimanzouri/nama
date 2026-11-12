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
  type RevisionConflictError,
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
import type { DashboardPublishHandler, DashboardSaveHandler } from "./editor/types";
import { useSystemPrefersDark } from "./media";

export interface DashboardProviderProps {
  /** Persisted configuration; viewers receive the published one only. */
  config: DashboardConfig;
  /** Last known server revision; conflict handling uses it from M4. */
  revision?: number;
  /** Published revision metadata shown by the editor; the viewer ignores it. */
  publishedAt?: string | null;
  publishedRevision?: number | null;
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

  /** Controlled mode: called with every committed configuration. */
  onChange?: (config: DashboardConfig) => void;
  /** Uncontrolled mode: persists the draft; reject on 409 to signal a conflict. */
  onSave?: DashboardSaveHandler;
  /** Publishes the saved draft. Omit to hide the publish action. */
  onPublish?: DashboardPublishHandler;
  /** Notified after a `REVISION_CONFLICT` rejection of save or publish. */
  onConflict?: (error: RevisionConflictError) => void;

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
  publishedAt = null,
  publishedRevision = null,
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
  onChange,
  onSave,
  onPublish,
  onConflict,
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
  const editor = useMemo(
    () => ({ onChange, onSave, onPublish, onConflict }),
    [onChange, onSave, onPublish, onConflict],
  );

  const runtime = useMemo<DashboardRuntime>(
    () => ({
      config: parsedConfig,
      revision,
      publishedAt,
      publishedRevision,
      dashboardId,
      i18n,
      theme: { mode: theme, resolved: resolvedTheme, tokens },
      registry,
      dataAdapter,
      realtimeAdapter,
      timezone: resolvedTimeZone,
      editor,
    }),
    [
      parsedConfig,
      revision,
      publishedAt,
      publishedRevision,
      dashboardId,
      i18n,
      theme,
      resolvedTheme,
      tokens,
      registry,
      dataAdapter,
      realtimeAdapter,
      resolvedTimeZone,
      editor,
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
