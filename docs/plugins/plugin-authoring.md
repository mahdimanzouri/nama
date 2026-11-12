# Plugin Authoring Guide

**Status:** Delivered (M11). `examples/plugin-kit` is a runnable widget and
data-source plugin pair written against these contracts.

This guide explains how to add a visualization or data-source plugin. The
normative interfaces are in
[widget-plugin-contract.md](widget-plugin-contract.md) and
[data-source-plugin-contract.md](data-source-plugin-contract.md).

## Before you start

- Plugins are **trusted installed code**, equivalent to adding an npm dependency.
  There is no runtime sandbox in v1.
- React 19 is a peer dependency. Do not bundle your own React copy.
- Use the Zod version pinned by `@nama/dashboard-types`.
- The plugin must work in English and Persian, in RTL chrome and all three theme
  modes. The canvas remains LTR-only.
- Do not fetch data directly. Use the runtime data contract.

## Widget plugin: step by step

1. **Scaffold** a package with `peerDependencies` on `react`, `react-dom` and
   `@nama/dashboard-types`, and a `build` script that emits ESM + declarations
   and preserves `"use client"`. Import `defineWidget` and the contract types from
   `@nama/dashboard-builder/plugins`.
2. **Declare the manifest**: stable `id` (e.g. `@acme/gauge`), semver `version`,
   `name`, optional `description`.
3. **Define `configSchema`** with Zod and a `defaultConfig` that passes it.
   Keep the persisted config in widget terms (fields, series, formatting), not raw
   chart options.
4. **Choose `configVersion`** (integer ≥ 1). Any later breaking change to the
   persisted shape increments it and adds a migration.
5. **Implement the component** for all data states: idle, loading, error, ready,
   and empty (`rows.length === 0`). Handle resize via the provided width/height
   and a resize observer.
6. **Implement `settings`** if the widget is configurable. Validate before
   calling `onChange`; never persist partially invalid config.
7. **Write migrations** from every supported older `configVersion`. Throw
   `UnsupportedConfigVersionError` for versions you cannot migrate.
8. **Declare capabilities** (`realtime`, `export`, `filters`) only if the widget
   actually uses them.
9. **Register** the plugin through `createWidgetRegistry` before rendering a
   dashboard that references it. Duplicate ids are rejected unless the host
   passes `{ replace: true }`.

## Data-source plugin: step by step

1. Create a **server-side package** (no React) used by `apps/api`. Implement
   `ServerDataSourcePlugin` from `@nama/dashboard-types`; the package never
   imports the API.
2. Implement `kind`, `manifest`, and a `configSchema` for non-secret connection
   settings. Put secrets in `credentialSchema`.
3. Implement `test()` and map failures to the error taxonomy.
4. Implement `validate()` for structured queries (and raw SQL only when
   `capabilities.rawSql` and the source allows it).
5. Implement `execute()`; honor `ctx.signal`, timeouts, row and byte caps.
   Report truncation in `meta.truncated`.
6. Apply the egress policy: private-range blocking, DNS re-check on redirects,
   TLS verification. Never accept `file:` or arbitrary protocols.
7. Access secrets only through `ctx.credentials()`. Never log them.
8. Implement `subscribe()` only when the source has a native stream; assign
   source offsets for resume, but let the gateway own subscription sequences.
9. Register the plugin with `createDataSourcePluginRegistry` at API boot. Its
   manifest, schemas, required methods and capability declarations are validated
   before it can serve a request.
10. Add tests for timeouts, cancellation, truncation, SSRF rejection and error
    mapping.

## Local development

- Start from `examples/plugin-kit`: a widget plus data-source plugin pair that
  `pnpm verify:consumer` registers against the packed packages.
- Build a small host React app (or Storybook) that registers the plugin and
  renders fixture dashboards.
- Use the static/mock data adapter for widget work and a local API instance for
  data-source work.
- Test both directions (`ltr`/`rtl`) and all theme modes.
- Test a dashboard that references an unknown type to confirm the placeholder
  preserves data.
- Run the package consumer test before declaring compatibility.

## Versioning and compatibility

| Change | `configVersion` | Package `version` |
| --- | --- | --- |
| Rendering or internal refactor | unchanged | patch/minor |
| New optional config field with default | unchanged (if default fills it) | minor |
| Renamed/removed/required config field | increment + migration | major |
| New capability behavior | unchanged | minor |
| Dependency on a newer SDK API | unchanged | major |

Document the supported SDK versions in the plugin `README`.

## Security checklist

- [ ] No `eval`, `new Function`, or remote script loading.
- [ ] No direct network calls from widget components.
- [ ] No access to credentials or raw connection strings.
- [ ] No `dangerouslySetInnerHTML` with untrusted data.
- [ ] No `window`/`document` access at module import time.
- [ ] Server-side plugins block private network ranges and re-check DNS.
- [ ] Errors never include secrets or stack traces returned to the browser.
- [ ] User-facing strings pass through `locale.translate`.

## Distribution

- v1 is private-workspace only. There is no registry or publish pipeline.
- Ship plugins as workspace packages or packed tarballs installed by the host.
- The host decides which plugins are trusted and registered.
- A future marketplace or iframe sandbox requires a separate ADR.

## Review checklist for a new plugin

- [ ] Manifest valid and `id` unique.
- [ ] `defaultConfig` passes `configSchema`.
- [ ] Loading, error, empty and ready states implemented.
- [ ] Migrations tested for every supported version.
- [ ] Capabilities match behavior.
- [ ] RTL and theme modes verified.
- [ ] No direct data or credential access.
- [ ] Documentation includes supported SDK versions and configuration fields.
