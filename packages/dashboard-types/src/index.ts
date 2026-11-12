/**
 * Public platform constants shared by the SDK, the web application and the API.
 *
 * The dashboard configuration model, widget schemas and query contracts land in
 * M2. Until then this package intentionally exports values only.
 */

export const PLATFORM_NAME = "Nama";

export const SUPPORTED_LOCALES = ["en", "fa"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const LAYOUT_BREAKPOINTS = ["desktop", "tablet", "mobile"] as const;
export type Breakpoint = (typeof LAYOUT_BREAKPOINTS)[number];

export const SUPPORTED_THEMES = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof SUPPORTED_THEMES)[number];

/**
 * Hard limits from the M0 invariants. Server and client both enforce them;
 * changing a value here requires a schema-version decision.
 */
export const PLATFORM_LIMITS = Object.freeze({
  configBytes: 1024 * 1024,
  maxWidgets: 100,
  widgetWarningThreshold: 50,
  queryTimeoutMs: 15_000,
  maxQueryRows: 10_000,
  maxResultBytes: 5 * 1024 * 1024,
  maxLiveChartsPerViewport: 12,
  maxHistoryEntries: 50,
  maxRetainedVersions: 50,
  realtimeReplayMs: 60_000,
  realtimeReplayEvents: 1_000,
  realtimeThrottleMs: 250,
  widgetUpdatesPerSecond: 4,
} as const);

export type PlatformLimits = typeof PLATFORM_LIMITS;
