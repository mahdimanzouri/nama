# SDK Public API Proposal

**Status:** Proposed (M0). The M3 subset is implemented and validated by a
standalone consumer; M4 added the editor, save/publish/conflict callbacks and
the React Grid Layout canvas. See [implementation status](#implementation-status).

## Goals and constraints

- Render a persisted `DashboardConfig` in viewer or editor mode.
- Support controlled and uncontrolled use.
- Accept injected data, realtime, i18n and theme dependencies.
- Register built-in and custom widgets.
- Make no assumptions about the host backend.
- Be consumable by any React 19 application, including Next.js with
  `cacheComponents`.
- Never import Next.js APIs, read cookies, or open database connections.
- Avoid `window`/`document` access during module evaluation; mark client
  boundaries with `"use client"`.

React and React DOM are peer dependencies. The package exports ESM plus
declarations and an explicit CSS entry point.

## Package entry points

| Entry | Loads | Used by |
| --- | --- | --- |
| `@nama/dashboard-builder` | Provider, viewer, renderer, controls, hooks and runtime re-exports | Every host |
| `@nama/dashboard-builder/editor` | Editor, toolbar, palette, settings and draft hooks, plus React Grid Layout and the editor store | Editor hosts only |
| `@nama/dashboard-builder/widgets` | Seven built-in widgets; ECharts stays external | Hosts that register the defaults |
| `@nama/dashboard-builder/styles.css` | Theme tokens and component styles | Every host |

The editor entry exists since M9: importing the root package no longer pulls the
authoring UI, so a viewer-only host stays at the smaller budget.

```ts
// @nama/dashboard-builder
export { DashboardProvider } from "./provider";
export { DashboardViewer } from "./viewer";
export { DashboardCanvas } from "./canvas";
export { WidgetRenderer } from "./widget-renderer";
export { DashboardControls } from "./controls";
export {
  useDashboardControls,
  useDashboardControlsState,
} from "./controls";

export {
  useDashboard,
  useDashboardConfig,
  useDashboardLayout,
  useWidgetRegistry,
  useDataSource,
  useDashboardLocale,
  useDashboardTheme,
} from "./hooks";
```

```ts
// @nama/dashboard-builder/editor
export { DashboardEditor } from "./editor";
export { DashboardToolbar } from "./toolbar";
export { WidgetSettings } from "./widget-settings";
export { WidgetPalette } from "./widget-palette";
export { useDashboardEditor } from "./editor";
```

Both entries re-export the types a host needs: the root entry re-exports the
runtime helpers and contracts from `@nama/dashboard-core` and
`@nama/dashboard-types`, and the editor entry re-exports its own props and
handler types.

CSS:

```ts
import "@nama/dashboard-builder/styles.css";
```

## Components

| Component | Purpose |
| --- | --- |
| `DashboardProvider` | Injects config, adapters, locale, direction, theme, messages and save callbacks |
| `Dashboard` | Composed experience; `editable` selects editor or viewer |
| `DashboardEditor` | Full editing experience; accepts a host `children` slot |
| `DashboardViewer` | Read-only experience against the published config |
| `DashboardCanvas` | Grid and widget composition (LTR canvas) |
| `WidgetRenderer` | Renders one widget by ID or definition |
| `WidgetSettings` | Renders the selected widget's settings panel |
| `WidgetPalette` | Registered widget types; adding one places it on the active breakpoint |
| `DashboardToolbar` | Save, publish, undo/redo, preview and breakpoint controls |
| `DashboardControls` | Runtime variable fields, time-range presets and reset; never persists values |

## Provider contract

```ts
interface DashboardProviderProps {
  /** Current configuration. In controlled mode this is the source of truth. */
  config: DashboardConfig;

  /** Last known server revision for optimistic concurrency. */
  revision?: number;

  /** Published revision metadata; the editor shows it, the viewer ignores it. */
  publishedAt?: string | null;
  publishedRevision?: number | null;

  /** Stable dashboard id passed to data adapters. */
  dashboardId?: string;

  locale: string;
  direction: "ltr" | "rtl";
  theme: "light" | "dark" | "system";

  /** User time zone; falls back to the dashboard setting, then UTC. */
  timezone?: string;

  /** Host translation overrides; falls back to SDK messages, then English. */
  messages?: Record<string, string>;

  dataAdapter: DataAdapter;
  realtimeAdapter?: RealtimeAdapter;

  /** Controlled mode: called with the next config; the host persists it. */
  onChange?: (config: DashboardConfig) => void;

  /** Uncontrolled mode: persists the draft. Must reject with RevisionConflictError on 409. */
  onSave?: (
    config: DashboardConfig,
    context: { revision: number; signal?: AbortSignal },
  ) => Promise<{ revision: number; updatedAt?: string }>;

  /** Publishes the saved draft. The host calls the publish endpoint. */
  onPublish?: (context: {
    revision: number;
    signal?: AbortSignal;
  }) => Promise<{
    revision: number;
    publishedRevision?: number;
    publishedAt?: string;
  }>;

  /** Called when a save is rejected because the server has a newer revision. */
  onConflict?: (error: RevisionConflictError) => void;

  /** Initial variable values and dashboard-wide range; read on first render. */
  initialControls?: Partial<DashboardControlValues>;
  /** Called whenever a variable or the time range changes. Values are never persisted. */
  onControlsChange?: (values: DashboardControlValues) => void;

  widgets?: WidgetPlugin[];
  /** Share a cache when the host already owns one. */
  queryClient?: QueryClient;
  children: React.ReactNode;
}
```

`RevisionConflictError` is a typed error containing at least:

```ts
interface RevisionConflictError extends Error {
  code: "REVISION_CONFLICT";
  expectedRevision: number;
  currentRevision: number;
  currentConfig?: DashboardConfig;
}
```

## Hooks

| Hook | Returns | Notes |
| --- | --- | --- |
| `useDashboard()` | Runtime context | Config access, registry, i18n, theme, adapters |
| `useDashboardEditor()` | Draft state plus actions | Editor-only; throws outside `DashboardEditor`. Adds `dirty`, `canUndo`, `canRedo`, `canSave`, `canPublish`, `readOnly`, `save()`, `publish()` |
| `useDashboardConfig()` | `{ config, revision }` | Runtime snapshot; inside the editor use `useDashboardEditor().config` for the draft |
| `useDashboardLayout()` | `{ breakpoint, columns, rowHeight, gap, items }` | Resolved items inherit from wider breakpoints |
| `useWidgetRegistry()` | Registry API | Resolve, register, list widget types |
| `useDataSource()` | Data adapter facade | Execute/subscribe with dashboard variables resolved |
| `useDashboardControls()` | `{ values, setVariable, setTimeRange, reset }` | Runtime control state; viewer and editor share it |
| `useDashboardLocale()` | `{ locale, direction, translate, formatNumber, formatDate }` | Injected i18n |
| `useDashboardTheme()` | `{ mode, resolved, tokens }` | `setMode` arrives when the host owns edit controls |

Hooks are stable API. The internal Zustand store is **not** exported; consumers
must not rely on store shape or action names.

## Draft, save and conflict semantics

The implementation always gives `DashboardEditor` a local draft for its mount:
the host passes the persisted config and `revision` to the provider, and the
editor keeps every edit in an internal Zustand store until the host saves or
publishes it. `revision` defaults to `0` and is used as the `If-Match` value in
`SaveContext`/`PublishContext`.

**Callbacks**

- `onChange` runs after every committed edit with the complete next config. A
  drag or resize gesture commits once, so history and change notifications are
  not emitted per pointer move.
- `onSave` receives the draft and `{ revision }`; the host sends the revision as
  `If-Match`. A successful result updates the local revision and clears the
  dirty flag. Omitting `onSave` hides/disabled save.
- `onPublish` receives `{ revision }` and publishes the saved draft. The editor
  saves first when there are unsaved edits. Omitting `onPublish` hides the
  publish action.
- `onConflict` runs after a save or publish is rejected with a
  `RevisionConflictError`; the SDK also records the conflict locally.

**Conflict handling**

- `onSave`/`onPublish` must reject with `RevisionConflictError` (`code:
  "REVISION_CONFLICT"`, `currentRevision`) on HTTP 409. The SDK never
  force-overwrites and never clears unsaved edits on conflict.
- The editor shows a conflict banner with the expected and current revisions.
  "Dismiss" keeps editing; "Discard local changes" reverts the draft to the last
  locally saved config. Neither action talks to the server.
- Recovery that fetches the server draft is host-owned: the web app passes a
  `children` element to `DashboardEditor` and calls the draft endpoint itself.
  A host can also re-render the provider with fresh `config`/`revision`; when
  local edits are clean the editor adopts the new baseline, and when edits are
  dirty it records a conflict instead of discarding them.

**History and preview**

- Undo/redo history is bounded to 50 entries, scoped to the draft, and cleared
  on publish, version restore and draft replacement.
- A drag or resize gesture is one history entry, recorded with the edited
  breakpoint.
- Preview hides the palette and settings and disables direct manipulation
  without changing the draft.
- Viewers never see draft edits; `DashboardViewer` renders the published config
  the host passes it.

## Controls, visibility and interactions (M9)

Runtime control values are resolved in the SDK, never persisted and never sent
to a backend as configuration:

- `DashboardControls` renders a time-range preset picker, one field per declared
  variable (`string`, `number`, `boolean`, `date`, `timeRange`) and a reset
  action. It stores the host's *choices* and derives values from the config with
  `resolveControlValues`, so a config edit that removes a variable cannot leave
  a stale value behind.
- `useDashboardControls()` returns `{ values, setVariable, setTimeRange, reset }`
  for hosts that build their own chrome. `setVariable` ignores values that do not
  match the declared variable type.
- Every query request is built with `buildControlledQueryRequest`, which
  resolves dashboard filters, `filter.value` bindings, `query.parameter`
  bindings and the range. Range precedence is dashboard control →
  `query.timeRange` binding → the widget's persisted range.
- Dashboard filters apply only to widgets whose query `fields` include the
  filtered field, so adding a global filter cannot blank unrelated widgets.
  A `filter.value` binding resolves its filter by id first, then by field name.
- Widget visibility uses a small grammar: comparisons (`region == "emea"`,
  `minValue > 3`) joined by `and`/`or`, a bare variable for truthiness, and
  `not`. Parentheses are not supported. A missing variable is false; a
  malformed expression is treated as visible so a typo cannot hide a widget
  silently. The editor keeps hidden widgets on the board while authoring.
- A widget that declares `interaction.variable` receives `onSelect`, called
  with the raw category value of the clicked point. `WidgetRenderer` writes it
  into that variable; the variable's bindings then decide which queries change.
- `initialControls` and `onControlsChange` let a host seed values (for example
  from the URL) and react to changes without owning the state.

Export and import are host-facing helpers from `@nama/dashboard-types`:
`exportDashboardConfig(config, { applicationVersion })` creates the portable
envelope and `importDashboardConfig(input)` validates it, runs migrations and
regenerates widget, variable and filter ids. The editor toolbar wires both
actions; hosts may call the helpers directly for server-side import.

## Data and realtime injection

The host supplies a `DataAdapter` (see
[data-source-contracts.md](data-source-contracts.md)) and optionally a
`RealtimeAdapter` (see [realtime-protocol.md](realtime-protocol.md)). The SDK
ships convenience implementations: `createHttpDataAdapter` and
`createStaticDataAdapter` for snapshots, and `createWebSocketRealtimeAdapter`
(one shared socket) and `createSseRealtimeAdapter` (one stream per subscription)
for live data. It still does not choose a backend.

Widgets receive data through the runtime; they never call `fetch` directly.
A single shared realtime connection serves all subscriptions.

## Localization and theming

- `locale` and `direction` are explicit props. `messages` override SDK defaults.
- `translate` falls back host → SDK → English; missing keys render the key and
  log a development warning.
- Theme is applied through CSS variables on the provider root. Switching theme
  must not remount widgets.
- Charts consume the same tokens (see [i18n-theme.md](i18n-theme.md)).
- The canvas is LTR-only; the SDK exposes this limitation through a localized
  notice and documentation, not through a broken mirrored interaction.

## Example

```tsx
"use client";

import { DashboardProvider } from "@nama/dashboard-builder";
import { DashboardEditor } from "@nama/dashboard-builder/editor";
import "@nama/dashboard-builder/styles.css";

export function DashboardPage({ dashboard }: { dashboard: DashboardDraft }) {
  return (
    <DashboardProvider
      config={dashboard.config}
      revision={dashboard.revision}
      publishedRevision={dashboard.publishedRevision}
      locale="fa"
      direction="rtl"
      theme="dark"
      dataAdapter={dataAdapter}
      realtimeAdapter={realtimeAdapter}
      onSave={async (config, { revision }) => {
        const res = await api.saveDraft(dashboard.id, config, revision);
        return { revision: res.revision, updatedAt: res.updatedAt };
      }}
      onPublish={async ({ revision }) =>
        api.publishDashboard(dashboard.id, revision)
      }
      onConflict={(error) => showConflictDialog(error)}
    >
      <DashboardEditor>{/* host-owned conflict recovery */}</DashboardEditor>
    </DashboardProvider>
  );
}
```

## Error boundaries and states

- Each widget renders inside an error boundary; one failing widget does not
  unmount the dashboard.
- Loading, empty and error states are theme-aware and localized.
- A widget whose type or `configVersion` is unsupported renders a placeholder
  and remains editable/removable.
- Offscreen widgets are not mounted until near-visible; at most 12 live chart
  instances per viewport.

## Stability rules

- Public components, props and hooks are documented and covered by type tests.
- Internal stores, action names and module paths are not public API.
- Adding a required provider prop is a breaking change; new behavior prefers
  optional props with documented defaults.
- Persisted configuration changes follow the migration policy in
  [dashboard-schema.md](dashboard-schema.md).

## Related documents

- [overview.md](overview.md)
- [package-dependencies.md](package-dependencies.md)
- [dashboard-schema.md](dashboard-schema.md)
- [decisions/ADR-005-i18n-theme.md](decisions/ADR-005-i18n-theme.md)

## Implementation status

### M3 (SDK foundation)

Implemented in `@nama/dashboard-builder`:

- `DashboardProvider`, `DashboardViewer`, `DashboardCanvas`, `WidgetRenderer`,
  `WidgetErrorBoundary`
- `useDashboard`, `useDashboardConfig`, `useDashboardLayout`, `useDashboardLocale`,
  `useDashboardTheme`, `useWidgetRegistry`, `useDataSource`
- `defineWidget`, the widget/plugin types and the runtime error classes re-exported
  from `@nama/dashboard-core`
- `@nama/dashboard-builder/styles.css`

### M4 (visual editor)

- `DashboardEditor` (with a host `children` slot), `DashboardToolbar`,
  `WidgetPalette`, `WidgetSettings`, `useDashboardEditor`
- Draft store with add/remove/select, keyboard and pointer move/resize,
  per-breakpoint materialize-on-edit, 50-entry undo/redo, preview mode,
  dirty tracking and save/publish phases
- `onChange`, `onSave`, `onPublish` and `onConflict` wiring against the provider
- `RevisionConflictError` mapping to an in-editor conflict banner
- React Grid Layout 2.3.0 canvas (`GridLayout`, `useContainerWidth`,
  `noCompactor`) with the generated grid CSS in `styles.css`
- Widget plugins may declare `defaultQuery` and `defaultDataSourceId`, applied
  when a widget is created

### M5 (visualization system)

- A second package entry, `@nama/dashboard-builder/widgets`, exporting
  `NAMA_WIDGETS`, the seven built-in plugins, their config schemas/types, the
  chart option builders and the shared `EChart` host
- Built-ins: `kpi`, `line`, `area`, `bar`, `pie`, `gauge`, `table`, each with a
  Zod `configSchema`, defaults that keep M4 documents valid, a settings panel and
  loading/error/empty/truncated states
- Chart rendering: ECharts 6.1.0 from module imports only; CSS-token colours
  resolved after mount and re-resolved on `data-theme`; animation disabled under
  `prefers-reduced-motion`; tooltips rendered as canvas rich text
- `WidgetSettings` validates every plugin config commit and renders field-level
  `ValidationIssue`s without touching the draft
- `usePrefersReducedMotion` in the main entry

### M9 (controls, visibility and interactions)

- `DashboardControls`, `useDashboardControls` and
  `useDashboardControlsState` in the main entry
- `buildControlledQueryRequest`, `resolveControlValues`,
  `resolveDashboardFilters`, `evaluateVisibilityCondition` and
  `isWidgetVisible` re-exported from `@nama/dashboard-core`
- The editorial surfaces (`DashboardEditor`, `DashboardToolbar`,
  `WidgetSettings`, `WidgetPalette`, `useDashboardEditor`) moved to the
  `@nama/dashboard-builder/editor` entry, so the root entry no longer ships
  React Grid Layout, the editor store or the authoring panels
- Variable, filter and interaction authoring, plus JSON import/export, inside
  the editor entry

Not yet exported or implemented, because the code does not exist:

- `Dashboard` composed entry point — hosts compose `DashboardProvider` with the
  viewer or editor themselves
- Multi-series, stacked or combo charts — tracked as TD-040

Deliberate differences from the proposal above:

- Widget components are **function components** (including `memo`/`forwardRef`
  results). `WidgetSettingsProps` is invariant in its config, so an erased
  `ComponentType` cannot accept concrete plugins without `any`.
- The editor canvas uses React Grid Layout; the read-only `DashboardCanvas`
  (viewer) still uses CSS grid. Both derive from the same `LayoutItem`s, but a
  pixel-parity test between the two is not yet written.
- `timezone`, `dashboardId`, `queryClient`, `publishedAt` and
  `publishedRevision` are optional provider props; none is required.
- `useDashboardConfig` reflects the runtime config and has no `dirty` field;
  draft state is read through `useDashboardEditor()`.
- The conflict banner's discard is local. Fetching the server draft and
  rebasing the editor is a host responsibility in M4 (the web app renders a
  reload control through the editor's `children` slot).

