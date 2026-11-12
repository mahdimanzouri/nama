# Widget Plugin Contract (Normative)

**Status:** Proposed (M0). This file is the normative source for the widget
contract. Other documents link here instead of restating it.

## Manifest

```ts
interface WidgetManifest {
  /** Stable, globally unique type, e.g. "@acme/gauge". */
  id: string;
  /** Semver of the plugin package. */
  version: string;
  name: string;
  description?: string;
  author?: string;
}
```

Rules:

- `id` is lowercase, dot/scope-safe, and never changes after publication.
- `manifest.version` follows semver and is independent of `configVersion`.
- Names and descriptions are translation keys or plain English defaults that the
  host may override; they are never used as identifiers.

## Plugin interface

```ts
interface WidgetPlugin<TConfig = unknown> {
  manifest: WidgetManifest;

  /** Persisted widget configuration version. */
  configVersion: number;

  /** Runtime validation for the persisted config. */
  configSchema: ZodType<TConfig>;

  /** Used when creating a new widget. */
  defaultConfig: TConfig;

  /** Migrates config from an older version to configVersion. */
  migrate?: (config: unknown, fromVersion: number) => TConfig;

  defaultSize: { w: number; h: number };

  component: React.ComponentType<WidgetRenderProps<TConfig>>;

  settings?: React.ComponentType<WidgetSettingsProps<TConfig>>;

  capabilities?: {
    realtime?: boolean;
    export?: boolean;
    filters?: boolean;
  };
}
```

## Render props

```ts
interface WidgetRenderProps<TConfig> {
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

type WidgetDataState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: WidgetError }
  | {
      status: "ready";
      result: QueryResult;
      stream?: { latest?: unknown; buffered: number; stale: boolean };
      truncated?: boolean;
      lastUpdated: string;
    };
```

`WidgetError` carries a stable code, a message key and optional details; widgets
must render localized messages, not raw server errors.

`WidgetActions` may include refresh, open settings, export, and fullscreen. A
widget must not assume any action exists.

## Settings props

```ts
interface WidgetSettingsProps<TConfig> {
  widget: DashboardWidget;
  config: TConfig;
  onChange: (next: TConfig) => void;
  dataSources: DataSourceSummary[];
  queryEditor?: React.ReactNode;
  disabled?: boolean;
}
```

Settings components validate with `configSchema` before calling `onChange`.
Invalid intermediate input must not be persisted.

## Error, loading and empty states

- The runtime wraps every widget in an error boundary. A thrown error renders
  the widget's error state.
- Widgets must handle `status: "idle" | "loading" | "error" | "ready"` and an
  empty result (`rows.length === 0`).
- Widgets must not render raw HTML from data, and must escape or sanitize any
  user-provided strings they display.
- Widgets must abort requests and remove subscriptions on unmount.

## Configuration migration

```ts
migrate?: (config: unknown, fromVersion: number) => TConfig;
```

- Called when `widget.configVersion < plugin.configVersion`.
- Must return a config valid against the current `configSchema`.
- Must be idempotent when applied to already-current config is not required, but
  applying it twice to old input must not corrupt data.
- If `fromVersion` is unsupported, throw `UnsupportedConfigVersionError`. The
  runtime renders a placeholder, preserves the original config, and allows the
  user to remove the widget or upgrade the plugin.
- Migrations are tested for every supported source version.

## Size and layout

- `defaultSize` is used when inserting a new widget.
- The widget never receives or stores coordinates; positions come from
  `LayoutItem` entries per breakpoint.
- Widgets must render responsively within the provided `width` and `height`
  and must not assume a fixed aspect ratio.
- Charts must resize when the container changes and should use a resize observer.

## Data access

- Widgets receive data through `data` and the runtime; they do not call `fetch`,
  the data adapter or the realtime adapter directly.
- A widget that needs a query declares it in `DashboardWidget.query`; the runtime
  executes and binds variables/filters server-side.
- Widgets never receive credentials or opaque data-source secrets.
- A widget with `capabilities.realtime` may receive `data.stream`; others never
  subscribe.

## Security requirements

- No remote code loading or `eval`.
- No direct network calls from the widget component.
- No access to `window`/`document` at module import time.
- No `dangerouslySetInnerHTML` with untrusted data.
- All user-facing strings go through `locale.translate`.
- The plugin must be compatible with the host's React version (React 19 in v1)
  and declared as a peer dependency.

## Registration example

```tsx
import { z } from "zod";
import type { WidgetPlugin } from "@nama/dashboard-types";

const configSchema = z.object({
  valueField: z.string(),
  label: z.string().optional(),
  format: z
    .object({
      style: z.enum(["decimal", "percent", "currency"]).default("decimal"),
      maximumFractionDigits: z.number().int().min(0).max(6).default(0),
    })
    .default({}),
});

export const kpiPlugin: WidgetPlugin<z.infer<typeof configSchema>> = {
  manifest: {
    id: "@nama/kpi",
    version: "1.0.0",
    name: "KPI",
    description: "Single-value stat card",
  },
  configVersion: 1,
  configSchema,
  defaultConfig: { valueField: "value", format: { style: "decimal", maximumFractionDigits: 0 } },
  defaultSize: { w: 3, h: 4 },
  capabilities: { filters: true },
  component: KpiWidget,
  settings: KpiSettings,
};
```

## Validation checklist

Entering a widget into a dashboard requires:

- Unique manifest `id` and valid semver `version`.
- Integer `configVersion` ≥ 1 and a Zod `configSchema`.
- `defaultConfig` passes `configSchema`.
- `component` renders the four data states without throwing.
- Supported migration tests pass.
- Capabilities match actual behavior.
- RTL chrome and all three theme modes render correctly.
- No direct network access, no credential access, no unsanitized HTML.
