# ADR-002: Versioned Dashboard Configuration

## Status

Accepted

## Date

2026-11-12

**Deciders:** Architecture (M0)

## Context

Dashboard configuration is portable data that must survive schema changes,
plugin upgrades, imports from other environments and partial client knowledge.
It must distinguish editable draft state from what viewers see, and it must
support responsive layouts without letting widget objects own coordinates.

## Decision

1. Persist configuration as a single JSON document per dashboard with a
   top-level `schemaVersion`. Initial version is `1`.
2. Store `draftConfig` and `publishedConfig` as separate columns. A publish
   copies draft to published, increments `revision`, and inserts an immutable
   `DashboardVersion` row in one transaction (see ADR-008 context and the data model).
3. Every widget carries its own `configVersion`, independent of the dashboard
   `schemaVersion` and of the plugin package version.
4. Layout lives in `layouts: Record<Breakpoint, DashboardLayout>` with
   breakpoints `desktop`, `tablet`, `mobile`. `LayoutItem` entries are the
   **only** source of widget position. Widgets never carry coordinates.
5. A breakpoint without an item for a widget inherits the next wider breakpoint
   at render time; the item is materialized when that breakpoint is first
   edited. If no breakpoint contains the widget, it is appended below the
   existing layout.
6. Migrations run on read and on import, are idempotent, and are covered by
   tests for every supported `schemaVersion`.
7. Validation happens before render and before save. Errors identify field
   paths; they are never free text.
8. Caps: 1 MiB serialized configuration, 100 widgets per dashboard (warn above
   50). Import/export rejects documents above these caps.
9. Unknown widget types and unsupported `configVersion` values render a
   recoverable placeholder and are preserved verbatim on save.
10. Configuration never contains server-owned fields (ownership, shares,
    credentials, audit metadata) and never contains timestamps for storage
    decisions; time is stored in UTC.

## Consequences

- The client can evolve widgets independently of dashboard structure.
- Unknown plugins degrade one widget, not the whole dashboard.
- Read-time migration adds latency; migration results are cached per revision.
- Position materialization means the same dashboard can have different item
  counts per breakpoint, which the editor must handle explicitly.
- The 1 MiB and 100-widget caps must be enforced on the server, not only in
  the editor UI.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Normalized relational rows per widget | Migration-heavy; loses portability and atomic draft snapshots |
| Coordinates stored on the widget | Duplicates state per breakpoint; makes inheritance ambiguous |
| Unversioned JSON with best-effort parsing | No safe upgrade path; silent data loss |
| One document per breakpoint | Publish atomicity and version comparison become complex |

## Related documents

- [../dashboard-schema.md](../dashboard-schema.md)
- [../data-model.md](../data-model.md)
- [../data-flow.md](../data-flow.md)
- [ADR-008](ADR-008-tenant-isolation-rls.md)

## Review trigger

Any change to `schemaVersion`, breakpoint set, layout semantics or caps.
