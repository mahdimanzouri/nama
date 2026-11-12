"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import type { SessionPayload } from "@nama/api-client";
import { PLATFORM_NAME, type ThemeMode } from "@nama/dashboard-types";

import { apiClient } from "@/lib/api";
import { directionFor } from "@/lib/locale";
import { useSystemPrefersDark } from "@/lib/use-color-scheme";

export interface AppShellProps {
  session?: SessionPayload;
  children: ReactNode;
}

/**
 * Web chrome around the SDK. It reuses the builder's semantic tokens so the
 * header and the canvas share one theme; the canvas itself stays LTR.
 */
export function AppShell({ session, children }: AppShellProps) {
  const router = useRouter();
  const prefersDark = useSystemPrefersDark();
  const mode: ThemeMode = session?.user.theme ?? "system";
  const locale = session?.user.locale ?? "en";
  const direction = directionFor(locale);
  const resolved = mode === "system" ? (prefersDark ? "dark" : "light") : mode;

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
  }, [locale, direction]);

  async function handleSignOut() {
    try {
      await apiClient.logout();
    } catch {
      // The login page is still reachable when the API is down.
    }
    router.replace("/login");
  }

  return (
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
          <nav className="app-row" aria-label="Primary">
            <Link href="/dashboards" className="app-link">
              Dashboards
            </Link>
          </nav>
        ) : null}
        <span className="app-header__spacer" />
        {session ? (
          <>
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
              Sign out
            </button>
          </>
        ) : null}
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
