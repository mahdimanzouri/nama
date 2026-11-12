# Plugin kit

An example plugin package written against the documented contracts. It contains
one visualization plugin and one server-side data-source plugin, and no code
from `apps/web` or `apps/api`.

- `src/widget.mjs` — `@example/status-badge`, a React widget registered through
  `defineWidget` from `@nama/dashboard-builder/plugins`. Its config is at version
  2, migrates version-1 configs, and ships an editor settings panel through the
  contract's `settings` field.
- `src/data-source.mjs` — the `memory` connector, a `ServerDataSourcePlugin`
  from `@nama/dashboard-types`. It implements `test`, `validate`, `execute` and
  `discover`, rejects unknown fields, honors `ctx.limits.maxRows` and reports
  truncation.
- `src/verify.mjs` — registers both through the public registries and asserts
  duplicate rejection, capability consistency, config migration and truncation.

## Run it

From the repository root:

```bash
pnpm build
pnpm verify:consumer
```

`verify:consumer` packs the four `@nama/*` packages, installs the tarballs into a
throwaway project, copies this `src` directory next to it and runs
`verify.mjs` against the installed packages. It also checks that
`@nama/dashboard-builder/plugins` ships with its `"use client"` directive and
stays inside its gzipped budget.

The `package.json` here records the dependencies a real plugin package would
declare; it is not installed by the workspace, because `examples/` is outside
the pnpm workspace. The dependency versions in the verification run come from
the packed tarballs.

## What it demonstrates

- Registration is explicit: the host passes the plugin to `createWidgetRegistry`
  or `createDataSourcePluginRegistry`; nothing is discovered or fetched.
- A plugin whose capabilities promise a method it does not implement is rejected
  at registration, not at the first request.
- A newer persisted `configVersion` is never coerced; the runtime keeps the data
  and renders a placeholder.
- A server-side plugin receives secrets only through `ctx.credentials()` and
  must honor `ctx.signal` and the runtime limits.
- Widget components do not fetch data; they render the four data states and
  localize user-facing strings through `locale.translate`.
