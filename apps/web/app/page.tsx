"use client";

import Link from "next/link";
import { PLATFORM_LIMITS, PLATFORM_NAME, SUPPORTED_LOCALES } from "@nama/dashboard-types";

import { AppShell } from "@/components/app-shell";
import { useWebI18n } from "@/lib/web-preferences";

export default function Home() {
  return (
    <AppShell>
      <HomeContent />
    </AppShell>
  );
}

function HomeContent() {
  const t = useWebI18n();

  return (
    <section className="app-card app-stack">
      <header>
        <p className="app-muted">{t.translate("web.home.tagline")}</p>
        <h1 className="app-title">{PLATFORM_NAME}</h1>
        <p className="app-subtitle">{t.translate("web.home.description")}</p>
      </header>
      <div className="app-row">
        <Link href="/login" className="app-button app-button--primary">
          {t.translate("web.common.signIn")}
        </Link>
        <Link href="/dashboards" className="app-button">
          {t.translate("web.common.openDashboards")}
        </Link>
      </div>
      <dl className="app-facts">
        <div>
          <dt>{t.translate("web.home.locales")}</dt>
          <dd>{SUPPORTED_LOCALES.join(", ")}</dd>
        </div>
        <div>
          <dt>{t.translate("web.home.maxWidgets")}</dt>
          <dd>{t.formatNumber(PLATFORM_LIMITS.maxWidgets)}</dd>
        </div>
        <div>
          <dt>{t.translate("web.home.queryTimeout")}</dt>
          <dd>
            {t.translate("web.home.seconds", {
              value: t.formatNumber(PLATFORM_LIMITS.queryTimeoutMs / 1000),
            })}
          </dd>
        </div>
      </dl>
    </section>
  );
}
