# Plugin System

**Status:** Delivered (M11). Widget registration, resolution, capability gating,
placeholder behavior and the editor settings panel are implemented in
`@nama/dashboard-core` and `@nama/dashboard-builder` (M3–M5). The data-source
contract now lives in `@nama/dashboard-types` with validated registration
(M7 runtime, contract published in M11). `examples/plugin-kit` registers one
plugin of each kind against the packed packages. Remote loading, marketplaces
and sandboxes remain out of scope.

The normative contracts live in:

- [Widget plugin contract](../plugins/widget-plugin-contract.md)
- [Data-source plugin contract](../plugins/data-source-plugin-contract.md)

This document describes the system around those contracts: categories,
lifecycle, versioning and security.

## Categories

1. **Visualization plugins** — charts, gauges, tables, maps, KPI cards, custom
   React components.
2. **Data-source plugins** — REST, SQL, MQTT, WebSocket, customer integrations.
   These run server-side.
3. **Editor extensions** — custom settings panels, controls, filters and actions.
   In v1 the editor extension point is the widget contract's `settings`
   component, which receives the current config, `onChange`, the available data
   sources and an optional query editor. A generic registry for custom control
   types or toolbar actions does not exist (TD-072).

## Lifecycle

```text
install (host dependency)
   → register (host calls registry.register)
   → validate manifest (id, version, config schema, capabilities)
   → resolve widget (by type)
   → migrate config if needed (configVersion)
   → validate widget config (Zod)
   → render inside error boundary
   → subscribe/cleanup on mount/unmount
```

Registration is explicit. The SDK never discovers or fetches plugins at
runtime. Installing a plugin is a trust decision equivalent to adding a
dependency (see [ADR-006](decisions/ADR-006-plugin-security.md)).

## Versioning

Three independent versions exist:

| Version | Owned by | Meaning |
| --- | --- | --- |
| Dashboard `schemaVersion` | Dashboard configuration | Structure of the whole dashboard document |
| Widget `configVersion` | Plugin contract | Shape of one widget's persisted `config` |
| Plugin package `version` | npm package | Semver of the code; may change without config changes |

A plugin upgrade that does not change configuration requires no migration.
Changing `configVersion` requires a migration from every supported older
version. Unsupported versions render a placeholder and preserve the data.

## Capabilities

Widgets declare capabilities so the runtime does not offer what they cannot
use:

```ts
capabilities?: {
  realtime?: boolean;   // may use subscribe/stream
  export?: boolean;     // may export data
  filters?: boolean;    // reacts to dashboard filters
};
```

A widget without `realtime` is never subscribed to a stream. A widget without
`filters` is not re-rendered on filter changes.

## Registry

```ts
interface WidgetRegistry {
  register(plugin: WidgetPlugin, options?: { replace?: boolean }): void;
  unregister(type: string): void;
  get(type: string): WidgetPlugin | undefined;
  list(): WidgetManifest[];
  has(type: string): boolean;
}
```

Rules:

- Duplicate `type` registration is rejected unless the host explicitly replaces.
- Built-in widgets register before host plugins; host plugins may override a
  built-in type only through an explicit `replace` option.
- The registry is exposed through `useWidgetRegistry()`; the underlying map is
  not public API.
- Unknown types fall back to a placeholder widget that shows the type, the
  `configVersion` and an explanation, and allows removal.

Data-source plugins use the same registration model on the server:

```ts
import { createDataSourcePluginRegistry } from "@nama/dashboard-types";

const registry = createDataSourcePluginRegistry([staticPlugin, restPlugin]);
registry.register(plugin, { replace?: true });
```

Registration validates the manifest, the Zod schemas, the required methods and
the declared capabilities before a plugin can serve a request; duplicate kinds
are rejected. `apps/api` builds the registry at boot from its installed
connectors (TD-071). The full rules are in the
[data-source plugin contract](../plugins/data-source-plugin-contract.md).

## Compatibility checks

Three independent versions are validated at their boundaries:

- `schemaVersion` (whole dashboard) is rejected when newer than the runtime and
  migrated by `parseDashboardConfig` when older.
- A widget's `configVersion` newer than the plugin's renders the placeholder;
  older versions migrate through `migrate()` or fail with
  `UnsupportedConfigVersionError`.
- Plugin package `version` must be semver and is validated at registration, so a
  manifest typo is a startup error instead of a support ticket. Capabilities
  must match the methods a data-source plugin ships.

## Built-in widgets

Initial:

- Line chart
- Area chart
- Bar chart
- Pie/donut chart
- Gauge
- KPI/stat card
- Data table

Later: heatmap, scatter, geographic map, logs, alerts, Markdown/text, event
timeline, custom React widget.

Built-in charts use Apache ECharts v6 with module-level imports. Persisted widget
configuration is expressed in widget terms (fields, series, formatting), not raw
ECharts option objects.

## Loading, errors and cleanup

- Every widget is wrapped in an error boundary. A failure renders the widget's
  error state, not a blank dashboard.
- Loading, empty and error states are localized and theme-aware.
- Widgets must abort in-flight requests and unsubscribe on unmount.
- A widget whose config fails validation shows a configuration error and remains
  editable; it does not crash the editor.
- Offscreen widgets are not mounted until near-visible.

## Security boundaries

- Visualization plugins execute with the host application's privileges. They are
  trusted, reviewed code.
- Visualization plugins receive data through the runtime adapter. They do not
  fetch from data sources directly and never receive credentials.
- Data-source plugins run server-side with limited capabilities and access
  credentials only through the credential abstraction.
- Remote code loading, marketplaces and iframe sandboxes are out of scope until a
  dedicated ADR exists.

## Testing requirements

- Manifest and capability validation.
- Configuration schema accept/reject cases.
- Migration from every supported `configVersion`, plus unsupported-version
  placeholder behavior.
- Registry duplicate and override behavior.
- Error boundary isolation.
- Realtime subscription only when declared.
- Rendering with both directions and all theme modes.

## Related documents

- [../plugins/widget-plugin-contract.md](../plugins/widget-plugin-contract.md)
- [../plugins/data-source-plugin-contract.md](../plugins/data-source-plugin-contract.md)
- [../plugins/plugin-authoring.md](../plugins/plugin-authoring.md)
- [decisions/ADR-006-plugin-security.md](decisions/ADR-006-plugin-security.md)
