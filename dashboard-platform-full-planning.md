# Dashboard Platform --- Full Architecture & Implementation Plan

**Document status:** Proposed architecture\
**Version:** 1.1\
**Date:** 2026-11-12

------------------------------------------------------------------------

## 0. Decision register

These decisions are settled for the first release and are applied
throughout the document. Superseded options are recorded in section 20.

| Decision                  | Value                                  | Consequence                                                                                                              |
| ------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Grid direction in v1      | Canvas editing is LTR-only             | All chrome, text, forms, menus and charts are RTL-aware; drag/resize math stays LTR and the limitation is disclosed to users |
| First vertical slice      | Monitoring-first                       | KPI and line widgets, HTTP polling, one organization, viewer plus minimal editor, save/load                              |
| SDK distribution          | Private workspace only                 | No registry or publish pipeline until a second consumer exists; the consumer test packs the tarball locally              |
| Editing model             | Draft plus explicit publish            | Viewers never observe unsaved edits; publishing copies the draft to the published configuration and creates a version     |
| Configuration concurrency | Optimistic with `If-Match`             | Concurrent saves fail with `409` instead of overwriting; the editor surfaces a conflict workflow                         |
| Initial package set       | Four packages                          | `dashboard-types`, `dashboard-core`, `dashboard-builder`, `api-client`; split further only on evidence                   |
| Tenant isolation          | Enforced in the data layer; RLS in M0  | Repository/service scoping is mandatory; row-level security is decided in M0 and cross-tenant tests run in CI              |

------------------------------------------------------------------------

## 1. Executive summary

Build an extensible dashboard platform with three independently defined
parts:

1.  **Dashboard SDK** --- a reusable React package for rendering and
    editing dashboards.
2.  **Web application** --- a Next.js application that provides the
    product UI, authentication experience, dashboard management and
    administration.
3.  **Backend API** --- a separate service responsible for persistence,
    authorization, data-source management, query execution and real-time
    delivery.

The product must support both monitoring dashboards and general-purpose
analytical/business dashboards. It must support English and Persian, RTL
and LTR layouts, and light, dark and system themes.

The SDK must remain independent of Next.js and the platform backend. It
should be possible to embed it in another React application and connect
it to a different backend through documented interfaces.

### Guiding principles

-   Define stable contracts before implementing features.
-   Keep the first backend a modular monolith; split services only when
    justified.
-   Keep dashboard configuration portable, versioned and validated.
-   Separate visualization from data acquisition.
-   Separate server state from local editor state.
-   Design real-time support as a first-class capability.
-   Make RTL, localization and themes foundational rather than late
    additions.
-   Treat plugins as explicit extension points with security boundaries.
-   Build only abstractions that have a concrete use case.
-   Test the SDK in a clean, separate consumer application.

------------------------------------------------------------------------

## 2. Product scope

### 2.1 Primary use cases

-   Industrial and manufacturing monitoring.
-   Operational dashboards and machine status.
-   Production, quality and performance KPIs.
-   Business intelligence and analytics.
-   Administrative dashboards.
-   Real-time event and telemetry visualization.
-   Embedded dashboards inside other React applications.

### 2.2 User roles

Initial role concepts:

-   **Organization owner:** manages organization settings, members and
    billing/quotas if introduced.
-   **Organization administrator:** manages users, roles and
    organization resources.
-   **Dashboard owner:** manages a dashboard and its sharing.
-   **Dashboard editor:** edits dashboard layout, widgets and
    configuration.
-   **Dashboard viewer:** views dashboards and uses permitted filters.
-   **Data-source administrator:** configures and tests data sources.
-   **Custom role:** organization-defined combination of permissions.

Authorization must be enforced by the backend. Hiding a button in the UI
is not authorization.

### 2.3 Out of initial scope

Do not attempt these in the first release:

-   A public marketplace for arbitrary third-party code.
-   Unrestricted SQL execution from browsers.
-   A full general-purpose page builder.
-   Microservices for every backend module.
-   A custom charting engine.
-   A full alerting/incident-management product.
-   Arbitrary code execution inside dashboard widgets.

------------------------------------------------------------------------

## 3. Technology decisions

These are the proposed defaults. Verify current versions and
compatibility when implementation begins.

  -----------------------------------------------------------------------
  Area                    Technology              Responsibility
  ----------------------- ----------------------- -----------------------
  Monorepo                pnpm workspaces         Package and application
                                                  workspace

  Build orchestration     Turborepo               Build, test, lint and
                                                  task caching

  Language                TypeScript strict       Shared type safety

  Web application         Next.js App Router      Product UI and
                                                  application routing

  UI primitives           shadcn/ui + Tailwind    Application and builder
                          CSS                     UI

  Localization            next-intl in web app    Locale routing and app
                                                  messages

  SDK localization        Independent i18n        Keep SDK
                          interface               framework-independent

  Dashboard layout        React Grid Layout v2    Drag, resize and
                                                  responsive grid

  Charts                  Apache ECharts          Built-in chart
                                                  visualization

  Client/server state     Zustand / TanStack      Editor state / server
                          Query                   state

  Validation              Zod                     Runtime schema
                                                  validation

  Backend                 Node.js + Fastify       Independent API

  Database                PostgreSQL              Product metadata and
                                                  configurations

  ORM                     Prisma                  Database access and
                                                  migrations

  API contract            OpenAPI                 Backend contract and
                                                  typed client

  Realtime                WebSocket + SSE         Live updates and event
                                                  delivery

  Package build           tsdown                  ESM bundles and
                                                  declarations

  Unit/integration tests  Vitest                  Package and backend
                                                  tests

  E2E                     Playwright              User workflow tests

  Component docs          Storybook               Widget and UI
                                                  development

  Logging                 Structured logger       Backend observability

  Cache/queue             Introduce only when     Caching and
                          needed                  asynchronous jobs
  -----------------------------------------------------------------------

### 3.1 Important implementation notes

-   React and React DOM should be peer dependencies of the SDK.
-   Avoid bundling duplicate React copies.
-   Keep Next.js APIs out of SDK packages.
-   Do not assume `window` or `document` exists at module import time.
-   Provide explicit CSS exports.
-   Use CSS variables for theme tokens.
-   Use a shared connection manager; do not open one WebSocket per
    widget.
-   Treat high-frequency telemetry separately from ordinary query
    snapshots.
-   Review the license and compatibility of every dependency before
    adopting it.

### 3.2 Verified stack constraints (2026-11-12)

-   React Grid Layout 2.x is a rewrite: the `width` prop is required and
    is supplied through the library's container-width hook. Keep 1.5.x
    as the documented fallback if React 19 compatibility proves
    inadequate.
-   React Grid Layout provides no right-to-left support. Its
    drag/resize math is LTR-only; this is the reason for the v1 canvas
    decision in section 0.
-   The SDK is client-only. Mark boundaries with `"use client"`, avoid
    `window` and `document` during module evaluation, and never import
    Next.js APIs.
-   The web application runs Next.js with `cacheComponents` enabled.
    Dashboard routes are explicitly dynamic, and the canvas and charts
    are loaded client-side.
-   Verify that the package build preserves `"use client"` directives
    and fail CI when a directive is missing from built output.
-   Pin Apache ECharts to one major (v6 at the time of writing), import
    only the chart modules in use, and enforce a bundle-size budget.
-   Configure the bundler workspace root explicitly in the monorepo so
    the framework resolves dependencies from the workspace root.

------------------------------------------------------------------------

## 4. Monorepo structure

Start with a small number of real packages and split them when
boundaries become useful. The following is the target logical structure,
not a requirement to create empty packages immediately.

``` text
dashboard-platform/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   └── [locale]/
│   │   │   │       ├── (auth)/
│   │   │   │       ├── (dashboard)/
│   │   │   │       └── admin/
│   │   │   ├── components/
│   │   │   ├── features/
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   └── i18n/
│   │   ├── messages/
│   │   │   ├── en.json
│   │   │   └── fa.json
│   │   └── package.json
│   │
│   └── api/
│       ├── src/
│       │   ├── modules/
│       │   │   ├── auth/
│       │   │   ├── users/
│       │   │   ├── organizations/
│       │   │   ├── memberships/
│       │   │   ├── roles/
│       │   │   ├── permissions/
│       │   │   ├── dashboards/
│       │   │   ├── widgets/
│       │   │   ├── data-sources/
│       │   │   ├── queries/
│       │   │   ├── realtime/
│       │   │   └── audit/
│       │   ├── plugins/
│       │   ├── infrastructure/
│       │   ├── config/
│       │   └── server.ts
│       └── package.json
│
├── packages/
│   ├── dashboard-builder/
│   ├── dashboard-core/
│   ├── dashboard-types/
│   ├── dashboard-schemas/
│   ├── dashboard-layout/
│   ├── dashboard-widgets/
│   ├── dashboard-data/
│   ├── dashboard-realtime/
│   ├── dashboard-ui/
│   ├── dashboard-i18n/
│   ├── dashboard-theme/
│   ├── api-client/
│   ├── plugin-sdk/
│   ├── eslint-config/
│   └── tsconfig/
│
├── tooling/
│   ├── scripts/
│   └── generators/
├── docs/
│   ├── architecture/
│   ├── implementation/
│   ├── api/
│   ├── plugins/
│   └── guides/
├── AGENTS.md
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.json
└── pnpm-lock.yaml
```

### 4.1 Package responsibilities

  -----------------------------------------------------------------------
  Package                             Responsibility
  ----------------------------------- -----------------------------------
  `dashboard-builder`                 Public SDK entry point and composed
                                      React components

  `dashboard-core`                    Runtime, editor engine, registries
                                      and orchestration

  `dashboard-types`                   Public TypeScript types

  `dashboard-schemas`                 Zod schemas and validation

  `dashboard-layout`                  Grid integration and responsive
                                      layout logic

  `dashboard-widgets`                 Built-in widget implementations

  `dashboard-data`                    Query manager and data adapter
                                      contracts

  `dashboard-realtime`                Shared connections and subscription
                                      lifecycle

  `dashboard-ui`                      Builder-specific UI components

  `dashboard-i18n`                    Translation and direction
                                      interfaces

  `dashboard-theme`                   Theme tokens and provider

  `api-client`                        Typed client generated or
                                      maintained from OpenAPI

  `plugin-sdk`                        Public contracts for custom widgets
                                      and integrations
  -----------------------------------------------------------------------

**Initial package set.** The first implementation creates four packages
only: `dashboard-types` (including Zod schemas), `dashboard-core`
(layout, data, realtime and built-in widgets), `dashboard-builder`
(public React API and builder UI) and `api-client`. The remaining
packages in the table are the target decomposition, not an M1
deliverable. Split a package when a second consumer exists, when a
boundary has measurable value, or when build time justifies it. This
keeps the repository consistent with the rule against packages that
contain a single trivial module.

### 4.2 Dependency rules

-   `dashboard-types` (including schemas while merged) must be
    foundational and have minimal dependencies.
-   `dashboard-core` composes layout, data, realtime and widgets until a
    split is justified; those modules never depend on each other
    cyclically.
-   `dashboard-builder` exposes the public React API.
-   The web app may depend on SDK packages and `api-client`.
-   The API may depend on shared types/schemas, but not on React
    packages.
-   No package may import from `apps/web` or `apps/api`.
-   Avoid circular dependencies.
-   Do not create a package solely to hold one trivial file.

### 4.3 Workspace configuration

Example `pnpm-workspace.yaml`:

``` yaml
packages:
  - "apps/*"
  - "packages/*"
  - "tooling/*"
```

Use `workspace:*` for internal dependencies. Configure Turborepo tasks
for `build`, `dev`, `lint`, `typecheck`, `test` and `clean`. Ensure task
dependencies reflect package build order.

------------------------------------------------------------------------

## 5. Application architecture

### 5.1 Next.js application responsibilities

The web app owns:

-   Locale-aware routing.
-   Login and account workflows.
-   Organization selection and management UI.
-   Dashboard listing and navigation.
-   Dashboard creation and deletion workflows.
-   Embedding the SDK.
-   Application-level navigation and shell.
-   Application-level permissions and feature visibility.
-   User preferences.
-   Administration pages.
-   Calling the backend through `api-client`.

The web app must not contain the core dashboard editor implementation.
That belongs in the SDK.

### 5.2 Locale routing

Use locale-prefixed routes, for example:

``` text
/en/dashboards
/fa/dashboards
/en/dashboards/:id
/fa/dashboards/:id
```

The app should determine locale and direction together:

  Locale   Direction
  -------- -----------
  `en`     `ltr`
  `fa`     `rtl`

Use `next-intl` for app routing and app translations. Do not import
`next-intl` into the SDK.

------------------------------------------------------------------------

## 6. Dashboard SDK architecture

### 6.1 SDK goals

The SDK must:

-   Render a persisted dashboard configuration.
-   Provide viewer and editor modes.
-   Support controlled and uncontrolled use.
-   Accept injected data and realtime adapters.
-   Accept locale, direction, theme and translation messages.
-   Register built-in and custom widgets.
-   Avoid assumptions about the host backend.
-   Be consumable by another React application.

### 6.2 Proposed public API

``` tsx
import {
  DashboardProvider,
  Dashboard,
} from "@your-org/dashboard-builder";

import "@your-org/dashboard-builder/styles.css";

export function DashboardPage() {
  return (
    <DashboardProvider
      config={dashboardConfig}
      locale="fa"
      direction="rtl"
      theme="dark"
      dataAdapter={dataAdapter}
      realtimeAdapter={realtimeAdapter}
      onSave={saveDashboard}
    >
      <Dashboard
        editable
        dashboardId="production-dashboard"
      />
    </DashboardProvider>
  );
}
```

### 6.3 Public components

  Component             Purpose
  --------------------- -----------------------------------------
  `DashboardProvider`   Inject runtime dependencies and context
  `Dashboard`           Composed dashboard experience
  `DashboardEditor`     Full editing experience
  `DashboardViewer`     Read-only experience
  `DashboardCanvas`     Grid and widget composition
  `WidgetRenderer`      Render one widget
  `WidgetSettings`      Render widget settings
  `DashboardToolbar`    Save, undo, redo, preview and controls
  `DashboardFilters`    Global filters and variables

### 6.4 Public hooks

Proposed hooks:

``` ts
useDashboard()
useDashboardEditor()
useDashboardConfig()
useDashboardLayout()
useWidgetRegistry()
useDataSource()
useDashboardLocale()
useDashboardTheme()
```

Keep public hooks stable and documented. Do not expose internal Zustand
store implementation as public API.

### 6.5 Provider contract

Illustrative contract:

``` ts
interface DashboardProviderProps {
  config: DashboardConfig;

  locale: string;
  direction: "ltr" | "rtl";
  theme: "light" | "dark" | "system";

  messages?: Record<string, string>;

  dataAdapter: DataAdapter;
  realtimeAdapter?: RealtimeAdapter;

  onSave?: (
    config: DashboardConfig
  ) => Promise<void>;
}
```

The final API should be refined through M0 design and type tests. Avoid
committing to an API before testing a minimal consumer example.

### 6.6 Controlled and uncontrolled modes

Support both:

-   **Controlled:** host application owns the configuration and supplies
    updates.
-   **Uncontrolled:** SDK manages local editor state and invokes
    `onSave`.

Define how conflicts are handled when host state changes while local
edits are pending. Do not silently overwrite unsaved edits. The
provider receives the current `revision` with the configuration and
surfaces a typed conflict error to the host when a save is rejected;
the SDK never force-overwrites a newer revision.

------------------------------------------------------------------------

## 7. Dashboard data model

A dashboard contains more than widgets. It includes metadata, settings,
variables, filters, layouts and widget configuration.

Illustrative model:

``` ts
type Breakpoint = "desktop" | "tablet" | "mobile";

interface DashboardDocument {
  id: string;
  name: string;

  draftConfig: DashboardConfig;
  publishedConfig?: DashboardConfig;

  revision: number;
  updatedAt: string;
  publishedAt?: string;
}

interface DashboardConfig {
  schemaVersion: number;

  metadata: {
    title: string;
    description?: string;
    tags?: string[];
  };

  settings: {
    refreshInterval: number;
    timezone?: string;
  };

  variables: DashboardVariable[];
  filters: DashboardFilter[];

  layouts: Record<Breakpoint, DashboardLayout>;

  widgets: DashboardWidget[];
}

interface DashboardLayout {
  columns: number;
  rowHeight: number;
  gap: number;

  items: LayoutItem[];
}

interface LayoutItem {
  widgetId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DashboardWidget {
  id: string;
  type: string;
  configVersion: number;
  title: string;

  dataSourceId?: string;

  config: Record<string, unknown>;
  query?: QueryDefinition;

  visibility?: {
    enabled: boolean;
    condition?: string;
  };
}

interface DashboardVariable {
  id: string;
  name: string;
  type:
    | "string"
    | "number"
    | "boolean"
    | "date"
    | "timeRange";
  defaultValue?: unknown;
  bindings?: VariableBinding[];
}

interface VariableBinding {
  target:
    | "query.parameter"
    | "query.timeRange"
    | "filter.value";
  parameter: string;
}

interface DashboardFilter {
  id: string;
  field: string;
  operator: FilterOperator;
  value: unknown;
}

type FilterOperator =
  | "eq"
  | "neq"
  | "in"
  | "contains"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between";
```

This is a conceptual starting point, not a final production schema.
Define exact validation, optionality, defaults and migration semantics
in M2. `DashboardConfig` never contains server-owned fields such as
ownership, shares or credentials; those live in relational tables.

### 7.1 Schema rules

-   Every persisted dashboard configuration has a `schemaVersion`;
    migrations run on read and are idempotent.
-   Every widget has a stable ID, a type, and an independent
    `configVersion`.
-   Per-breakpoint `LayoutItem` entries are the only source of truth for
    position. Widgets never carry coordinates.
-   A breakpoint without an item for a widget inherits the next wider
    breakpoint at render time; the item is materialized when that
    breakpoint is first edited. If no breakpoint contains the widget, it
    is appended below the existing layout.
-   Validate configuration before rendering or saving. Validation errors
    identify field paths; they are never reported as free text.
-   Keep editor transient state (selection, history, drag preview and
    panel state) outside persisted configuration.
-   Preserve unknown widget definitions as recoverable placeholders and
    never drop them on save.
-   Widget configuration versions are independent of the plugin package
    version. Every widget type ships a migration from each supported
    older config version; unsupported versions render a placeholder
    instead of failing the whole dashboard.
-   Saving a draft never changes what viewers see. Publishing copies
    `draftConfig` to `publishedConfig`, increments `revision` and writes
    a `DashboardVersion`.
-   Configuration writes are conditional. The client sends the last
    known `revision` (or an equivalent `If-Match` value) and the server
    rejects stale writes with `409 Conflict`.
-   Never store credentials or secrets in dashboard JSON.
-   Store timestamps in UTC. Timezone resolution order is user
    preference, then dashboard setting, then organization default.
-   Variables and filters resolve to explicit query inputs before
    execution: `VariableBinding` maps a variable to a named query
    parameter, the query time range, or a filter value. The server
    validates the resolved request and never trusts client-side
    interpolation.
-   Define import/export validation and reject documents above the
    configured size cap (default 1 MiB) or widget count cap (default
    100).
-   Use stable identifiers for variables, widgets and data-source
    references; generate them with UUIDv7 or an equivalent sortable
    scheme.

### 7.2 Undo and redo

Use immutable state transitions or a command-based history. Keep history
bounded (50 entries is a reasonable default) and scoped to the draft.
Avoid writing every pointer movement to the backend. Group a drag or
resize gesture into one history entry, and record an entry against the
breakpoint that was edited rather than duplicating it across all
breakpoints. Publishing and restoring a version clear the in-memory
history.

------------------------------------------------------------------------

## 8. Widget plugin system

### 8.1 Plugin categories

1.  **Visualization plugins:** charts, gauges, tables, maps, KPI cards
    and custom components.
2.  **Data-source plugins:** REST, SQL, MQTT, WebSocket and customer
    integrations.
3.  **Editor extensions:** custom settings panels, controls, filters and
    actions.

### 8.2 Widget contract

Illustrative interface:

``` ts
interface WidgetPlugin<TConfig = unknown> {
  manifest: {
    id: string;
    version: string;
    name: string;
    description?: string;
  };

  configVersion: number;
  configSchema: ZodType<TConfig>;
  defaultConfig: TConfig;

  migrate?: (
    config: unknown,
    fromVersion: number
  ) => TConfig;

  defaultSize: {
    w: number;
    h: number;
  };

  component: React.ComponentType<
    WidgetRenderProps<TConfig>
  >;

  settings?: React.ComponentType<
    WidgetSettingsProps<TConfig>
  >;

  capabilities?: {
    realtime?: boolean;
    export?: boolean;
    filters?: boolean;
  };
}
```

The final contract must define error boundaries, loading states, lifecycle,
localization, theme access, data access, configuration migration and
cleanup behavior. `manifest.version` describes the plugin package;
`configVersion` describes the persisted widget configuration. They move
independently, so a plugin upgrade that does not change configuration
requires no migration.

### 8.3 Built-in widgets

Initial widgets:

-   Line chart.
-   Area chart.
-   Bar chart.
-   Pie/donut chart.
-   Gauge.
-   KPI/stat card.
-   Data table.

Later widgets:

-   Heatmap.
-   Scatter plot.
-   Geographic map.
-   Logs.
-   Alerts.
-   Markdown/text.
-   Event timeline.
-   Custom React widget.

Use Apache ECharts for built-in chart visualizations. Keep widget
configuration independent of raw ECharts options where practical, so the
persisted format is not permanently coupled to one charting engine.

### 8.4 Plugin security

-   Built-in plugins are trusted application code.
-   Third-party React plugins must be explicitly installed and loaded by
    the host.
-   Untrusted remote code must not execute in the main application
    context.
-   Server-side plugins run with limited capabilities and permissions.
-   Use a sandboxed approach such as an iframe only when a genuine
    third-party runtime requirement exists.
-   Validate plugin manifests, compatibility and declared capabilities.

------------------------------------------------------------------------

## 9. Data architecture

### 9.1 Separation of concerns

A widget should not know whether data came from PostgreSQL, REST,
WebSocket, MQTT or another system.

Expected flow:

``` text
Widget
  |
  v
Query Manager
  |
  +--> TanStack Query cache (snapshot queries)
  |
  v
Data Adapter / Backend API
  |
  v
Backend Query Execution
  |
  v
Data-source Plugin
  |
  v
External System
```

For streaming:

``` text
External event source
  |
  v
Backend realtime gateway
  |
  v
WebSocket / SSE
  |
  v
Realtime Manager
  |
  v
Bounded streaming buffer / relevant query cache
  |
  v
Widget
```

### 9.2 Data adapter contract

Illustrative interface:

``` ts
interface DataAdapter {
  execute(
    request: QueryRequest,
    context: QueryContext
  ): Promise<QueryResult>;

  subscribe?(
    request: QueryRequest,
    context: QueryContext,
    handlers: SubscriptionHandlers
  ): Promise<Unsubscribe>;
}

interface QueryRequest {
  queryId: string;
  dataSourceId: string;
  query: unknown;
  parameters?: Record<string, unknown>;
  timeRange?: {
    from: string;
    to: string;
  };
}

interface QueryResult {
  columns: Array<{
    name: string;
    type: string;
    label?: string;
  }>;

  rows: Array<Record<string, unknown>>;
  timestamp: string;
}
```

The exact contract must also define cancellation, errors, pagination,
metadata, schema discovery, query validation and time-range handling.
Set default execution limits and allow per-data-source tightening, never
loosening, of the platform policy: 15-second timeout, 10,000 rows or
5 MiB per result, and a bounded concurrent-query count per user and per
data source. A cancelled request must abort upstream work, not merely
discard the response.

### 9.3 Initial data transports

-   REST/HTTP.
-   WebSocket.
-   Server-Sent Events.
-   Static/mock data.

Plan extension points for:

-   PostgreSQL.
-   MySQL.
-   MQTT.
-   Customer-specific sources.
-   Additional protocols when required.

### 9.4 TanStack Query responsibilities

Use TanStack Query for:

-   Query snapshots.
-   Caching.
-   Deduplication.
-   Retry policy.
-   Query cancellation.
-   Refetching.
-   Stale/fresh state.
-   Loading and error states.

Use a separate bounded streaming buffer for high-frequency events. Do
not put every telemetry event into the query cache or invalidate all
queries for every event.

### 9.5 Query lifecycle

A query definition should support:

-   Query ID.
-   Data-source ID.
-   Query body/definition.
-   Resolved parameters and variable bindings.
-   Time range.
-   Refresh policy.
-   Cache policy.
-   Timeout.
-   Cancellation.
-   Pagination where appropriate.
-   Result limits.
-   Error state and execution metadata.

### 9.6 Data-source credentials

Credentials must remain server-side. The browser SDK receives opaque
data-source identifiers and authorized query capabilities, not database
passwords or privileged connection strings.

------------------------------------------------------------------------

## 10. Realtime architecture

### 10.1 Connection management

Implement a shared connection manager with:

-   Connection reuse.
-   Subscription registry.
-   Reference-counted subscriptions.
-   Automatic cleanup.
-   Authentication.
-   Reconnection with exponential backoff and jitter.
-   Heartbeats.
-   Connection timeout handling.
-   Subscription authorization.
-   Event validation.
-   Backpressure and buffering.
-   Rate limiting.
-   Observability.

Do not open a separate WebSocket for every widget.

### 10.2 Transports

-   WebSocket for bidirectional communication and multiplexed
    subscriptions.
-   SSE for server-to-client event streams.
-   Polling as a fallback where appropriate.
-   MQTT should initially connect to the backend, not directly from
    arbitrary browser clients.

### 10.3 Example protocol

Connection endpoint:

``` text
/ws/v1
```

Subscription:

``` json
{
  "type": "subscribe",
  "requestId": "sub-123",
  "subscriptionId": "sub-123",
  "dataSourceId": "factory-01",
  "queryId": "production-live",
  "mode": "snapshot-then-stream",
  "resumeFrom": 1024,
  "parameters": {
    "machineId": "machine-01"
  }
}
```

Data event:

``` json
{
  "type": "data",
  "subscriptionId": "sub-123",
  "sequence": 1024,
  "timestamp": "2026-11-12T06:00:01Z",
  "data": {
    "production": 121
  }
}
```

Define protocol versioning and schemas for all message types. Suggested
event types:

-   `connected` --- session identity, protocol version, resume window.
-   `subscribe`
-   `subscribed` --- accepted parameters and the sequence that will be
        delivered first.
-   `snapshot` --- authoritative current value for the subscription,
        always carrying a sequence.
-   `data` --- incremental update with a strictly increasing sequence.
-   `gap` --- the requested resume point is no longer buffered; the
        client must reset local state and wait for a fresh snapshot.
-   `unsubscribe`
-   `unsubscribed`
-   `error`
-   `heartbeat`

Authenticate connections and authorize every subscription independently.
Handle token expiry, revoked permissions and reconnect behavior.

### 10.4 Reconnect and recovery

-   Every `data` event carries a per-subscription sequence.
-   On reconnect the client resubscribes with `resumeFrom` set to the
    last sequence it applied.
-   The server answers with either the missing range followed by live
    events, or `gap` followed by `snapshot` and live events. It never
    starts live delivery without establishing a known baseline.
-   Client state is replaced, not merged, when a snapshot arrives.
-   The server retains a bounded per-subscription replay buffer (for
    example 60 seconds or 1,000 events, whichever is smaller). Anything
    older forces a snapshot.
-   Duplicate sequences are ignored. Out-of-order sequences force a gap
    recovery.
-   Token expiry closes the connection; the client refreshes credentials
    and resubscribes with the last applied sequence.

### 10.5 High-frequency streams

Telemetry rates differ from query snapshots and are handled separately:

-   A `mode: "stream"` subscription is throttled server-side to a
    configurable window (default 250 ms) rather than forwarding every
    raw event.
-   Stream payloads are compact and versioned; they are not mixed into
    the snapshot query cache.
-   The client keeps a bounded ring buffer per subscription and
    reconciles with the most recent snapshot.
-   Rate limits are enforced per connection and per subscription;
    exceeding them returns `error` with a retry hint instead of silently
    dropping data.
-   Widgets declare whether they consume snapshots, streams or both, so
    the runtime never subscribes to a channel the widget cannot use.

------------------------------------------------------------------------

## 11. Backend architecture

### 11.1 Backend strategy

Use a modular monolith initially:

-   One independently deployed API application.
-   Clear module boundaries.
-   Shared infrastructure where appropriate.
-   Query execution isolated behind an interface.
-   Realtime gateway isolated behind an interface.
-   Ability to extract workers/services later.

Do not start with microservices unless a real deployment or scaling
requirement justifies them.

### 11.2 Suggested modules

``` text
apps/api/src/
├── modules/
│   ├── auth/
│   ├── users/
│   ├── organizations/
│   ├── memberships/
│   ├── roles/
│   ├── permissions/
│   ├── dashboards/
│   ├── dashboard-versions/
│   ├── widgets/
│   ├── data-sources/
│   ├── queries/
│   ├── variables/
│   ├── realtime/
│   └── audit/
├── plugins/
│   ├── postgres/
│   ├── mysql/
│   ├── rest/
│   └── mqtt/
├── infrastructure/
│   ├── database/
│   ├── cache/
│   ├── queue/
│   ├── websocket/
│   └── logging/
├── config/
└── server.ts
```

### 11.3 Database entities

Initial entities:

-   User.
-   UserPreference (locale, theme, timezone, default organization).
-   Organization.
-   Membership.
-   Role.
-   Permission.
-   RolePermission.
-   MembershipRole.
-   Dashboard (ownership, `revision`, `updatedAt`, `publishedAt`).
-   DashboardVersion (immutable published snapshots).
-   DashboardShare.
-   DataSource.
-   DataSourceCredential.
-   WidgetDefinition.
-   AuditLog.
-   EmbedToken (dashboard scope, issuer, expiry, revocation).

Use PostgreSQL JSONB for dashboard configuration, with relational
metadata for ownership, permissions and version history. Store
`draftConfig` and `publishedConfig` as separate JSONB columns; a publish
is a single transaction that copies the draft, increments `revision`
and inserts a version row. Telemetry and raw query results are never
written into these columns.

`DashboardVersion` rows are pruned by policy (for example the last 50
published versions per dashboard) and `AuditLog` has a documented
retention period; both policies are configuration, not hardcoded.

High-volume telemetry should remain in appropriate external/time-series
systems rather than being stored in dashboard configuration records.

### 11.4 Multi-tenancy

-   Scope organization-owned resources to an organization.
-   Enforce tenant scope in repository/service layers.
-   Do not rely only on client-provided organization IDs.
-   Decide in M0 whether PostgreSQL row-level security is enabled in
    addition to service-layer scoping. Service-layer scoping is
    mandatory either way; RLS is defense in depth, not a substitute.
-   Test cross-tenant access denial in CI for every resource module.
-   Audit sensitive access and configuration changes.

### 11.5 Authorization

Use RBAC plus resource-level permissions.

Examples:

-   `dashboard.read`
-   `dashboard.create`
-   `dashboard.update`
-   `dashboard.delete`
-   `dashboard.share`
-   `datasource.read`
-   `datasource.create`
-   `datasource.update`
-   `datasource.test`
-   `organization.members.manage`

A dashboard viewer must not automatically receive unrestricted access to
its underlying data source. Query execution must enforce the viewer's
effective permissions.

### 11.6 Deployment and operations

-   The web application and API deploy independently; the API owns
    database migrations.
-   Migrations run as a release step with a documented rollback path;
    destructive changes use expand/contract.
-   Credential-encryption keys live in a managed key store, are never
    committed, and have a documented rotation procedure.
-   Backups and restore drills cover configurations, versions and audit
    data; retention is documented.
-   Health endpoints, structured logs, metrics and error tracking exist
    before production.
-   Rate limits, query limits and connection-pool caps are configuration
    with documented defaults.
-   Environments are configured only through validated environment
    variables; secrets are injected at deploy time.

------------------------------------------------------------------------

## 12. API contracts

Use REST for management operations and WebSocket/SSE for streaming.
Define and version the API with OpenAPI.

### 12.1 Initial REST endpoints

| Method | Endpoint                                   | Purpose                                      |
| ------ | ------------------------------------------ | -------------------------------------------- |
| GET    | `/v1/dashboards`                           | List authorized dashboards                   |
| POST   | `/v1/dashboards`                           | Create dashboard                             |
| GET    | `/v1/dashboards/:id`                       | Get metadata and published config            |
| GET    | `/v1/dashboards/:id/draft`                 | Get draft config (editor only)               |
| PATCH  | `/v1/dashboards/:id`                       | Update metadata                              |
| PUT    | `/v1/dashboards/:id/draft`                 | Save draft config with `If-Match: revision`  |
| POST   | `/v1/dashboards/:id/publish`               | Publish draft and create a version           |
| DELETE | `/v1/dashboards/:id`                       | Delete dashboard                             |
| GET    | `/v1/dashboards/:id/versions`              | List versions                                |
| POST   | `/v1/dashboards/:id/restore`               | Restore a version as a new draft             |
| GET    | `/v1/dashboards/:id/shares`                | List dashboard shares                        |
| PUT    | `/v1/dashboards/:id/shares`                | Replace dashboard shares                     |
| POST   | `/v1/dashboards/:id/embed-tokens`          | Issue a scoped embed token                   |
| DELETE | `/v1/dashboards/:id/embed-tokens/:tokenId` | Revoke an embed token                        |
| GET    | `/v1/data-sources`                         | List authorized data sources                 |
| POST   | `/v1/data-sources`                         | Create a data source                         |
| GET    | `/v1/data-sources/:id`                     | Get metadata; credentials are never returned |
| PATCH  | `/v1/data-sources/:id`                     | Update a data source                         |
| DELETE | `/v1/data-sources/:id`                     | Delete a data source                         |
| POST   | `/v1/data-sources/:id/test`                | Test connectivity and permissions            |
| POST   | `/v1/queries/execute`                      | Execute a query                              |
| POST   | `/v1/queries/validate`                     | Validate a query                             |
| GET    | `/v1/widgets`                              | List available widget definitions            |
| GET    | `/v1/organizations/:id/members`            | List members                                 |
| POST   | `/v1/organizations/:id/members`            | Invite a member                              |
| PATCH  | `/v1/organizations/:id/members/:memberId`  | Update member roles                          |
| DELETE | `/v1/organizations/:id/members/:memberId`  | Remove a member                              |
| GET    | `/v1/organizations/:id/roles`              | List roles and their permissions             |
| POST   | `/v1/organizations/:id/roles`              | Create a custom role                         |
| PATCH  | `/v1/organizations/:id/roles/:roleId`      | Update a role                                |
| DELETE | `/v1/organizations/:id/roles/:roleId`      | Delete a role                                |
| GET    | `/v1/organizations/:id/permissions`        | Retrieve effective permissions               |
| GET    | `/v1/me/preferences`                       | Read user preferences                        |
| PATCH  | `/v1/me/preferences`                       | Update user preferences                      |

Define consistent pagination, filtering, error envelopes and request
IDs. Every mutating dashboard request honors `If-Match` with the last
known revision and returns `409` with the current revision on conflict.
Retryable `POST` endpoints accept an `Idempotency-Key`. All lists are
paginated with a documented maximum page size. Errors carry a stable
machine-readable code, a human-readable message, a request ID and field
paths when applicable.

### 12.2 Query result

Example:

``` json
{
  "queryId": "production-output",
  "status": "success",
  "data": {
    "columns": [
      { "name": "timestamp", "type": "datetime" },
      { "name": "production", "type": "number" }
    ],
    "rows": [
      {
        "timestamp": "2026-11-12T06:00:00Z",
        "production": 120
      }
    ]
  },
  "meta": {
    "executionTime": 42,
    "cached": false
  }
}
```

Treat this as an illustrative response. Define the actual schema
centrally and validate it.

### 12.3 Typed client

The `api-client` package should be based on OpenAPI. Keep transport,
authentication injection, error handling and serialization consistent.
Do not duplicate endpoint types manually in multiple applications.

Generate the client from the published OpenAPI document as a build step
and fail CI when the checked-in client differs from a fresh generation.
Authentication providers are injected per client instance so the web
application, embed runtime and tests share one client implementation.

### 12.4 Embed access tokens

Embedding is a first-class access path, not a UI feature.

-   Embed tokens are signed server-side and bound to a dashboard scope,
    an optional viewer identity and an expiry.
-   A token never reduces authorization: it narrows the permissions of
    the principal that issued it and cannot grant data-source access the
    issuer does not hold.
-   Tokens may pre-bind variables and filters, but the server validates
    the bound values like any other request.
-   The realtime gateway accepts the same token, and each subscription
    re-checks scope and expiry.
-   Tokens are revocable; revocation takes effect for new connections
    immediately and for existing subscriptions within the realtime
    heartbeat interval.
-   Tokens are stored hashed, never in plaintext, and are excluded from
    logs and audit payloads.

------------------------------------------------------------------------

## 13. Internationalization and themes

### 13.1 Localization requirements

Supported initial locales:

-   English (`en`).
-   Persian (`fa`).

Supported directions:

-   LTR.
-   RTL.

The SDK must not depend on next-intl. Define an independent interface:

``` ts
interface DashboardI18n {
  locale: string;
  direction: "ltr" | "rtl";

  translate(
    key: string,
    values?: Record<string, unknown>
  ): string;
}
```

### 13.2 Localization rules

-   Translate all user-facing builder UI.
-   Do not translate internal IDs or persisted property keys.
-   Resolve messages with an explicit chain: host overrides, then SDK
    built-in messages, then English. A missing key renders its identifier
    and logs a development warning; it never throws.
-   Direction applies to all chrome, text, forms, menus, toolbars,
    sidebars and charts. The dashboard canvas stays LTR in v1 by design;
    the UI must state this to users rather than pretend to support RTL
    dragging.
-   Support locale-aware number formatting.
-   Support locale-aware date and time formatting.
-   Accept Persian digits in numeric and date inputs and normalize them
    to canonical values before validation.
-   Store timestamps in UTC; resolve display timezone as user
    preference, then dashboard setting, then organization default.
-   Plan Persian calendar display separately from UTC timestamp storage.
    Date inputs accept both Persian-calendar entry and ISO input.
-   Ensure chart labels, tooltips and axis orientation handle RTL
    correctly.
-   Test mixed Persian/English text and numbers.
-   Use logical CSS properties where possible.
-   Avoid hardcoded left/right positioning.
-   Test menus, sidebars and toolbars in RTL. Drag handles are verified
    in LTR only, matching the canvas decision.

### 13.3 Themes

Supported modes:

-   Light.
-   Dark.
-   System.

Use CSS variables and semantic design tokens. ECharts themes should
consume the same token system.

Requirements:

-   Theme switching without unnecessary widget remounts.
-   Theme-aware charts.
-   Theme-aware empty, error and loading states.
-   Custom theme extension points.
-   Clear precedence between application preference and
    dashboard-specific theme preference.

Language and theme are independent settings.

------------------------------------------------------------------------

## 14. Editor UX and feature requirements

### 14.1 Main editor layout

Proposed four-area editor:

1.  **Left sidebar:** widget library, variables and data sources.
2.  **Center:** dashboard canvas.
3.  **Right sidebar:** selected widget settings.
4.  **Top toolbar:** save, preview, undo/redo, filters, theme and
    refresh.

Sidebars and toolbars are logical start/end regions and mirror in RTL.
The canvas itself stays LTR, and its interaction is documented as
LTR-only in v1.

### 14.2 Core editing

-   Add/remove widgets.
-   Drag and resize on the LTR canvas.
-   Duplicate.
-   Copy/paste.
-   Responsive breakpoints with per-breakpoint layout items.
-   Widget configuration.
-   Save draft, publish and restore a version.
-   Conflict resolution when the draft changed elsewhere.
-   Undo and redo.
-   Preview mode.
-   Fullscreen viewer.
-   Import/export JSON.

### 14.3 Advanced dashboard capabilities

-   Global variables.
-   Dashboard filters.
-   Time-range selection.
-   Cross-widget filtering.
-   Linked chart interactions.
-   Templates.
-   Version history.
-   Sharing and permissions.
-   Conditional visibility.
-   Per-widget refresh policies.
-   Responsive previews.
-   Dashboard annotations where appropriate.

Implement advanced capabilities in stages. Do not delay a functional
basic editor while building every advanced feature.

------------------------------------------------------------------------

## 15. Security requirements

Security must be designed into the first backend and data-source
milestones.

### 15.1 Required controls

-   Secure authentication and session handling.
-   Organization-level tenant isolation.
-   Resource-level authorization.
-   Server-side validation of every request.
-   Rate limiting.
-   Audit logs for sensitive actions.
-   Encrypted data-source credentials at rest, with documented key
    management and rotation.
-   Secrets never included in dashboard configuration.
-   Signed embed tokens narrowed to the issuing principal's permissions
    and checked on every subscription.
-   Publish authorization evaluated separately from edit authorization.
-   Per-query timeouts and result limits.
-   Connection pooling and limits.
-   Read-only database credentials where possible.
-   Per-subscription realtime authorization.
-   Revocation handling.
-   Import/export validation.
-   Plugin capability restrictions.

### 15.2 Data-source security

Protect against:

-   Server-side request forgery (SSRF).
-   Access to private/internal network ranges.
-   DNS rebinding.
-   Arbitrary file or protocol access.
-   Credential leakage.
-   Unbounded query execution.
-   Excessive result sizes.
-   Connection exhaustion.

Do not allow users to configure a data source that can access internal
infrastructure without explicit authorization and network controls.

### 15.3 Plugin security

Do not treat a registry as a sandbox. A React component registered in
the application executes with the privileges of that application.
Third-party code must be trusted, reviewed and explicitly installed, or
isolated in a separately designed sandbox.

------------------------------------------------------------------------

## 16. Testing and quality strategy

### 16.1 Unit tests

Test:

-   Dashboard schema validation.
-   Configuration migrations.
-   Widget configuration migrations, including unsupported versions.
-   Widget registry.
-   Layout calculations, per-breakpoint inheritance and materialization.
-   Query normalization.
-   Variable and filter binding resolution.
-   Adapter contracts.
-   Realtime subscription lifecycle, resume and gap handling.
-   Locale and direction behavior, including RTL chrome with an LTR
    canvas.
-   Theme token behavior.
-   Permission evaluation.
-   Draft-to-publish transition rules.

### 16.2 Integration tests

Test:

-   Dashboard save/load.
-   Draft edits are invisible to viewers until publish.
-   Publish is atomic: config copy, revision increment and version row
    either all succeed or all fail.
-   Stale `If-Match` writes return `409` and leave data unchanged.
-   Version creation and restore.
-   Data-source registration, update, deletion and testing.
-   Query execution and authorization.
-   WebSocket subscription, snapshot delivery and cleanup.
-   Reconnect with resume, gap recovery and duplicate suppression.
-   Token expiry, revocation and reconnect.
-   Embed token scope narrowing and revocation.
-   Cross-tenant isolation for every resource module.
-   Plugin compatibility and configuration migration.

### 16.3 E2E tests

Use Playwright to cover:

1.  Login.
2.  Create dashboard.
3.  Add a widget.
4.  Configure a widget.
5.  Move and resize widgets on the LTR canvas.
6.  Save the draft and reload it in the editor.
7.  Publish and confirm the viewer sees the published version, not the
    draft.
8.  Switch English/Persian.
9.  Switch LTR/RTL and confirm chrome mirrors while the canvas stays
    LTR.
10. Switch light/dark/system.
11. View dashboard as a viewer.
12. Verify denied operations for insufficient permissions.
13. Simulate a concurrent edit and resolve the `409` conflict.
14. Verify realtime updates and recovery after a dropped connection.

### 16.4 Package consumer test

Create a separate minimal React/Next.js test application outside the
monorepo package source.

Pack the SDK with the package manager's pack command (not a workspace
alias), install the tarball, and verify:

-   Package exports resolve.
-   Type declarations work.
-   CSS loads.
-   Built output preserves `"use client"` directives.
-   SSR/build does not fail, including with `cacheComponents` enabled.
-   React is not duplicated.
-   No source alias from the monorepo is required.
-   The SDK bundle stays within its size budget.
-   A custom widget can be registered through the documented API.

### 16.5 Test infrastructure

-   CI provides PostgreSQL and a WebSocket endpoint as service
    containers so integration and reconnect tests run on every change.
-   Visual-regression baselines cover the editor chrome in both
    directions and both themes.
-   Chart rendering tests use a fixed clock and seeded data; no test
    depends on wall-clock time.
-   Compatibility tests pin the React Grid Layout major and fail loudly
    if a dependency upgrade breaks layout behavior.

### 16.6 Performance budgets

Budgets are documented, measured in CI where practical, and revised only
with a recorded decision.

-   A published dashboard renders its first chart within two seconds on
    a mid-range laptop against a warm API.
-   Default limit is 100 widgets per dashboard; the editor warns above
    50.
-   At most 12 live chart instances per viewport; offscreen widgets are
    not mounted until near-visible.
-   Query results are capped at 10,000 rows or 5 MiB per widget, and the
    adapter flags truncation instead of failing silently.
-   Streaming updates are coalesced to at most four UI updates per second
    per widget.
-   The SDK entry point stays within a gzipped bundle budget set in M3
    and enforced by the build.

------------------------------------------------------------------------

## 17. Implementation roadmap

Each milestone has a review gate. Do not begin the next milestone until
the current milestone meets its acceptance criteria or its remaining
work is explicitly accepted.

Effort estimates assume two full-time engineers working in parallel and
are indicative, not commitments. Recalibrate at every gate; a single
engineer should expect roughly 1.8 times the elapsed time.

| Milestone | Scope                                      | Indicative effort |
| --------- | ------------------------------------------ | ----------------- |
| M0        | Architecture and decisions                 | 1 week            |
| M1        | Monorepo foundation                        | 1 week            |
| M2        | Contracts and schemas                      | 1.5 weeks         |
| M3        | SDK foundation                             | 2 weeks           |
| M3.5      | Walking skeleton (monitoring)              | 2 weeks           |
| M4        | Visual editor                              | 3 weeks           |
| M5        | Visualization system                       | 2.5 weeks         |
| M6        | Backend and persistence                    | 3 weeks           |
| M7        | Data infrastructure                        | 2 weeks           |
| M8        | Realtime infrastructure                    | 3 weeks           |
| M9        | Advanced dashboard capabilities            | 3 weeks           |
| M10       | Internationalization and themes            | 2 weeks           |
| M10.5     | Accessibility                              | 1.5 weeks         |
| M11       | Plugin ecosystem                           | 2 weeks           |
| M12       | Production readiness                       | 2 weeks           |

The sequence totals roughly 32 engineer-weeks, or about four months of
elapsed time for two engineers, excluding review latency and scope
changes.

### M0 --- Architecture and technical decisions

**Tasks**

-   Review product requirements.
-   Define target package boundaries.
-   Define package dependency graph.
-   Define public SDK API proposal.
-   Define dashboard schema proposal.
-   Define widget and data-source plugin contracts.
-   Define query and realtime contracts.
-   Define backend module boundaries.
-   Define tenant and authorization model.
-   Define i18n and theme approach.
-   Complete a dependency license and compatibility review.
-   Decide the authentication transport, row-level security and
    embed-token questions.
-   Record architecture decisions.
-   Identify open questions and risks.

**Deliverables**

-   Architecture overview.
-   Package dependency document.
-   Initial API contract.
-   Initial schema proposal.
-   ADR documents.
-   Dependency license review.
-   Milestone acceptance criteria.

**Acceptance**

Architecture is reviewed and approved before feature implementation.

### M1 --- Monorepo foundation

**Tasks**

-   Initialize pnpm workspace.
-   Restructure the repository into a monorepo, moving the existing
    Next.js application to `apps/web`.
-   Configure Turborepo.
-   Configure strict TypeScript.
-   Add linting and formatting.
-   Create the four initial packages.
-   Create Fastify app.
-   Configure environment validation.
-   Configure test runners.
-   Configure CI checks.
-   Configure the bundler workspace root.
-   Add basic development scripts.

**Acceptance**

-   Web app starts.
-   API starts.
-   Workspace package can be imported by the app.
-   Build, lint, typecheck and tests run through workspace commands.
-   No circular package dependencies.
-   Root build artifacts from the pre-monorepo layout are removed.

### M2 --- Shared contracts and schemas

**Tasks**

-   Define public types.
-   Define Zod dashboard schemas.
-   Define widget schemas.
-   Define layout schemas.
-   Define query request/result schemas.
-   Define adapter contracts.
-   Define realtime event schemas.
-   Define plugin manifests.
-   Define configuration migration interface.
-   Add schema tests and examples.

**Acceptance**

Valid configurations pass, invalid configurations fail with useful
errors, and migration tests work.

### M3 --- SDK foundation

**Tasks**

-   Implement DashboardProvider.
-   Implement runtime context.
-   Implement dependency injection.
-   Implement widget registry.
-   Implement basic DashboardViewer.
-   Implement DashboardRenderer.
-   Implement public exports.
-   Implement initial CSS exports.
-   Add a standalone consumer example.

**Acceptance**

A separate React application can render a dashboard using the SDK
without depending on the platform web app.

### M3.5 --- Walking skeleton (monitoring)

Prove the platform end to end with the smallest monitoring slice before
building the full editor.

**Tasks**

-   Wire the web application to the API client and the SDK.
-   Implement login and a single organization.
-   Implement dashboard list, create, save draft, publish and load.
-   Implement KPI and line widgets backed by HTTP polling.
-   Implement the viewer against the published configuration.
-   Implement the minimal editor: add, remove, move, resize, save draft
    and publish.
-   Verify client-only rendering, SSR safety and theme tokens.
-   Add an end-to-end test covering the whole slice.

**Acceptance**

A user logs in, creates a monitoring dashboard with a KPI and a line
widget, saves, publishes and views it. A second viewer sees the
published state and never the draft. The slice runs in CI.

### M4 --- Visual editor

**Tasks**

-   Integrate React Grid Layout v2, including the required container
    width API, and verify React 19 compatibility with an integration
    test. Fall back to 1.5.x only with a recorded decision.
-   Implement widget insertion.
-   Implement drag and resize on the LTR canvas.
-   Implement per-breakpoint layout editing.
-   Implement selection.
-   Implement settings panel.
-   Implement toolbar.
-   Implement save-draft, publish and restore callbacks.
-   Implement conflict handling for `409` responses.
-   Implement undo/redo.
-   Implement preview mode.
-   Add editor tests.

**Acceptance**

A user can create a dashboard, add widgets, configure them, move/resize
them on the LTR canvas, save a draft, publish, reload and restore a
version. Concurrent stale saves are rejected visibly instead of
overwriting.

### M5 --- Visualization system

**Tasks**

-   Integrate Apache ECharts.
-   Implement initial built-in charts.
-   Implement KPI and table widgets.
-   Implement widget loading/error/empty states.
-   Implement theme-aware chart rendering.
-   Implement chart configuration validation.
-   Add custom widget example.
-   Add visualization tests.

**Acceptance**

Multiple widget types render from validated configuration and support
independent settings.

### M6 --- Backend and persistence

**Tasks**

-   Implement authentication.
-   Implement organizations and memberships.
-   Implement roles and permissions.
-   Implement dashboard CRUD.
-   Implement draft saving, publishing and conditional writes.
-   Implement dashboard versioning and restore.
-   Implement dashboard sharing.
-   Implement embed-token issuing and revocation.
-   Implement user preferences.
-   Implement data-source metadata.
-   Implement credential storage abstraction.
-   Implement audit logging.
-   Implement OpenAPI.
-   Implement typed API client with a generation drift check.

**Acceptance**

Authorized users can save a draft, publish it and retrieve the published
dashboard. Stale saves are rejected, unauthorized and cross-tenant
requests are denied, and embed tokens cannot exceed the issuer's
permissions.

### M7 --- Data infrastructure

**Tasks**

-   Implement query manager.
-   Integrate TanStack Query.
-   Implement HTTP data adapter.
-   Implement mock/static adapter.
-   Implement backend query execution contract.
-   Implement query validation.
-   Implement cache and cancellation.
-   Implement timeout and result limits.
-   Add data-source plugin example.

**Acceptance**

Widgets retrieve normalized data through the adapter contract, without
coupling to a particular source technology.

### M8 --- Realtime infrastructure

**Tasks**

-   Implement shared WebSocket manager.
-   Implement subscription registry.
-   Implement subscription cleanup.
-   Implement SSE adapter.
-   Implement authentication and authorization.
-   Implement reconnect with backoff.
-   Implement resume, snapshot and gap recovery.
-   Implement heartbeats and timeouts.
-   Implement event validation and sequence handling.
-   Implement bounded replay buffers.
-   Implement bounded streaming buffer.
-   Implement server-side throttling for high-frequency updates.
-   Add realtime integration tests.

**Acceptance**

Multiple widgets can share connections and receive updates without
opening independent sockets. Subscriptions are cleaned up correctly.

### M9 --- Advanced dashboard capabilities

**Tasks**

-   Implement dashboard variables.
-   Implement variable-binding resolution to query parameters, time
    range and filter values.
-   Implement global filters.
-   Implement time-range selection.
-   Implement cross-widget interactions.
-   Implement templates.
-   Implement import/export.
-   Implement version restore.
-   Implement sharing.
-   Implement responsive preview.
-   Implement conditional visibility.

**Acceptance**

A user can create reusable, interactive monitoring and analytical
dashboards.

### M10 --- Internationalization and themes

**Tasks**

-   Implement English messages.
-   Implement Persian messages.
-   Implement RTL chrome with an LTR canvas, and disclose the canvas
    limitation in the UI and documentation.
-   Implement light/dark/system themes.
-   Implement locale-aware number, date and time formatting.
-   Implement Persian date display and input strategy.
-   Implement theme-aware ECharts options.
-   Add visual regression and E2E coverage for both directions and all
    themes.

**Acceptance**

The same dashboard works in English and Persian, in light, dark and
system modes. Chrome mirrors correctly in RTL; the canvas remains LTR by
design, and the limitation is documented and visible to users.

### M10.5 --- Accessibility

**Tasks**

-   Implement keyboard navigation and focus management for editor
    chrome.
-   Make widget menus, dialogs and settings panels accessible.
-   Provide a table or summary alternative for every chart widget.
-   Add screen-reader labels and live-region announcements for save,
    publish and conflict states.
-   Run automated accessibility checks in E2E.
-   Document the LTR canvas limitation for assistive-technology users.

**Acceptance**

Core editing and viewing flows pass automated accessibility checks and
a manual keyboard-only review. Charts expose equivalent data to
non-visual users.

### M11 --- Plugin ecosystem

**Tasks**

-   Finalize public plugin SDK.
-   Implement plugin manifest validation.
-   Implement compatibility checks.
-   Implement visualization plugin registration.
-   Implement editor extension registration.
-   Implement server-side data-source plugin interface.
-   Implement plugin capability checks.
-   Write custom plugin examples.
-   Document plugin lifecycle and security.

**Acceptance**

A separate test package can register a custom widget and a data-source
adapter using documented contracts.

### M12 --- Production readiness

**Tasks**

-   Complete unit and integration coverage.
-   Complete E2E workflows.
-   Complete package consumer tests.
-   Add Storybook documentation.
-   Add performance tests against the documented budgets.
-   Review security and close the risk assessment findings.
-   Document deployment topology, migrations, backups and
    credential-key rotation.
-   Complete API and SDK documentation.
-   Add logging, monitoring and error tracking.
-   Define versioning, compatibility and deprecation policy.
-   Verify the packed SDK installation path; registry publication is out
    of scope for v1.

**Acceptance**

The SDK can be consumed independently and the platform can be deployed
and operated with documented procedures.

------------------------------------------------------------------------

## 18. AI coding-agent workflow

Use the root `AGENTS.md` as persistent instructions. The agent must work
milestone by milestone.

### 18.1 Before implementation

For every milestone, the agent must:

1.  Inspect the current repository.
2.  Read `AGENTS.md` and architecture documents.
3.  Check the current milestone and existing progress.
4.  Identify relevant package dependencies.
5.  Write a concise implementation plan.
6.  Identify risks and assumptions.
7.  Define acceptance criteria.
8.  Ask questions only when a missing decision blocks correct
    implementation.

### 18.2 During implementation

-   Implement the smallest coherent increment.
-   Keep changes within the appropriate package.
-   Avoid unrelated refactors.
-   Write tests alongside implementation.
-   Validate public types and runtime behavior.
-   Do not introduce dependencies without explaining why.
-   Do not copy application-specific logic into the SDK.
-   Do not use `any` to bypass type design.
-   Do not leave fake implementations that appear complete.
-   Do not hardcode secrets or environment-specific URLs.
-   Do not silently alter persisted schemas.

### 18.3 After implementation

The agent must:

1.  Run relevant tests.
2.  Run type checking.
3.  Run linting.
4.  Build affected packages.
5.  Test affected application flows.
6.  Update documentation.
7.  Update `docs/implementation/current-phase.md`.
8.  Record technical debt.
9.  Report completed and incomplete work.
10. Provide exact commands and test results.

### 18.4 Required progress files

``` text
docs/
├── architecture/
│   ├── overview.md
│   ├── package-dependencies.md
│   ├── data-flow.md
│   ├── security.md
│   ├── plugin-system.md
│   └── decisions/
│       ├── ADR-001-monorepo.md
│       ├── ADR-002-dashboard-schema.md
│       ├── ADR-003-data-adapters.md
│       ├── ADR-004-realtime.md
│       ├── ADR-005-i18n-theme.md
│       └── ADR-006-plugin-security.md
├── implementation/
│   ├── roadmap.md
│   ├── current-phase.md
│   └── technical-debt.md
├── api/
│   └── openapi.yaml
└── plugins/
```

------------------------------------------------------------------------

## 19. Root AGENTS.md instructions

Use the following as the initial root-level agent instruction file.

### Project objective

Build an extensible, reusable, multilingual dashboard platform
consisting of a React SDK, Next.js application and separate backend API.

### Architectural rules

1.  The dashboard SDK must not depend on Next.js.
2.  The SDK must not access the backend database directly.
3.  Authentication and authorization must be injected through explicit
    interfaces.
4.  TanStack Query owns server state.
5.  Zustand owns local editor state.
6.  Dashboard configurations are versioned and validated.
7.  Data acquisition is independent of visualization rendering.
8.  Plugins use documented public contracts.
9.  Untrusted plugins never execute arbitrary code in the main
    application context.
10. Backend authorization is authoritative.
11. Support Persian and English.
12. Support RTL and LTR for chrome, text, forms and charts; the grid
    canvas is LTR-only in v1.
13. Support light, dark and system themes.
14. Avoid circular dependencies.
15. Avoid unnecessary abstractions.
16. Preserve compatibility of persisted dashboard configurations.
17. Viewers only ever see published configurations.
18. Configuration writes are conditional on the last known revision.

### Development rules

-   Work incrementally.
-   Do not implement all milestones in one operation.
-   Inspect the repository before changing it.
-   Plan before substantial changes.
-   Test after each meaningful increment.
-   Document significant decisions.
-   Do not claim completion without verification.
-   Report technical debt honestly.
-   Ask for approval at milestone gates.

### CI-enforced rules

-   Type checking and linting run on every change with `noImplicitAny`
    enabled; an intentional escape hatch requires a justification
    comment and is reviewed.
-   Package builds fail when built output loses a `"use client"`
    directive or exceeds the bundle-size budget.
-   Shipped packages do not export placeholder implementations; stubs
    live under test-only paths that are excluded from builds.
-   Schema changes require passing migration tests for every supported
    `schemaVersion` before merge.
-   Cross-tenant isolation and `If-Match` conflict tests run on every
    change to the affected modules.

### First assignment

Complete M0 only.

Do not implement product features yet.

Produce:

1.  Detailed monorepo structure.
2.  Package dependency graph.
3.  Public SDK API proposal.
4.  Dashboard configuration schema.
5.  Widget plugin contract.
6.  Data-source plugin contract.
7.  Realtime protocol proposal.
8.  Backend module architecture.
9.  Database entity relationship proposal.
10. Internationalization and theme strategy.
11. Security risk assessment.
12. Decision records for the authentication transport, row-level
    security, embed-token model and SQL query model.
13. Milestone acceptance criteria and a recalibrated effort estimate.

Identify unresolved decisions and trade-offs. Wait for explicit
architecture approval before implementing M1.

------------------------------------------------------------------------

## 20. Open decisions to resolve during M0

These decisions should be recorded with options, trade-offs and a
recommendation.

Decided in v1.1 and therefore no longer open: the SDK is distributed
through the private workspace only; the grid canvas is LTR-only; the
editing model is draft plus publish; configuration writes are optimistic
with `If-Match`. The table lists what remains open.

  -----------------------------------------------------------------------
  Decision                Proposed default        Why it remains open
  ----------------------- ----------------------- -----------------------
  Row-level security      Service-layer scoping   Decision depends on
                          is mandatory; RLS is    the chosen access
                          evaluated in M0         model

  Backend authentication  Secure session-based    Depends on deployment
                          approach                and embedding needs

  SQL query model         Structured query        Depends on target users
                          definitions plus        and security model
                          restricted SQL where    
                          justified               

  Data-source execution   Backend-side for        Some sources may be
                          privileged sources      safe for direct client
                                                  access

  Realtime fan-out        Shared gateway          Scale and deployment
                          initially               topology are unknown

  High-volume telemetry   External time-series    Depends on customer
                          store                   data volume

  Plugin runtime          Trusted installed       Marketplace/sandbox
                          plugins initially       requirements are future
                                                  decisions

  Dashboard sharing       Organization-scoped     Public sharing
                          permissions initially   requirements are
                                                  unknown

  Persian calendar        Locale-aware display    Exact calendar and
                          with UTC storage        date-input requirements
                                                  need confirmation

  Puck                    Exclude from initial    Consider only if
                          editor                  page/report composition
                                                  becomes a requirement
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 21. Definition of done

The initial production-ready platform is complete only when all of the
following are true:

### SDK

-   Builds independently.
-   Can be consumed by a separate React application.
-   Provides viewer and editor modes.
-   Has documented public components and hooks.
-   Supports custom widgets.
-   Supports injected data adapters.
-   Has no dependency on the platform's backend implementation.

### Dashboard functionality

-   Supports adding, moving, resizing and configuring widgets.
-   Supports saving a draft, publishing and restoring a version.
-   Supports responsive layouts with per-breakpoint items.
-   Supports variables and filters.
-   Supports versioned configuration with a documented compatibility
    window.
-   Handles unknown or incompatible widgets gracefully, including
    configuration migration.

### Data and realtime

-   Supports HTTP queries.
-   Supports mock data.
-   Supports shared WebSocket connections.
-   Supports SSE.
-   Handles reconnect and subscription cleanup.
-   Enforces server-side authorization.
-   Protects against unbounded query and stream resource use.

### Application and backend

-   Next.js and API deploy independently.
-   Dashboard persistence works.
-   Multi-tenant authorization works.
-   Data-source credentials are protected.
-   Audit logs cover sensitive operations.
-   API contracts are documented.

### Localization and themes

-   English and Persian work.
-   Chrome and charts work in RTL and LTR; the canvas is LTR-only by
    design and the limitation is disclosed.
-   Light, dark and system themes work.
-   Numbers and dates are locale-aware.
-   Editor controls adapt to direction and theme.

### Quality

-   Unit and integration tests pass.
-   Main E2E flows pass.
-   Package consumer test passes.
-   Build and type checks pass.
-   Security and deployment documentation exists.

------------------------------------------------------------------------

## 22. Recommended first action

Give the coding agent the root `AGENTS.md` instructions and ask it to
complete M0 only.

Review its package dependency graph, dashboard schema, plugin contracts,
authorization model and realtime protocol before approving M1.

The objective is not to generate the largest amount of code quickly. It
is to establish boundaries that let the dashboard SDK, web app and
backend evolve independently without requiring a rewrite.
