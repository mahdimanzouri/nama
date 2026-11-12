# Dashboard Configuration Schema

**Status:** Proposed (M0). Exact defaults and optionality are finalized in M2.

The persisted configuration is portable data. It never contains credentials,
ownership, shares or audit fields. Server-owned metadata lives in relational
columns (see [data-model.md](data-model.md)).

## Document versus configuration

- `DashboardDocument` is the API shape returned to editors. It includes server
  metadata plus the draft and published configurations.
- `DashboardConfig` is the portable document stored in `draftConfig` and
  `publishedConfig` JSONB columns.

```ts
type Breakpoint = "desktop" | "tablet" | "mobile";

interface DashboardDocument {
  id: string;                 // UUIDv7
  organizationId: string;
  name: string;
  draftConfig: DashboardConfig;
  publishedConfig?: DashboardConfig;
  revision: number;           // optimistic concurrency
  updatedAt: string;          // UTC ISO-8601
  publishedAt?: string;       // UTC ISO-8601
}

interface DashboardConfig {
  schemaVersion: number;      // currently 1
  metadata: DashboardMetadata;
  settings: DashboardSettings;
  variables: DashboardVariable[];
  filters: DashboardFilter[];
  layouts: Record<Breakpoint, DashboardLayout>;
  widgets: DashboardWidget[];
}
```

## Field tables

### `DashboardMetadata`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `title` | `string` | yes | 1–200 characters |
| `description` | `string` | no | max 2,000 characters |
| `tags` | `string[]` | no | max 20 tags, each ≤ 40 characters |

### `DashboardSettings`

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `refreshInterval` | `number` | 60 | Seconds; minimum 5; `0` disables automatic refresh |
| `timezone` | `string` | unset | IANA zone; resolution precedence user → dashboard → organization |

### `DashboardLayout`

| Field | Type | Notes |
| --- | --- | --- |
| `columns` | `number` | Grid columns for this breakpoint (12 desktop, 8 tablet, 4 mobile) |
| `rowHeight` | `number` | Pixels |
| `gap` | `number` | Pixels |
| `items` | `LayoutItem[]` | Positions for widgets present at this breakpoint |

### `LayoutItem`

| Field | Type | Notes |
| --- | --- | --- |
| `widgetId` | `string` | References `DashboardWidget.id` |
| `x` | `number` | Grid column, LTR origin |
| `y` | `number` | Grid row |
| `w` | `number` | Width in columns |
| `h` | `number` | Height in rows |

`LayoutItem` entries are the **only** source of position. Widgets never carry
coordinates.

### `DashboardWidget`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | yes | UUIDv7, stable |
| `type` | `string` | yes | Registered widget type, e.g. `kpi`, `line` |
| `configVersion` | `number` | yes | Version of this widget's configuration contract |
| `title` | `string` | yes | Display title |
| `dataSourceId` | `string` | no | Opaque ID; credentials never enter the config |
| `config` | `Record<string, unknown>` | yes | Validated by the widget's Zod schema |
| `query` | `QueryDefinition` | no | See [data-source-contracts.md](data-source-contracts.md) |
| `visibility` | `object` | no | `{ enabled: boolean; condition?: string }` |

### `DashboardVariable`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | UUIDv7 |
| `name` | `string` | Stable identifier, not translated |
| `type` | `"string" \| "number" \| "boolean" \| "date" \| "timeRange"` | Input type |
| `defaultValue` | `unknown` | Must match `type` |
| `bindings` | `VariableBinding[]` | Where the value is applied |

### `VariableBinding`

| Field | Type | Notes |
| --- | --- | --- |
| `target` | `"query.parameter" \| "query.timeRange" \| "filter.value"` | Resolution target |
| `parameter` | `string` | Parameter or filter key |

### `DashboardFilter`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | UUIDv7 |
| `field` | `string` | Dataset field |
| `operator` | `"eq" \| "neq" \| "in" \| "contains" \| "gt" \| "gte" \| "lt" \| "lte" \| "between"` | Comparison |
| `value` | `unknown` | Validated against `operator` |

## Layout semantics

1. Breakpoints are `desktop`, `tablet`, `mobile`, widest to narrowest.
2. A widget without an item at a breakpoint inherits the next wider breakpoint
   at render time.
3. The inherited item is materialized when that breakpoint is first edited; the
   edit records a history entry for the edited breakpoint only.
4. If no breakpoint contains the widget, it is appended below the existing
   layout at the current breakpoint.
5. Widgets present in `widgets` but absent from every layout are a validation
   warning, not a hard error; they are shown below the canvas in the editor.

## Versioning and migration

- `schemaVersion` is the dashboard configuration version, currently `1`.
- Every widget has an independent `configVersion`.
- Plugin package `version` is independent of both.
- Migrations run on read and on import, and are idempotent.
- A dashboard-level migration composes widget-level migrations for each widget
  type and version.
- Unsupported `schemaVersion` or `configVersion` renders a placeholder for the
  affected widget or dashboard; it never crashes the whole page and never drops
  unknown data on save.
- Every supported version keeps a tested migration path; CI requires migration
  tests before a schema change merges.

Proposed migration signature:

```ts
type MigrateConfig<T> = (config: unknown, fromVersion: number) => T;
```

## Validation and caps

- Validate before rendering and before saving.
- Errors carry a stable code, a message, and `path: Array<string | number>`.
  They are never free text.
- Caps: serialized configuration ≤ **1 MiB**; ≤ **100 widgets** (warn above 50).
- Import/export rejects documents above the caps and rejects unknown
  `schemaVersion` values above the supported maximum.

```ts
interface ValidationIssue {
  code: string;
  path: Array<string | number>;
  message: string;
}

type ValidationResult =
  | { ok: true; value: DashboardConfig }
  | { ok: false; issues: ValidationIssue[] };
```

## Examples

### KPI widget

```json
{
  "id": "0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b21",
  "type": "kpi",
  "configVersion": 1,
  "title": "Production today",
  "dataSourceId": "0192f4c2-1111-7abc-8def-000000000001",
  "query": {
    "queryId": "production-output",
    "fields": ["production"],
    "limit": 1
  },
  "config": {
    "valueField": "production",
    "label": "Units produced",
    "format": { "style": "decimal", "maximumFractionDigits": 0 },
    "comparison": { "mode": "previousPeriod" },
    "thresholds": [
      { "value": 1000, "tone": "warning" },
      { "value": 800, "tone": "danger" }
    ]
  }
}
```

### Line widget

```json
{
  "id": "0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b22",
  "type": "line",
  "configVersion": 1,
  "title": "Output trend",
  "dataSourceId": "0192f4c2-1111-7abc-8def-000000000001",
  "query": {
    "queryId": "production-timeseries",
    "fields": ["timestamp", "production"],
    "timeRange": { "mode": "relative", "last": "24h" }
  },
  "config": {
    "xField": "timestamp",
    "series": [{ "field": "production", "label": "Production" }],
    "smooth": true,
    "showLegend": true
  }
}
```

The persisted config stays independent of raw ECharts options so the format is
not permanently coupled to one charting engine.

### Layout

```json
{
  "desktop": {
    "columns": 12,
    "rowHeight": 40,
    "gap": 8,
    "items": [
      { "widgetId": "0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b21", "x": 0, "y": 0, "w": 3, "h": 4 },
      { "widgetId": "0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b22", "x": 3, "y": 0, "w": 9, "h": 8 }
    ]
  },
  "tablet": { "columns": 8, "rowHeight": 40, "gap": 8, "items": [] },
  "mobile": { "columns": 4, "rowHeight": 40, "gap": 8, "items": [] }
}
```

## Import and export

- Export produces a `DashboardConfig` plus a format envelope containing
  `schemaVersion`, `exportedAt` and an application version.
- Import validates the envelope, runs migrations, validates the result, and
  rejects on cap violation.
- Import never preserves server-owned IDs that could collide; widget and
  variable IDs are regenerated when importing into a different dashboard.
- Unknown widget types are preserved but shown as placeholders.

## What configuration never contains

Ownership, shares, revision, published state, data-source credentials, database
URLs, secrets, access tokens, telemetry samples or raw query results.
