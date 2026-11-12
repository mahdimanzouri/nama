# Internationalization and Themes

**Status:** Proposed (M0)

## Locales and directions

| Locale | Direction | Notes |
| --- | --- | --- |
| `en` | `ltr` | Default development locale |
| `fa` | `rtl` | Persian; Persian digits accepted and normalized |

Locale and direction are explicit props on `DashboardProvider`. The web app uses
`next-intl` for routing and app messages; the SDK uses the injected
`DashboardI18n` interface and never imports `next-intl`.

## SDK i18n interface

```ts
interface DashboardI18n {
  locale: string;
  direction: "ltr" | "rtl";
  translate(key: string, values?: Record<string, unknown>): string;
}
```

Resolution order:

1. Host-provided overrides (`messages` prop)
2. SDK built-in messages
3. English

A missing key renders the key itself and logs a development warning. It never
throws.

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
- Display formatting uses `Intl.NumberFormat(locale)`; persisted values remain
  canonical numbers/strings.
- Currency and percent formatting are widget configuration, not global state.

## Dates, times and calendar

- Storage is UTC ISO-8601.
- Display timezone precedence: user preference → dashboard setting → organization
  default.
- Persian calendar display uses an injected formatter, e.g.
  `Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone })`.
- Inputs accept both Jalali entry (via the formatter/parser) and ISO input; both
  normalize to ISO before validation.
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

## Related documents

- [decisions/ADR-005-i18n-theme.md](decisions/ADR-005-i18n-theme.md)
- [sdk-api.md](sdk-api.md)
- [dashboard-schema.md](dashboard-schema.md)
