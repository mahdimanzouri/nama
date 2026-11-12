# SDK Public API Proposal

**Status:** Proposed (M0). The M3 subset is implemented and validated by a
standalone consumer; see [Implementation status](#m3-implementation-status).

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

```ts
// @nama/dashboard-builder
export { DashboardProvider } from "./provider";
export { Dashboard } from "./dashboard";
export { DashboardEditor } from "./editor";
export { DashboardViewer } from "./viewer";
export { DashboardCanvas } from "./canvas";
export { WidgetRenderer } from "./widget-renderer";
export { WidgetSettings } from "./widget-settings";
export { DashboardToolbar } from "./toolbar";
export { DashboardFilters } from "./filters";

export {
  useDashboard,
  useDashboardEditor,
  useDashboardConfig,
  useDashboardLayout,
  useWidgetRegistry,
  useDataSource,
  useDashboardLocale,
  useDashboardTheme,
} from "./hooks";

export type {
  DashboardProviderProps,
  DashboardConfig,
  DashboardWidget,
  RevisionConflictError,
  WidgetPlugin,
  DataAdapter,
  RealtimeAdapter,
} from "@nama/dashboard-types";
```

CSS:

```ts
import "@nama/dashboard-builder/styles.css";
```

## Components

| Component | Purpose |
| --- | --- |
| `DashboardProvider` | Injects config, adapters, locale, direction, theme, messages and save callbacks |
| `Dashboard` | Composed experience; `editable` selects editor or viewer |
| `DashboardEditor` | Full editing experience |
| `DashboardViewer` | Read-only experience against the published config |
| `DashboardCanvas` | Grid and widget composition (LTR canvas) |
| `WidgetRenderer` | Renders one widget by ID or definition |
| `WidgetSettings` | Renders the selected widget's settings panel |
| `DashboardToolbar` | Save, undo/redo, preview and controls |
| `DashboardFilters` | Global filters and variables |

## Provider contract

```ts
interface DashboardProviderProps {
  /** Current configuration. In controlled mode this is the source of truth. */
  config: DashboardConfig;

  /** Last known server revision for optimistic concurrency. */
  revision?: number;

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
  ) => Promise<{ revision: number }>;

  /** Called when a save is rejected because the server has a newer revision. */
  onConflict?: (error: RevisionConflictError) => void;

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
| `useDashboard()` | Runtime context | Editing state, config access, selected widget |
| `useDashboardEditor()` | Editor actions | Add, remove, move, resize, undo, redo, save, publish |
| `useDashboardConfig()` | `{ config, revision }` | Read-only snapshot; `dirty` arrives with the editor |
| `useDashboardLayout()` | `{ breakpoint, columns, rowHeight, gap, items }` | Resolved items inherit from wider breakpoints |
| `useWidgetRegistry()` | Registry API | Resolve, register, list widget types |
| `useDataSource()` | Data adapter facade | Execute/subscribe with dashboard variables resolved |
| `useDashboardLocale()` | `{ locale, direction, translate, formatNumber, formatDate }` | Injected i18n |
| `useDashboardTheme()` | `{ mode, resolved, tokens }` | `setMode` arrives when the host owns edit controls |

Hooks are stable API. The internal Zustand store is **not** exported; consumers
must not rely on store shape or action names.

## Controlled and uncontrolled modes

**Controlled**

- The host owns `config` and `revision`.
- Editor actions call `onChange` with a new immutable config.
- The host decides when to persist; the SDK never writes server state in this mode.
- If the host supplies a new `config` while local edits are pending, the SDK
  surfaces a conflict instead of silently overwriting. The host resolves it by
  replacing the config or by asking the user to discard local changes.

**Uncontrolled**

- The SDK owns the draft in local state and calls `onSave` on save.
- `revision` is updated from the resolved save result.
- `onSave` must reject with `RevisionConflictError` on HTTP 409. The SDK never
  force-overwrites a newer revision and never clears unsaved edits.
- Publishing is a separate host callback (via `onSave` metadata or a dedicated
  toolbar action wired by the host) that calls the publish endpoint.

In both modes:

- Viewers never see draft edits.
- Undo/redo history is bounded to 50 entries, scoped to the draft, and cleared
  on publish or version restore.
- A drag or resize gesture is one history entry.
- History entries record the edited breakpoint, not all breakpoints.

## Data and realtime injection

The host supplies a `DataAdapter` (see
[data-source-contracts.md](data-source-contracts.md)) and optionally a
`RealtimeAdapter` (see [realtime-protocol.md](realtime-protocol.md)). The SDK
ships HTTP, static/mock and SSE-oriented adapters for convenience but does not
choose a backend.

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

import {
  DashboardProvider,
  Dashboard,
} from "@nama/dashboard-builder";
import "@nama/dashboard-builder/styles.css";

export function DashboardPage() {
  return (
    <DashboardProvider
      config={dashboardConfig}
      revision={dashboard.revision}
      locale="fa"
      direction="rtl"
      theme="dark"
      dataAdapter={dataAdapter}
      realtimeAdapter={realtimeAdapter}
      onSave={async (config, { revision }) => {
        const res = await api.saveDraft(dashboard.id, config, revision);
        return { revision: res.revision };
      }}
      onConflict={(error) => showConflictDialog(error)}
    >
      <Dashboard editable dashboardId={dashboard.id} />
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

## M3 implementation status

Implemented in `@nama/dashboard-builder`:

- `DashboardProvider`, `DashboardViewer`, `DashboardCanvas`, `WidgetRenderer`,
  `WidgetErrorBoundary`
- `useDashboard`, `useDashboardConfig`, `useDashboardLayout`, `useDashboardLocale`,
  `useDashboardTheme`, `useWidgetRegistry`, `useDataSource`
- `defineWidget`, the widget/plugin types and the runtime error classes re-exported
  from `@nama/dashboard-core`
- `@nama/dashboard-builder/styles.css`

Not yet exported, because the code does not exist:

- `Dashboard`, `DashboardEditor`, `WidgetSettings`, `DashboardToolbar`,
  `DashboardFilters`, `useDashboardEditor` — M4
- `onChange`, `onSave`, `onConflict` behavior; the provider is read-only until the
  editor owns a draft
- Built-in widgets — M5

Deliberate differences from the proposal above:

- Widget components are **function components** (including `memo`/`forwardRef`
  results). `WidgetSettingsProps` is invariant in its config, so an erased
  `ComponentType` cannot accept concrete plugins without `any`.
- The canvas positions widgets with a CSS grid. Drag, resize and container-width
  math arrive with React Grid Layout in M4.
- `timezone`, `dashboardId` and `queryClient` are optional provider props added
  during implementation; none is required, so existing hosts are unaffected.
- `useDashboardConfig` omits `dirty`; controlled writes do not exist yet.

