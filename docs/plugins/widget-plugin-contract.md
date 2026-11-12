# Widget Plugin Contract (Normative)

**Status:** Manifest and capability schemas implemented in M2
(`widgetManifestSchema`, `widgetCapabilitiesSchema` in `@nama/dashboard-types`).
Runtime `WidgetPlugin`, render-prop and settings interfaces implemented in M3
(`@nama/dashboard-core`). M4 added the optional `defaultQuery` and
`defaultDataSourceId` creation defaults; M5 shipped seven built-ins from
`@nama/dashboard-builder/widgets` (table below). M11 added the public
`@nama/dashboard-builder/plugins` entry and `examples/plugin-kit`, a separate
package that registers a widget through it. This file is the normative source for
the widget contract; other documents link here instead of restating it.

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

  /**
   * Query used when the editor creates this widget without an explicit query.
   * The dashboard or widget may override it afterwards.
   */
  defaultQuery?: QueryDefinition;

  /**
   * Data source used when the editor creates this widget. The widget-level id
   * wins over the dashboard default, which wins over this value.
   */
  defaultDataSourceId?: string;

  component: (props: WidgetRenderProps<TConfig>) => ReactNode;

  settings?: (props: WidgetSettingsProps<TConfig>) => ReactNode;

  capabilities?: {
    realtime?: boolean;
    export?: boolean;
    filters?: boolean;
  };
}
```

Components are function components; `memo` and `forwardRef` results are accepted
because they remain callable with the same props. Class components are outside
the v1 contract: the erased registry form relies on a contravariant props
signature, and class `defaultProps` makes that impossible to type safely.

Creation defaults resolve in this order when `addWidget` runs:

1. an explicit data source or query passed by the caller;
2. for the data source only, the source already used by the dashboard (taken
   from the first existing widget);
3. the plugin's `defaultDataSourceId` and `defaultQuery`.

`defaultQuery` must be a complete `QueryDefinition`; it is persisted on the new
widget like any other query, so later plugin releases cannot retroactively change
an existing dashboard. Omitted defaults leave the widget without a query, and the
widget renders its empty state until the user configures one.

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

## Built-in widgets (M5 reference implementation)

The seven built-ins ship from `@nama/dashboard-builder/widgets` as
`NAMA_WIDGETS`. They are ordinary plugins under this contract, with
`configVersion: 1`.

| id | Name | Config schema (defaults) | Default size |
| --- | --- | --- | --- |
| `kpi` | KPI | `label` ("Metric"), `unit?`, `valueField?` | 3×5 |
| `line` | Line chart | `seriesLabel` ("Series"), `xField?`, `yField?`, `smooth` (false), `area` (false) | 9×5 |
| `area` | Area chart | Same as line, `area` defaults to true | 9×5 |
| `bar` | Bar chart | `seriesLabel`, `xField?`, `yField?` | 6×5 |
| `pie` | Pie chart | `labelField?`, `valueField?`, `donut` (true) | 4×5 |
| `gauge` | Gauge | `min` (0), `max` (200), `unit?`, `valueField?` — `max` must exceed `min` | 4×5 |
| `table` | Table | `maxRows` (25, 1–100) | 6×6 |

- Field overrides are optional; omitted fields are inferred from the result
  columns (timestamp/category strings and numeric measures).
- Config schemas are `.strict()` and use `.default()` so M4 documents remain
  valid; the settings panel validates every commit through the same schema.
- The built-ins contain no host-specific query or data-source defaults; hosts
  such as `apps/web` supply `defaultQuery`/`defaultDataSourceId` wrappers.
- Layout coordinates remain in `LayoutItem`; sizes above are insertion defaults
  only.

## Registration example

Plugin packages import the authoring surface from
`@nama/dashboard-builder/plugins`. It carries the contract, `defineWidget`,
`createWidgetRegistry` and `resolveWidgetConfig` without the viewer, editor or
built-in widgets. The host registers the plugin explicitly; nothing is
discovered or fetched at runtime.

```tsx
import { z } from "zod";
import { defineWidget } from "@nama/dashboard-builder/plugins";

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

export const kpiPlugin = defineWidget({
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
});
```

Registration rejects a duplicate manifest `id` unless the host passes
`{ replace: true }`, and rejects a manifest, `configVersion`, `defaultSize`,
`defaultConfig` or `component` that violates the contract. `examples/plugin-kit`
is a runnable example that also declares a version-2 config with a migration and
a settings panel.

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
