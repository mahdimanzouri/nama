# Standalone consumer

A minimal React application that renders a dashboard through the packed SDK,
without `apps/web` or any monorepo source alias.

`src/dashboard.mjs` defines a custom `@example/kpi` widget, a dashboard
configuration and a static `DataAdapter`. `src/server.mjs` server-renders it with
`react-dom/server`, which is the same entry point a Next.js server component or
an Express handler would use inside a client boundary.

## Run it

From the repository root:

```bash
pnpm build
pnpm verify:consumer
```

`verify:consumer` does the full loop in a temporary directory: it packs
`@nama/dashboard-types`, `@nama/dashboard-core` and `@nama/dashboard-builder`,
writes a `package.json` that points at those tarballs, installs offline, renders
`src/server.mjs` and asserts:

- the dashboard renders (`data-widget-type="@example/kpi"`, widget content, theme)
- `@nama/dashboard-builder/styles.css` resolves and contains the tokens
- the built entry still starts with `"use client"`
- exactly one React copy is installed
- each entry stays under its gzipped budget: root 16 KiB, editor 20 KiB, widgets
  16 KiB, plugins 8 KiB

The same run also installs `examples/plugin-kit` from the tarballs and checks the
public plugin contracts there (`PLUGIN_KIT_OK`).

To reproduce by hand, copy this folder somewhere outside the workspace, replace
the `@nama/*` dependency versions with the tarball paths from `pnpm pack`, run
`pnpm install`, then `node src/server.mjs`.

## What it demonstrates

- `DashboardProvider` receives the configuration, locale, direction, theme and
  data adapter; nothing is read from a backend.
- A custom widget is registered through `defineWidget` from
  `@nama/dashboard-builder/plugins` with a Zod config schema.
- The viewer resolves the desktop layout, renders the widget inside an error
  boundary and passes locale, theme tokens and data state to it.
- No editor, drag/resize or built-in widgets are used; see `examples/plugin-kit`
  for the data-source plugin path.
