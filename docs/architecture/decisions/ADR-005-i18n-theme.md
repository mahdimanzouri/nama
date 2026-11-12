# ADR-005: Internationalization and Theming Strategy

## Status

Accepted

## Date

2026-11-12

**Deciders:** Architecture (M0)

## Context

The product must support English and Persian, LTR and RTL layouts, and light,
dark and system themes. The SDK must be usable outside Next.js and must not
depend on `next-intl`. React Grid Layout provides no RTL support, so the canvas
cannot mirror like the rest of the chrome.

## Decision

1. The SDK defines an independent `DashboardI18n` interface:

   ```ts
   interface DashboardI18n {
     locale: string;
     direction: "ltr" | "rtl";
     translate(key: string, values?: Record<string, unknown>): string;
   }
   ```

   The host injects an implementation. The web app uses `next-intl`; the SDK
   never imports it.
2. Message resolution order: host overrides → SDK built-in messages → English.
   A missing key renders its identifier and logs a development warning; it never
   throws.
3. Direction applies to all chrome, text, forms, menus, toolbars, sidebars and
   charts. **The dashboard canvas is LTR-only in v1**; this limitation is
   disclosed in the editor UI and in documentation, and is not disguised as
   RTL support.
4. Locale-aware number, date and time formatting is provided by injected
   formatters. Persian digits are accepted in numeric and date inputs and
   normalized before validation.
5. Timestamps are stored in UTC. Display timezone precedence is user preference
   → dashboard setting → organization default. Persian calendar display
   (`fa-IR-u-ca-persian`) is a presentation concern; storage remains UTC.
6. Themes use semantic CSS variables and design tokens, with modes `light`,
   `dark`, `system`. ECharts themes consume the same tokens. Theme switching
   must not remount widgets.
7. Application preference and dashboard-specific theme preference have an
   explicit precedence documented in the SDK API; language and theme are
   independent settings.
8. Use logical CSS properties and avoid hardcoded left/right positioning.
   Drag/resize handles are verified in LTR only, matching the canvas decision.

## Consequences

- The SDK is portable and testable without Next.js.
- Consumers must supply translations and formatters, or accept English defaults.
- The product has a visible, documented RTL limitation on the canvas; support
  requests must be answered consistently.
- Chart libraries need explicit RTL handling for labels, tooltips and axes.
- A future RTL canvas requires an ADR amendment and likely a different grid
  engine or a wrapper that mirrors coordinates.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Import `next-intl` in the SDK | Breaks framework independence |
| Hardcoded English strings | Fails the Persian requirement |
| Separate SDK builds per locale/direction | Duplicate bundles, version skew |
| Mirror the canvas with CSS transforms | Breaks drag math and accessibility; not a real solution |
| Global theme state without tokens | ECharts and third-party UI drift |

## Related documents

- [../i18n-theme.md](../i18n-theme.md)
- [../sdk-api.md](../sdk-api.md)
- [../overview.md](../overview.md)

## Review trigger

A third locale is requested, RTL canvas support is required, or a theme mode
beyond light/dark/system is introduced.
