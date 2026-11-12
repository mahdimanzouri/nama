# Current Phase

**Current milestone:** M3.5 — Walking skeleton (complete; next is M4)
**Status:** Complete, accepted 2026-11-12
**Date:** 2026-11-12

## What the repository looks like now

```text
nama/
├── apps/
│   ├── web/                    # Next.js 16 app: login, dashboard list, editor, viewer
│   └── api/                    # Fastify 5 service: auth, dashboards, queries, /healthz
├── packages/
│   ├── dashboard-types/        # platform constants + runtime contracts (M2)
│   ├── dashboard-core/         # host-agnostic runtime (M3)
│   ├── dashboard-builder/      # public React API and CSS (M3)
│   └── api-client/             # hand-written typed transport (M3.5)
├── examples/standalone-consumer/  # SSR consumer with a custom widget (M3)
├── scripts/
│   ├── verify-workspace.mjs
│   └── verify-consumer.mjs     # pack → offline install → SSR → distribution checks
├── docs/                       # architecture, decisions, implementation state
├── turbo.json
├── tsconfig.base.json
├── eslint.config.mjs           # single root config for the whole workspace
├── .github/workflows/ci.yml
└── pnpm-workspace.yaml
```

## Delivered in M3.5

### `apps/api`

| Area | Contents |
| --- | --- |
| Auth | `POST /v1/auth/login`, `GET /v1/auth/session`, `POST /v1/auth/logout`; Argon2id hashes, opaque 256-bit session tokens hashed at rest, `nama_session` (httpOnly) plus readable `nama_csrf`, `X-CSRF-Token` double-submit on mutations |
| Dashboards | List, create, get, draft get/save, publish; service-layer organization scoping so out-of-scope IDs return 404 |
| Concurrency | `If-Match: "<revision>"` on draft writes and publish; stale writes return `409 REVISION_CONFLICT` with `currentRevision`; publish copies the draft, increments `revision`, sets `publishedRevision`/`publishedAt` and inserts into the retained version list in one step |
| Queries | `POST /v1/queries/execute` against a seeded in-memory dataset, with validation errors returned as `errors[].issues` |
| Views | `GET /v1/dashboards/:id` returns `publishedConfig` and `publishedRevision` only; `GET /v1/dashboards/:id/draft` is editor-only |
| Store | In-memory, seeded with one organization, one editor and one viewer account |

### `@nama/api-client`

- Hand-written transport over `fetch` with cookie credentials, CSRF header injection,
  `If-Match` support and typed `ApiError`.
- `RevisionConflictError` exposes `currentRevision` for the editor conflict path.
- Exported request/response types mirroring the implemented OpenAPI schemas.

### `apps/web`

| Area | Contents |
| --- | --- |
| Transport | `next.config.ts` rewrites `/api/:path*` to `${NAMA_API_URL ?? "http://localhost:3001"}/:path*`, keeping the session cookie first-party |
| Routes | `/login`, `/` (list), `/dashboards/new`, `/dashboards/[id]/edit`, `/dashboards/[id]/view`; dynamic params awaited inside `<Suspense>` for `cacheComponents` |
| Session | `useSession` hook plus `WorkspaceGate`; server-checked session drives all authenticated screens |
| Editor | Zustand vanilla store per mount, add/remove widgets, keyboard move and explicit width/height controls, KPI and line settings panels, save draft, publish, dirty tracking |
| Widgets | `KPI` and `line` plugins registered through `defineWidget` and the SDK registry; values come from TanStack Query over the HTTP data adapter with `refetchInterval` set from `settings.refreshInterval` |
| Viewer | Renders `publishedConfig` only; shows `publishedRevision` and never exposes the draft |
| Theme | Light/dark/system through SDK tokens plus Tailwind classes |

## Decisions taken during M3.5

| Decision | Choice | Why |
| --- | --- | --- |
| API client | Hand-written typed transport | M3.5 needed real calls before M6 codegen; the transport is small and the OpenAPI file remains the contract |
| Web → API transport | Same-origin rewrite proxy | Keeps `nama_session`/`nama_csrf` first-party and avoids CORS in development |
| Viewer revision | New `publishedRevision` summary field | Viewers must not see draft revision numbers or infer draft activity |
| Viewer payload | `publishedConfig` only, no `draftConfig` | Enforces rule 17 at the API boundary, not in the UI |
| CSRF | Double-submit cookie, checked on every mutating route | Cookie-only auth is forgeable from another origin |
| Editor baseline | Zustand store, no SDK editor API | `onSave`/`onConflict` and drag/resize remain M4 |
| Widget registration | Local `WEB_WIDGETS` array passed to the provider | Proves the plugin path without shipping built-ins |
| Editor movement | Buttons for move/resize | Functionally complete without a layout library; drag/resize is M4 |
| Route state | Loaders keyed by `dashboardId`, login resets on unmount | Next 16 preserves route component state across navigation |

## Open decisions

| Decision | Status | Blocks | Notes |
| --- | --- | --- | --- |
| Deployment topology | **Unresolved** | M6, M8 | ADR-011 recommends self-hosted Docker; options and trade-offs recorded |
| Prisma major version | Open | M6 | Latest registry version is a release candidate; pin newest stable at M6 |
| Persian calendar library | Open | M10 | Display-only strategy decided; library selection deferred |
| API code generation | Deferred to M6 | M6 | `api-client` is hand-written; no drift check until codegen lands |
| Raw SQL for non-admin users | Deferred | — | Not supported in v1 (ADR-010) |
| Public/anonymous sharing | Deferred | — | Organization-scoped sharing only in v1 |
| External time-series store | Deferred | — | Telemetry stays out of Postgres; product selection later |
| Plugin sandbox/marketplace | Deferred | — | Trusted install only (ADR-006) |
| Browser end-to-end test | Deferred | — | The HTTP slice runs in CI; the browser walkthrough was manual |
| SDK editor callbacks | Deferred to M4 | M4 | `onSave`/`onConflict` and draft ownership belong to the editor |

## What M4 must not assume

- That drag, resize or a layout library exist; the editor moves widgets with
  buttons against the CSS-grid canvas.
- That the SDK owns editor state or draft persistence; the web app keeps a
  Zustand store and calls `api-client` directly.
- That viewers can read drafts; the API never returns `draftConfig` to them.
- That data persists; the API store is in memory and reseeds on restart.
- That realtime is wired; only HTTP polling with `refetchInterval` is live.
- That rate limiting, audit logs, RLS or connection pooling exist.
- That Jalali dates render; formatting uses `Intl` with the host locale.
- That `dashboard-core` may import React at runtime or Next.js at all.

## Verification (M3.5)

All commands were run from the repository root on Node 24.13.0 with pnpm 10.33.2.

| Check | Command | Result |
| --- | --- | --- |
| Boundaries | `pnpm verify:workspace` | Passes: approved graph (`api-client → types`), no host imports, single React version |
| Lint | `pnpm lint` | Clean |
| Format | `pnpm format:check` | All files match |
| Typecheck | `pnpm typecheck` | 10 tasks successful |
| Test | `pnpm test` | 70 types + 37 core + 10 builder + 9 api-client + 24 api + 10 web = 160 tests pass |
| Build | `pnpm build` | 6 tasks successful, 8 routes (`/`, `/login`, `/dashboards/new`, `/dashboards/[id]/edit`, `/dashboards/[id]/view`, plus framework routes) |
| Browser slice | Manual run against the dev servers | Editor logged in, created a dashboard, added KPI + line over HTTP data, saved (rev 2), published (rev 3), added a third widget and saved a draft (rev 4) |
| Published-only viewer | Same run, second account | List showed "Published revision 3", no edit affordance; view showed exactly the two published widgets while the draft at rev 4 stayed invisible |

Polling was verified by inspecting the adapter wiring
(`packages/dashboard-builder/src/widget-query.ts:43`) rather than observed
requests: the in-app browser reports `visibility: hidden`, and TanStack Query
pauses background refetches for hidden tabs.

## Next action

M3.5 is accepted. The next milestone is M4 (editor): SDK-owned draft state,
`onSave`/`onConflict`, drag and resize on the canvas, and richer widget settings.
Do not begin M4 until it is requested.
