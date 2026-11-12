import type { ThemeMode } from "@nama/dashboard-types";

/** Semantic tokens shared by SDK chrome, widget states and charts. */
export const THEME_TOKEN_VARS = Object.freeze({
  bg: "--nama-bg",
  surface: "--nama-surface",
  text: "--nama-text",
  muted: "--nama-muted",
  border: "--nama-border",
  accent: "--nama-accent",
  danger: "--nama-danger",
  warning: "--nama-warning",
  success: "--nama-success",
} as const);

export type ThemeToken = keyof typeof THEME_TOKEN_VARS;

export type ThemeTokens = Record<ThemeToken, string>;

export type ResolvedTheme = "light" | "dark";

/** Widgets receive `var(...)` references so charts follow theme changes. */
export function createThemeTokens(): ThemeTokens {
  return Object.fromEntries(
    Object.entries(THEME_TOKEN_VARS).map(([token, variable]) => [
      token,
      `var(${variable})`,
    ]),
  ) as ThemeTokens;
}

export function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): ResolvedTheme {
  if (mode === "system") return systemPrefersDark ? "dark" : "light";
  return mode;
}
