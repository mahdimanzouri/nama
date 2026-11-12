# Data Flow

**Status:** Proposed (M0)

## Editor: load, edit, save, publish

```mermaid
sequenceDiagram
  participant Host as Web app
  participant API
  participant DB as PostgreSQL
  participant SDK as Editor (SDK)

  Host->>API: GET /v1/dashboards/:id
  API->>DB: scoped read (RLS)
  API-->>Host: metadata + publishedConfig + revision
  Host->>API: GET /v1/dashboards/:id/draft (editor only)
  API-->>Host: draftConfig + revision
  Host->>SDK: DashboardProvider(config, revision, onSave)
  SDK->>SDK: local immutable draft + history
  SDK->>Host: onSave(nextConfig, {revision})
  Host->>API: PUT /v1/dashboards/:id/draft (If-Match: revision)
  alt revision matches
    API->>DB: UPDATE ... WHERE revision = expected
    API-->>Host: { revision: revision + 1 }
  else stale revision
    API-->>Host: 409 { currentRevision, currentConfig }
    Host->>SDK: onConflict(RevisionConflictError)
  end
  Host->>API: POST /v1/dashboards/:id/publish (If-Match)
  API->>DB: copy draft → published, revision++, insert version (transaction)
  API-->>Host: published document
```

Rules:

- Local edits live in Zustand inside `dashboard-core`; they are not server state.
- Every save carries the last known `revision`. The server rejects stale writes;
  the editor surfaces a conflict workflow and never silently overwrites.
- Publishing clears in-memory history and creates an immutable version.
- Saving a draft never changes what viewers see.

## Conflict workflow

1. Save returns `409` with `currentRevision` and optionally `currentConfig`.
2. The editor shows a conflict panel: keep mine, take theirs, or open a diff.
3. "Keep mine" retries with the new revision after explicit confirmation.
4. "Take theirs" replaces local config and clears history.
5. No automatic merge is attempted in v1.

## Viewer: read the published configuration

```text
GET /v1/dashboards/:id
  → publishedConfig (never draftConfig)
  → SDK DashboardViewer
  → widgets resolve queries through DataAdapter
```

Viewers never receive the draft endpoint data. If a dashboard has never been
published, the viewer shows an "unpublished" state rather than the draft.

## Query flow (snapshots)

```text
Widget query definition
  → Query Manager resolves variables, filters, time range
  → POST /v1/queries/execute
  → authorization (viewer's effective permissions + data-source scope)
  → limits (15 s, 10,000 rows, 5 MiB)
  → data-source plugin
  → external system
  → QueryResult
  → TanStack Query cache keyed by [dataSourceId, queryId, params, timeRange]
  → widget
```

- Cache deduplicates identical requests from multiple widgets.
- Refresh interval comes from dashboard settings; a widget may override within
  policy.
- Cancellation aborts the upstream execution.
- Truncated results set `meta.truncated` and are surfaced in the widget.

## Stream flow

```text
External source
  → server-side connector
  → realtime gateway assigns sequence
  → /ws/v1 data events (throttled to 250 ms for stream mode)
  → shared SDK connection manager
  → subscription registry → per-subscription bounded ring buffer
  → widget (at most 4 UI updates/sec)
```

- Stream data does not enter TanStack Query.
- A snapshot replaces state after connect or gap.
- Duplicate sequences are ignored; out-of-order sequences trigger gap recovery.

## Migration points

| Point | Migration |
| --- | --- |
| Dashboard load (`GET`) | Dashboard `schemaVersion` and widget `configVersion` migrations |
| Import | Envelope validation, migrations, cap checks |
| Save | Validate the current version; never write an older schemaVersion |
| Render | Unsupported widget version → placeholder, data preserved |

Migrations are idempotent and tested for every supported version. Migration
results may be cached per `(dashboardId, revision)`.

## Undo and redo

- History is local to the draft, bounded to 50 entries.
- Immutable transitions; a drag/resize gesture is one entry.
- An entry records the edited breakpoint, not all breakpoints.
- Publish or version restore clears history.
- History is never sent to the backend.

## Version restore

```text
GET /v1/dashboards/:id/versions
  → select a version
POST /v1/dashboards/:id/restore { versionId } (If-Match)
  → server writes version config as the new draft
  → revision increments
  → history clears
```

Restore never mutates the immutable version row and never publishes implicitly.

## Import and export

- Export: config + envelope (`schemaVersion`, `exportedAt`, app version).
- Import: validate envelope → migrate → validate → cap check → regenerate IDs →
  save as draft.
- Unknown widget types are preserved as placeholders.

## Time and timezone

- All persisted timestamps are UTC ISO-8601.
- Display timezone resolution: user preference → dashboard setting → organization
  default.
- Relative time ranges (`last 24h`) are resolved at execution time using the
  resolved timezone.

## Related documents

- [dashboard-schema.md](dashboard-schema.md)
- [data-source-contracts.md](data-source-contracts.md)
- [realtime-protocol.md](realtime-protocol.md)
- [backend-architecture.md](backend-architecture.md)
- [decisions/ADR-002-dashboard-schema.md](decisions/ADR-002-dashboard-schema.md)
