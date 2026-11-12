export { DashboardProvider, type DashboardProviderProps } from "./provider";
export { DashboardViewer, type DashboardViewerProps } from "./viewer";
export { DashboardEditor, type DashboardEditorProps } from "./editor/editor";
export { DashboardToolbar } from "./editor/toolbar";
export { WidgetSettings, type WidgetSettingsPropsPanel } from "./editor/settings";
export { WidgetPalette } from "./editor/palette";
export { useDashboardEditor, type DashboardEditorApi } from "./editor/context";
export type {
  DashboardPublishHandler,
  DashboardSaveHandler,
  PublishContext,
  PublishResult,
  SaveContext,
  SaveResult,
} from "./editor/types";
export { DashboardCanvas, type DashboardCanvasProps } from "./canvas";
export { WidgetRenderer, type WidgetRendererProps } from "./widget-renderer";
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
  createDashboardI18n,
  createThemeTokens,
  createWidgetRegistry,
  defineWidget,
  InvalidDashboardConfigError,
  isRevisionConflictError,
  normalizeDigits,
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
  WidgetSettingsProps,
  WidgetSize,
} from "@nama/dashboard-core";

export type {
  Breakpoint,
  DashboardConfig,
  DashboardLayouts,
  DashboardWidget,
  DataAdapter,
  LayoutItem,
  Locale,
  QueryContext,
  QueryDefinition,
  QueryError,
  QueryRequest,
  QueryResult,
  RealtimeAdapter,
  SubscriptionHandlers,
  ThemeMode,
  Unsubscribe,
  ValidationIssue,
  WidgetCapabilities,
  WidgetManifest,
} from "@nama/dashboard-types";
