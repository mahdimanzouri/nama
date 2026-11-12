# Current Phase

**Current milestone:** M11 — Plugin platform (next)
**Status:** M10 complete, awaiting acceptance (2026-11-12)
**Date:** 2026-11-12

## What the repository looks like now

```text
nama/
├── apps/
│   ├── web/                    # Next.js 16 app: login, dashboard list, editor, viewer
│   │   ├── e2e/                # Playwright locale, theme and screenshot coverage (M10)
│   │   ├── components/
│   │   │   └── app-shell.tsx   # chrome, locale/theme selectors, preferences (M10)
│   │   └── lib/
│   │       ├── data-adapter.ts # SDK HTTP adapter pointed at the /api proxy
│   │       ├── i18n.ts         # en/fa web chrome catalog (M10)
│   │       ├── web-preferences.tsx # locale/theme/i18n context (M10)
│   │       ├── realtime-adapter.ts # SSE over /api, or WS via NEXT_PUBLIC_NAMA_WS_URL
│   │       └── templates.ts    # host templates bound to the demo connector
│   └── api/                    # Fastify 5 service with PostgreSQL persistence
│       ├── prisma/             # schema, migrations, seed
│       ├── scripts/            # OpenAPI drift check
│       └── src/
│           ├── http/           # auth hooks and request helpers
│           ├── infrastructure/ # persistence, RLS scoping, credentials, RBAC, sessions
│           └── modules/        # auth, dashboards, data-sources, organizations,
│               │               # preferences, queries
│               ├── queries/    # QueryService, limits, plugins/{static,rest,egress}
│               └── realtime/   # /ws/v1 gateway, SSE stream, authorizer, hub, buffers
├── packages/
│   ├── dashboard-types/        # platform constants + runtime contracts (M2);
│   │                           # controls, interaction and transfer schemas (M9)
│   ├── dashboard-core/         # host-agnostic runtime, HTTP/static data adapters (M3/M7),
│   │                           # WebSocket/SSE realtime adapters (M8),
│   │                           # control/filter/visibility resolution (M9)
│   ├── dashboard-builder/      # provider, viewer, controls and CSS (M3/M4/M9);
│   │                           # editor behind the `./editor` entry (M9);
│   │                           # built-in widgets behind the `./widgets` entry (M5)
│   └── api-client/             # hand-written typed transport (M3.5, extended in M6/M7/M9)
├── examples/standalone-consumer/  # SSR consumer with a custom widget (M3)
├── infra/postgres/init.sql     # owner role, runtime role grants
├── docker-compose.dev.yml      # PostgreSQL 17 on host port 5433
├── scripts/                    # workspace, consumer and OpenAPI verification
├── docs/                       # architecture, decisions, implementation state
├── turbo.json
├── tsconfig.base.json
├── eslint.config.mjs           # single root config for the whole workspace
├── .github/workflows/ci.yml
└── pnpm-workspace.yaml
```

## Delivered in M10

### SDK i18n and formatting

| Area | Contents |
| --- | --- |
| Jalali display | `dateLocale` maps `fa` to `fa-IR-u-ca-persian`; `formatDate` combines it with the resolved timezone while storage stays UTC ISO. No calendar library (TD-008 closed) |
| Digit normalization | `normalizeDigits` plus `parseLocalizedNumber` handle Persian/Arabic-Indic digits, `٬`/`,` grouping and the `٫` decimal separator; applied in dashboard controls, editor variable/filter settings and number widget settings (TD-062 closed) |
| Localized SDK chrome | Toolbar revision and conflict counts format through `i18n.formatNumber`; optional status segments collapse so an empty slot leaves no ` · ` separator; the many-widgets warning localizes its count |
| Formatter tests | Runtime tests cover normalization, localized parsing, fa-Jalali formatting with a fixed UTC timezone and missing-key fallback |

### Web chrome and preferences

| Area | Contents |
| --- | --- |
| Catalog | `apps/web/lib/i18n.ts` holds en/fa `WEB_MESSAGES` and `createWebI18n`, which delegates to `createDashboardI18n` so chrome and SDK text share the host → SDK → English → key order; template names and descriptions are keyed by template id |
| Context | `WebPreferencesProvider`/`useWebI18n` expose locale, theme, direction and the facade; page content renders inside the shell so client components reach the context |
| Translated surfaces | Home, login (fields, buttons, demo accounts), dashboard list, create form, editor loader/back links/read-only notice/conflict recovery/version history, viewer loading/not-published/meta, and the session pending/error states |
| Switching | The header always shows a language selector and, once signed in, a theme selector. A signed-out choice is stored under `nama.locale` and read with `useSyncExternalStore`; a signed-in choice persists through `PATCH /v1/me/preferences` and is merged into session state so the editor keeps its draft |
| Precedence | Local override → signed-in user preference → stored locale → `en`; a failed write reverts the optimistic override |
| Themes | `data-theme` is set on `<html>` and the shell; `light`, `dark` and `system` map to CSS variables, and switching never remounts widgets or restarts queries |
| RTL | The shell uses `dir="rtl"` and logical CSS properties; the editor and viewer canvases stay `dir="ltr"` and render the visible `builder.canvas.ltrNotice` disclosure in Persian |

### Browser coverage

| Area | Contents |
| --- | --- |
| Runner | Root `playwright.config.ts`; tests in `apps/web/e2e`; one worker; API and web dev servers started or reused; traces on failure; screenshots allow a 2% pixel ratio |
| Persian flow | Login in fa → create a dashboard from the `operations` template → editor asserts RTL shell, LTR canvas and the Persian disclosure → publish → viewer asserts RTL shell, LTR canvas and the Persian revision/date line → reload keeps fa/rtl |
| Theme flow | Dark and light selections are checked against computed body colours and survive a reload; `system` clears the explicit mode |
| Screenshots | Header in English, login in English and login in Persian |
| Transport | The test web server sets `NEXT_PUBLIC_NAMA_WS_URL` so realtime uses one WebSocket: the SSE adapter's per-subscription streams would exhaust the browser's HTTP/1.1 pool and stall publish (TD-060). Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` when the browser download is unavailable |

## Delivered in M9 (summary)

| Area | Contents |
| --- | --- |
| Controls | Variables, filters, dashboard time range, visibility and interactions resolve in `dashboard-core`; `DashboardControls` renders them; a chart click writes a variable |
| Editor | Variable/filter/visibility/interaction authoring, whole-draft import/export, per-breakpoint layout, version restore |
| Web/API | Host templates, create-with-config, sharing; the editor moved to `@nama/dashboard-builder/editor` with its own budget |

Earlier milestones: M8 realtime gateway, hub, replay and adapters; M7 connector
plugins and query limits; M6 PostgreSQL, RLS, authentication, drafts/publish/
versions, sharing and embed tokens; M5 built-in widgets; M4 editor; M3.5 web
slice; M3 SDK foundation; M2 contracts; M1 workspace.

## Decisions taken during M10

| Decision | Choice | Why |
| --- | --- | --- |
| Web i18n mechanism | Typed `web.*` catalog through the SDK `DashboardI18n` factory | Shares one fallback chain with SDK text and avoids a runtime dependency (next-intl not adopted) |
| Locale persistence | Server preference for signed-in users; `localStorage` only while signed out | A user's profile should win across devices, while the login page still honors the last choice before a session exists |
| Preference application | Merge into session state instead of reloading it | The editor keeps its draft and never remounts on a language or theme change |
| Jalali strategy | ICU `fa-IR-u-ca-persian` in `formatDate`; storage stays UTC ISO | No calendar library to license or upgrade; native date inputs stay Gregorian |
| Number input | Normalize digits and separators at the control boundary, keep canonical numbers | Persian input works end to end without changing the query contract |
| Number display | Format every number embedded in translated copy with `i18n.formatNumber` | Persian chrome must not mix ASCII digits into otherwise Persian copy |
| E2E realtime transport | Pin `NEXT_PUBLIC_NAMA_WS_URL` in the Playwright web server | Six SSE streams saturate the HTTP/1.1 pool and block publish; WebSocket is the documented fallback-free path (TD-060) |

## Open decisions

| Decision | Status | Blocks | Notes |
| --- | --- | --- | --- |
| Data-source picker | Open | — | The editor lists sources but has no picker; web widgets and templates bind `demo-source` (TD-043) |
| Server-side control state | Open | — | Filters and variables resolve client-side; the server validates the resolved request only (TD-066) |
| Grouped visibility conditions | Open | — | No parentheses; `and` binds tighter than `or` (TD-063) |
| Viewer/editor layout parity | Open | — | Editor uses React Grid Layout, viewer CSS grid (TD-038) |
| Source push / CDC | Open | — | Realtime polls connectors |
| Cross-process realtime fan-out | Open | — | Channels, replay threads and limits are per process |
| SSE multiplexing | Open | — | One stream per subscription; default dev transport exhausts HTTP/1.1 connections with many live widgets (TD-060) |
| Widget stream rendering | Open | — | Built-ins render snapshots; `stream.latest` is unused (TD-058) |
| SQL/MQTT connectors | Open | — | Kinds are declared but return `501` |
| DNS pinning / egress proxy | Open | — | Guard resolves once (TD-052) |
| Query rate limiting | Open | — | Only per-source concurrency is bounded |
| E2E in CI | Open | — | The Playwright suite runs locally; CI wiring and browser provisioning remain (TD-036) |
| API code generation | Deferred to M12 | — | `api-client` remains hand-written |
| Public/anonymous sharing | Deferred | — | Organization-scoped sharing only |
| External time-series store | Deferred | — | Telemetry stays out of Postgres |
| Plugin sandbox/marketplace | Deferred | — | Trusted install only (ADR-006) |

## What M11 must not assume

- That control values persist. They are provider-mount state seeded from
  `initialControls`; a reload returns every control to its default.
- That a filter affects every widget. It applies only to widgets whose query
  `fields` include the filtered field.
- That visibility expressions can be grouped. There are no parentheses and
  malformed expressions make widgets visible.
- That hidden widgets stop existing. The editor renders them with
  `ignoreVisibility`; the viewer does not mount them.
- That locale or theme changes remount the editor. Preferences merge into
  session state; the draft survives a switch.
- That a locale URL segment exists. Routes are locale-free and the language comes
  from preferences; there is no `/en` or `/fa` prefix.
- That authored content is translated. Dashboard titles, saved widget labels and
  widget configs stay as written; only chrome and template names come from the
  catalog.
- That Persian dates are stored differently. Storage stays UTC ISO; Jalali is a
  display format through ICU, and native date inputs stay Gregorian.
- That the dashboard canvas or charts mirror in RTL. The canvas is LTR-only with
  a visible disclosure, and chart axes are not mirrored (TD-001, TD-041).
- That the E2E suite gates changes. It runs locally with `pnpm test:e2e`, is not
  wired into CI yet, and runs the WebSocket realtime transport (TD-036, TD-060).
- That template dashboards work against a real source. They bind the virtual
  `demo-source` connector.
- That the editor offers a data-source picker; it does not (TD-043).
- That editor and viewer lay widgets out identically; the engines differ
  (TD-038).

## Verification (M10)

All commands were run from the repository root on Node 24.22.1 with pnpm 10.33.2.

| Check | Command | Result |
| --- | --- | --- |
| Boundaries | `pnpm verify:workspace` | Passes: approved graph, no host imports, single React version |
| Lint | `pnpm lint` | Clean |
| Format | `pnpm format:check` | All files match |
| Typecheck | `pnpm typecheck` | 10 tasks successful |
| Test | `pnpm test` | 281 passed, 6 skipped in 30 files: types 80, core 67, builder 56, api-client 14, api 53 (+6 Postgres skipped), web 11 |
| Build | `pnpm build` | 6 tasks successful, 8 routes |
| Consumer | `pnpm verify:consumer` | `"use client"` on all three entries; 7.9 / 17.6 / 8.1 KiB gzipped under 16 / 20 / 16 KiB; SSR render; single React copy |
| OpenAPI drift | `pnpm verify:openapi` | In sync: 39 served operations, 39 documented |
| Browser E2E | `pnpm test:e2e` | 4 passed: Persian editor→publish→viewer with RTL chrome and LTR canvas, theme persistence, Persian dark chrome and screenshot baselines |

The M10 suites cover digit normalization and localized parsing (including
grouping separators), Jalali formatting with a fixed UTC timezone, missing-key
fallback, web catalog interpolation and Persian template labels, plus the four
browser scenarios. The 6 Postgres tests skip without `NAMA_TEST_DATABASE_URL` and
always run in CI. The Playwright run needed `PLAYWRIGHT_CHROMIUM_EXECUTABLE`
because the browser download was unreachable in this environment.

## Next action

M10 is complete and awaiting acceptance. The next milestone is M11 (plugin
platform): package and manifest lifecycle for widget and data-source plugins,
registry hardening, configuration migration and the plugin authoring path
against the normative contracts in `docs/plugins/`.
