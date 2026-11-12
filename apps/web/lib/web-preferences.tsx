"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { DashboardI18n, Direction } from "@nama/dashboard-builder";
import type { Locale, ThemeMode } from "@nama/dashboard-types";

import { createWebI18n } from "./i18n";

export interface WebPreferences {
  locale: Locale;
  theme: ThemeMode;
  direction: Direction;
  i18n: DashboardI18n;
}

/** Route fallbacks and error states may render outside the shell. */
const FALLBACK: WebPreferences = {
  locale: "en",
  theme: "system",
  direction: "ltr",
  i18n: createWebI18n("en"),
};

const WebPreferencesContext = createContext<WebPreferences>(FALLBACK);

export function WebPreferencesProvider({
  value,
  children,
}: {
  value: WebPreferences;
  children: ReactNode;
}) {
  return (
    <WebPreferencesContext.Provider value={value}>
      {children}
    </WebPreferencesContext.Provider>
  );
}

export function useWebPreferences(): WebPreferences {
  return useContext(WebPreferencesContext);
}

export function useWebI18n(): DashboardI18n {
  return useContext(WebPreferencesContext).i18n;
}
