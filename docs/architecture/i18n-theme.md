# Internationalization and Themes

**Status:** Delivered at M10 (2026-11-12). The client i18n facade, message
fallback, theme tokens and LTR-canvas notice landed in M3 (`@nama/dashboard-core`
i18n/theme, `@nama/dashboard-builder` provider). M10 added Jalali display,
Persian digit input, the full web chrome catalog, persisted locale/theme
preferences and Playwright coverage.

## Locales and directions

| Locale | Direction | Notes |
| --- | --- | --- |
| `en` | `ltr` | Default locale |
| `fa` | `rtl` | Persian; Persian digits accepted and normalized |

Locale and direction are explicit props on `DashboardProvider`. The SDK uses the
injected `DashboardI18n` interface and never imports a framework i18n package.
The web app builds its chrome `DashboardI18n` from a `web.*` catalog through the
same SDK factory, so chrome and SDK strings share one resolution order.
`next-intl` was planned in ADR-005 but not adopted: the app has no locale route
segments and the catalog is a small typed record, so a runtime dependency was
not justified.

## SDK i18n interface

```ts
interface DashboardI18n {
  locale: string;
  direction: "ltr" | "rtl";
  translate(key: string, values?: Record<string, unknown>): string;
  formatNumber(value: number, options?: Intl.NumberFormatOptions): string;
  formatDate(
    value: string | Date,
    options?: Intl.DateTimeFormatOptions,
  ): string;
}
```

`createDashboardI18n` builds the facade; hosts inject it through
`DashboardProvider` or receive it from the context hooks.

Resolution order:

1. Host-provided overrides (`messages` prop)
2. SDK built-in messages
3. English
4. The key itself, with one development warning per missing key

Translation never throws.

## Message keys

- Keys are stable identifiers (`builder.toolbar.save`, `widget.kpi.empty`), not
  English sentences.
- Persisted property keys and internal IDs are never translated.
- Widget plugins use their own key namespace (`@acme/gauge.title`) and may ship
  English defaults that hosts override.
- Number and date formatting go through injected formatters, not string
  concatenation.

Sample Persian copy used by the SDK:

| Key | English | Persian |
| --- | --- | --- |
| `builder.toolbar.save` | Save draft | ذخیرهٔ پیش‌نویس |
| `builder.toolbar.publish` | Publish | انتشار |
| `builder.conflict.title` | This dashboard changed elsewhere | این داشبورد جای دیگری تغییر کرده است |
| `builder.canvas.ltrNotice` | The canvas only supports left-to-right editing in this version | ویرایشگر داشبورد در این نسخه فقط از چیدمان چپ‌به‌راست پشتیبانی می‌کند |
| `widget.empty` | No data | داده‌ای برای نمایش نیست |

## Web chrome vocabulary

- `apps/web/lib/i18n.ts` holds the typed `WEB_MESSAGES` catalog (`web.*` keys)
  for `en` and `fa` and a `createWebI18n(locale, timezone)` factory that passes
  the catalog to `createDashboardI18n`. Chrome and SDK text therefore share the
  same host → SDK → English → key resolution.
- `WebPreferencesProvider` exposes `{ locale, theme, direction, i18n }` and the
  `useWebI18n()` hook. Error and loading states that render outside the shell use
  an English fallback so they can paint before preferences resolve.
- The shell sets `lang`, `dir` and `data-theme` on both `<html>` and the shell
  root, and all chrome uses logical CSS properties.
- Authored content is never translated: dashboard titles, saved widget configs
  and existing widget labels stay as written. Template display names and
  descriptions come from the catalog, keyed by template id.
- Every number embedded in a translated string is pre-formatted with
  `i18n.formatNumber` (SDK revision and conflict counts, web revision and date
  strings); raw numbers are not interpolated into Persian copy. Optional status
  segments are filtered before joining so an empty segment cannot leave a
  dangling ` · ` separator.

## Preferences and switchers

- The app header always shows a language selector and, once signed in, a theme
  selector (`light`, `dark`, `system`); both are labelled from the catalog and
  live in the shell, not in a page.
- Locale precedence: a local selection made this session → the signed-in user's
  server preference (`PATCH /v1/me/preferences`) → the locale stored in
  `localStorage` under `nama.locale` while signed out → `en`. A signed-in user's
  server preference therefore wins over the signed-out choice.
- The stored locale is read with `useSyncExternalStore` and written before the
  preference round-trip, so the first signed-out paint matches the last choice
  without a `setState`-in-effect pass.
- Persisting a preference updates session state in place instead of reloading the
  session, so the editor keeps its draft and never remounts.
- Theme defaults to `system`; switching theme changes CSS variables only and
  never remounts widgets or restarts queries. A failed preference write reverts
  the optimistic override and surfaces the API error.

## RTL rules

- All chrome, text, forms, menus, toolbars, sidebars and charts mirror in RTL.
- The dashboard canvas stays **LTR-only**. The editor displays
  `builder.canvas.ltrNotice` when the locale direction is RTL, and documentation
  states the limitation. Drag/resize handles are verified in LTR only.
- Use logical CSS properties (`margin-inline-start`, `inset-inline-end`) rather
  than hardcoded `left`/`right`.
- Icons that imply direction (arrows, chevrons) mirror; icons that do not (play,
  close) do not.
- Charts: axis direction, legend placement, tooltip alignment and label trimming
  are configured for RTL; numeric axes may remain LTR where the data semantics
  require it.
- Mixed Persian/English text and numbers are tested in both directions.

## Persian digits and numbers

- Numeric and date inputs accept Persian digits (`۰۱۲۳۴۵۶۷۸۹`) and Arabic-Indic
  digits (`٠١٢٣٤٥٦٧٨٩`), normalizing them to ASCII digits before validation and
  persistence.
- `normalizeDigits` converts both digit ranges; `parseLocalizedNumber` also drops
  grouping separators (`٬`, `,` and the thin spaces `Intl` emits) and maps the
  Arabic decimal separator `٫` to `.`. Both are applied to dashboard controls and
  editor settings, so digits typed in Persian reach the query contract as
  canonical numbers.
- Display formatting uses `Intl.NumberFormat(locale)`; persisted values remain
  canonical numbers/strings. Persian output uses `٬` for groups and Persian
  digits (`1,234` → `۱٬۲۳۴`).
- Currency and percent formatting are widget configuration, not global state.

## Dates, times and calendar

- Storage is UTC ISO-8601.
- Display timezone precedence: user preference → dashboard setting → organization
  default.
- Persian dates display in the Solar Hijri calendar through ICU: `dateLocale`
  maps `fa` to `fa-IR-u-ca-persian`, and `formatDate` combines that tag with the
  resolved timezone. No calendar library is needed (TD-008 closed).
- Native `<input type="date">` stays Gregorian ISO; only labels and formatted
  display text are localized.
- Inputs accept Persian digits, which normalize to ASCII before validation.
- Relative ranges (`last 24h`, `today`) resolve at query execution using the
  resolved timezone.
- Chart time axes use the resolved locale/timezone; tests use a fixed clock.

## Themes

Modes: `light`, `dark`, `system`.

- Theme is applied through semantic CSS variables on the provider root.
- Switching theme must not remount widgets or restart queries.
- Charts read the same tokens; no hardcoded chart colors.
- Empty, error and loading states use theme-aware tokens.
- Application preference and dashboard-specific preference have explicit
  precedence: dashboard setting (if present) → user preference → system.
  Language and theme are independent.

Token example:

```css
:root,
[data-theme="light"] {
  --nama-bg: #ffffff;
  --nama-surface: #f5f7fa;
  --nama-text: #111827;
  --nama-muted: #6b7280;
  --nama-border: #e5e7eb;
  --nama-accent: #2563eb;
  --nama-danger: #dc2626;
  --nama-warning: #d97706;
  --nama-success: #059669;
}

[data-theme="dark"] {
  --nama-bg: #0b1120;
  --nama-surface: #111827;
  --nama-text: #f9fafb;
  --nama-muted: #9ca3af;
  --nama-border: #1f2937;
  --nama-accent: #60a5fa;
  --nama-danger: #f87171;
  --nama-warning: #fbbf24;
  --nama-success: #34d399;
}
```

ECharts theme mapping:

| Token | ECharts role |
| --- | --- |
| `--nama-text` | Axis labels, title |
| `--nama-muted` | Secondary labels, grid legend |
| `--nama-border` | Split lines, axis lines |
| `--nama-accent` | Primary series |
| `--nama-danger` / `--nama-warning` / `--nama-success` | Threshold and status series |
| `--nama-surface` | Chart background |

## Localization of errors and states

- API errors carry stable codes; the SDK maps codes to localized messages.
- Raw server messages are not rendered to users.
- Save, publish and conflict states use live-region announcements for
  accessibility (M10.5).

## Testing

- Both locales and both directions for every editor control.
- Charts in RTL and all themes.
- Persian digit input normalization.
- Jalali display and ISO storage round-trip.
- Missing-key behavior renders the key without throwing.
- Visual regression baselines for chrome in en/fa and light/dark.
- The LTR canvas notice appears in RTL and is absent in LTR.

## Implementation notes (M10)

| Concern | Implementation |
| --- | --- |
| SDK facade | `packages/dashboard-core/src/i18n.ts`: `createDashboardI18n`, `normalizeDigits`, `parseLocalizedNumber`, `dateLocale` (`fa` → `fa-IR-u-ca-persian`) |
| SDK chrome | Editor toolbar status and conflict counts format revisions through `i18n.formatNumber`; optional status segments collapse without dangling separators |
| WEB catalog | `apps/web/lib/i18n.ts`: `WEB_MESSAGES` (`en`, `fa`), `createWebI18n`, `templateLabels` |
| Preferences | `apps/web/components/app-shell.tsx`: language/theme selectors, `localStorage` locale for signed-out users, `PATCH /v1/me/preferences`, optimistic override reverted on failure |
| Session merge | `apps/web/lib/use-session.ts`: `applyPreferences` merges the new preference into session state so the provider re-renders without a reload |
| Tests | `dashboard-core` runtime tests (digits, grouping separators, Jalali with fixed UTC, fallback), `apps/web/lib/__tests__/i18n.test.ts` (interpolation, Persian digits and date, template labels) |
| Browser tests | `apps/web/e2e/locale-theme.spec.ts`: Persian editor → publish → viewer with RTL chrome, LTR canvas and disclosure; theme persistence across reload checked against computed background colours; screenshot baselines for the English and Persian login and header |
| E2E transport | The Playwright web server sets `NEXT_PUBLIC_NAMA_WS_URL` so realtime uses one WebSocket; SSE's per-subscription streams would exhaust the browser's HTTP/1.1 connection pool once six widgets are live (TD-060) |
| Command | `pnpm test:e2e` from the repository root; set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` when the browser download is unavailable. CI runs the suite in a dedicated Chromium job (TD-070). |

## Related documents

- [decisions/ADR-005-i18n-theme.md](decisions/ADR-005-i18n-theme.md)
- [sdk-api.md](sdk-api.md)
- [dashboard-schema.md](dashboard-schema.md)
