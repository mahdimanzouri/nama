/**
 * Public plugin SDK for widget authors: the plugin contract, the registration
 * helpers and config resolution, without the viewer or editor surfaces.
 */
export {
  createWidgetRegistry,
  defineWidget,
  resolveWidgetConfig,
  UnsupportedConfigVersionError,
  WidgetRegistrationError,
} from "@nama/dashboard-core";

export type {
  DashboardI18n,
  ErasedWidgetPlugin,
  ResolvedWidgetConfig,
  StreamState,
  ThemeTokens,
  WidgetActions,
  WidgetComponent,
  WidgetDataState,
  WidgetError,
  WidgetPlugin,
  WidgetRegistry,
  WidgetRenderProps,
  WidgetSelection,
  WidgetSettingsComponent,
  WidgetSettingsProps,
  WidgetSize,
} from "@nama/dashboard-core";

export type { WidgetCapabilities, WidgetManifest } from "@nama/dashboard-types";
