import type { ReactNode } from "react";
import {
  ISSUE_CODES,
  issuesFromZod,
  type DashboardWidget,
  type QueryDefinition,
  type QueryResult,
  type ValidationIssue,
  type WidgetCapabilities,
  type WidgetManifest,
} from "@nama/dashboard-types";
import type { ZodType } from "zod";

import type { DashboardI18n } from "./i18n";
import type { ThemeTokens } from "./theme";

export interface WidgetError {
  code: string;
  /** Translation key; widgets never render raw server messages. */
  messageKey: string;
  details?: unknown;
}

export interface StreamState {
  latest?: unknown;
  buffered: number;
  stale: boolean;
}

export type WidgetDataState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: WidgetError }
  | {
      status: "ready";
      result: QueryResult;
      stream?: StreamState;
      truncated?: boolean;
      lastUpdated: string;
    };

export interface WidgetActions {
  refresh?: () => void;
  openSettings?: () => void;
  export?: () => void;
  fullscreen?: () => void;
}

export type ResolvedFilters = Readonly<Record<string, unknown>>;

export interface DataSourceSummary {
  id: string;
  name: string;
  kind?: string;
}

export interface WidgetRenderProps<TConfig> {
  widget: DashboardWidget;
  config: TConfig;
  data: WidgetDataState;
  locale: DashboardI18n;
  theme: ThemeTokens;
  width: number;
  height: number;
  filters: ResolvedFilters;
  actions?: WidgetActions;
}

export interface WidgetSettingsProps<TConfig> {
  widget: DashboardWidget;
  config: TConfig;
  onChange: (next: TConfig) => void;
  dataSources: readonly DataSourceSummary[];
  queryEditor?: ReactNode;
  disabled?: boolean;
}

/**
 * Settings props are invariant in their config (through `onChange`), so the
 * erased form accepts any panel; only the editor invokes it.
 */
export type ErasedWidgetSettingsComponent = (props: never) => ReactNode;

export interface WidgetSize {
  w: number;
  h: number;
}

/**
 * Widgets are function components; `memo` and `forwardRef` results are callable
 * the same way. The signature is contravariant in its props, which is what makes
 * a concrete plugin assignable to the erased registry form.
 */
export type WidgetComponent<TConfig> = (props: WidgetRenderProps<TConfig>) => ReactNode;

export type WidgetSettingsComponent<TConfig> = (
  props: WidgetSettingsProps<TConfig>,
) => ReactNode;

export interface WidgetPlugin<TConfig = unknown> {
  manifest: WidgetManifest;
  /** Persisted configuration version, independent of the package version. */
  configVersion: number;
  configSchema: ZodType<TConfig>;
  defaultConfig: TConfig;
  /** Host-agnostic default data binding used when the editor adds the widget. */
  defaultQuery?: QueryDefinition;
  defaultDataSourceId?: string;
  migrate?: (config: unknown, fromVersion: number) => TConfig;
  defaultSize: WidgetSize;
  component: WidgetComponent<TConfig>;
  settings?: WidgetSettingsComponent<TConfig>;
  capabilities?: WidgetCapabilities;
}

/**
 * Type-erased form stored by the registry. Concrete plugins are assignable to
 * it because `never` props accept every config type.
 */
export interface ErasedWidgetPlugin {
  manifest: WidgetManifest;
  configVersion: number;
  configSchema: ZodType<unknown>;
  defaultConfig: unknown;
  defaultQuery?: QueryDefinition;
  defaultDataSourceId?: string;
  migrate?: (config: unknown, fromVersion: number) => unknown;
  defaultSize: WidgetSize;
  component: WidgetComponent<never>;
  settings?: ErasedWidgetSettingsComponent;
  capabilities?: WidgetCapabilities;
}

export function defineWidget<TConfig>(
  plugin: WidgetPlugin<TConfig>,
): WidgetPlugin<TConfig> {
  return plugin;
}

export type ResolvedWidgetConfig =
  | { status: "ready"; config: unknown }
  | { status: "unknownType" }
  | {
      status: "unsupportedVersion";
      fromVersion: number;
      supportedVersion: number;
    }
  | { status: "invalidConfig"; issues: ValidationIssue[] };

/**
 * Resolves persisted widget configuration against a registered plugin. A newer
 * persisted version is never coerced; the renderer shows a placeholder and the
 * data is preserved.
 */
export function resolveWidgetConfig(
  plugin: ErasedWidgetPlugin | undefined,
  widget: DashboardWidget,
): ResolvedWidgetConfig {
  if (!plugin) return { status: "unknownType" };

  if (widget.configVersion > plugin.configVersion || widget.configVersion < 1) {
    return {
      status: "unsupportedVersion",
      fromVersion: widget.configVersion,
      supportedVersion: plugin.configVersion,
    };
  }

  let candidate: unknown = widget.config;

  if (widget.configVersion < plugin.configVersion) {
    if (!plugin.migrate) {
      return {
        status: "unsupportedVersion",
        fromVersion: widget.configVersion,
        supportedVersion: plugin.configVersion,
      };
    }

    try {
      candidate = plugin.migrate(widget.config, widget.configVersion);
    } catch (error) {
      return {
        status: "invalidConfig",
        issues: [
          {
            code: ISSUE_CODES.widgetMigrationFailed,
            path: [],
            message: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
  }

  const result = plugin.configSchema.safeParse(candidate);
  if (!result.success) {
    return { status: "invalidConfig", issues: issuesFromZod(result.error) };
  }

  return { status: "ready", config: result.data };
}
