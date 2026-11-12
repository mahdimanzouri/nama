export { DashboardProvider, type DashboardProviderProps } from "./provider";
export { DashboardViewer, type DashboardViewerProps } from "./viewer";
export { DashboardCanvas, type DashboardCanvasProps } from "./canvas";
export { WidgetRenderer, type WidgetRendererProps } from "./widget-renderer";
export {
  DashboardControls,
  useDashboardControls,
  useDashboardControlsState,
  type DashboardControlsController,
  type DashboardControlsProps,
  type DashboardControlsState,
} from "./controls";
export { useDataSource, type DashboardDataSource } from "./data-source";
export { WidgetErrorBoundary } from "./error-boundary";
export {
  useDashboard,
  useDashboardConfig,
  useDashboardLayout,
  useDashboardLocale,
  useDashboardTheme,
  useWidgetRegistry,
  type DashboardLayoutState,
} from "./hooks";
export type { DashboardRuntime } from "./context";

export {
  buildControlledQueryRequest,
  createDashboardI18n,
  createThemeTokens,
  createWidgetRegistry,
  defineWidget,
  defaultVariables,
  evaluateVisibilityCondition,
  InvalidDashboardConfigError,
  isRevisionConflictError,
  isWidgetVisible,
  normalizeDigits,
  queryKeyForRequest,
  resolveControlValues,
  resolveDashboardFilters,
  RevisionConflictError,
  UnsupportedConfigVersionError,
  WidgetRegistrationError,
} from "@nama/dashboard-core";

export type {
  DashboardI18n,
  DataSourceSummary,
  Direction,
  ErasedWidgetPlugin,
  ResolvedFilters,
  ResolvedLayoutItem,
  ResolvedTheme,
  StreamState,
  ThemeToken,
  ThemeTokens,
  WidgetActions,
  WidgetDataState,
  WidgetError,
  WidgetPlugin,
  WidgetRegistry,
  WidgetRenderProps,
  WidgetSelection,
  WidgetSettingsProps,
  WidgetSize,
} from "@nama/dashboard-core";

export type {
  Breakpoint,
  DashboardConfig,
  DashboardControlValues,
  DashboardFilter,
  DashboardLayouts,
  DashboardVariable,
  DashboardWidget,
  DataAdapter,
  LayoutItem,
  Locale,
  QueryContext,
  QueryDefinition,
  QueryError,
  QueryRequest,
  QueryResult,
  QueryTimeRange,
  RealtimeAdapter,
  SubscriptionHandlers,
  ThemeMode,
  Unsubscribe,
  ValidationIssue,
  WidgetCapabilities,
  WidgetInteraction,
  WidgetManifest,
  WidgetVisibility,
} from "@nama/dashboard-types";
