"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { SessionPayload, SessionUser } from "@nama/api-client";
import {
  PLATFORM_NAME,
  SUPPORTED_LOCALES,
  type Locale,
  type ThemeMode,
} from "@nama/dashboard-types";

import { apiClient } from "@/lib/api";
import { createWebI18n } from "@/lib/i18n";
import { directionFor } from "@/lib/locale";
import { useSystemPrefersDark } from "@/lib/use-color-scheme";
import { WebPreferencesProvider } from "@/lib/web-preferences";

export type PreferencePatch = Partial<Pick<SessionUser, "locale" | "theme">>;

export interface AppShellProps {
  session?: SessionPayload;
  /** Called after the server accepted a preference change. */
  onPreferencesChange?: (patch: PreferencePatch) => void;
  children: ReactNode;
}

const LOCALE_STORAGE_KEY = "nama.locale";

const LOCALE_LABELS: Record<Locale, string> = { en: "English", fa: "فارسی" };

const THEME_OPTIONS: readonly { value: ThemeMode; labelKey: string }[] = [
  { value: "light", labelKey: "web.theme.light" },
  { value: "dark", labelKey: "web.theme.dark" },
  { value: "system", labelKey: "web.theme.system" },
];

/**
 * Signed-out visitors have no user record yet, so the last language choice is
 * kept locally; the server preference wins once a session exists.
 */
function readStoredLocale(): Locale | undefined {
  try {
    const value = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return value === "en" || value === "fa" ? value : undefined;
  } catch {
    return undefined;
  }
}

const localeListeners = new Set<() => void>();

function subscribeStoredLocale(listener: () => void): () => void {
  localeListeners.add(listener);
  return () => {
    localeListeners.delete(listener);
  };
}

function writeStoredLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Private browsing may reject storage; the in-memory choice still applies.
  }
  for (const listener of localeListeners) listener();
}

const noStoredLocale = (): Locale | undefined => undefined;

/**
 * Web chrome around the SDK. It reuses the builder's semantic tokens so the
 * header and the canvas share one theme; the canvas itself stays LTR.
 */
export function AppShell({ session, onPreferencesChange, children }: AppShellProps) {
  const router = useRouter();
  const prefersDark = useSystemPrefersDark();
  const [override, setOverride] = useState<PreferencePatch>({});
  const storedLocale = useSyncExternalStore(
    subscribeStoredLocale,
    readStoredLocale,
    noStoredLocale,
  );

  const locale: Locale = override.locale ?? session?.user.locale ?? storedLocale ?? "en";
  const mode: ThemeMode = override.theme ?? session?.user.theme ?? "system";
  const direction = directionFor(locale);
  const resolved = mode === "system" ? (prefersDark ? "dark" : "light") : mode;
  const i18n = useMemo(
    () => createWebI18n(locale, session?.user.timezone),
    [locale, session?.user.timezone],
  );
  const preferences = useMemo(
    () => ({ locale, theme: mode, direction, i18n }),
    [locale, mode, direction, i18n],
  );

  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = direction;
    root.dataset.theme = resolved;
  }, [locale, direction, resolved]);

  async function persist(patch: PreferencePatch): Promise<void> {
    setOverride((previous) => ({ ...previous, ...patch }));

    if (patch.locale !== undefined) writeStoredLocale(patch.locale);

    if (!session) return;

    try {
      await apiClient.updatePreferences(patch);
      onPreferencesChange?.(patch);
    } catch {
      setOverride((previous) => {
        const next = { ...previous };
        if (patch.locale !== undefined) delete next.locale;
        if (patch.theme !== undefined) delete next.theme;
        return next;
      });
    }
  }

  async function handleSignOut() {
    try {
      await apiClient.logout();
    } catch {
      // The login page is still reachable when the API is down.
    }
    router.replace("/login");
  }

  const t = i18n.translate;

  return (
    <WebPreferencesProvider value={preferences}>
      <div
        className="nama-root app-shell"
        data-theme={resolved}
        lang={locale}
        dir={direction}
      >
        <header className="app-header">
          <Link href="/" className="app-header__brand">
            {PLATFORM_NAME}
          </Link>
          {session ? (
            <nav className="app-row" aria-label={t("web.common.primaryNav")}>
              <Link href="/dashboards" className="app-link">
                {t("web.common.dashboards")}
              </Link>
            </nav>
          ) : null}
          <span className="app-header__spacer" />
          <label className="app-header__select">
            <span>{t("web.common.language")}</span>
            <select
              className="app-input"
              value={locale}
              onChange={(event) =>
                void persist({ locale: event.currentTarget.value as Locale })
              }
            >
              {SUPPORTED_LOCALES.map((option) => (
                <option key={option} value={option}>
                  {LOCALE_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
          {session ? (
            <>
              <label className="app-header__select">
                <span>{t("web.common.theme")}</span>
                <select
                  className="app-input"
                  value={mode}
                  onChange={(event) =>
                    void persist({ theme: event.currentTarget.value as ThemeMode })
                  }
                >
                  {THEME_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="app-header__meta">
                <span>{session.organization.name}</span>
                <span>
                  {session.user.displayName} · {session.role}
                </span>
              </div>
              <button
                type="button"
                className="app-button"
                onClick={() => void handleSignOut()}
              >
                {t("web.common.signOut")}
              </button>
            </>
          ) : null}
        </header>
        <main className="app-main">{children}</main>
      </div>
    </WebPreferencesProvider>
  );
}
