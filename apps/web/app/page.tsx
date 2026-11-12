"use client";

import Link from "next/link";
import { PLATFORM_LIMITS, PLATFORM_NAME, SUPPORTED_LOCALES } from "@nama/dashboard-types";

import { AppShell } from "@/components/app-shell";

export default function Home() {
  return (
    <AppShell>
      <section className="app-card app-stack">
        <header>
          <p className="app-muted">walking skeleton</p>
          <h1 className="app-title">{PLATFORM_NAME}</h1>
          <p className="app-subtitle">
            Sign in, build a monitoring dashboard with a KPI and a line chart over HTTP
            polling, publish it and view the published configuration as a second user.
          </p>
        </header>
        <div className="app-row">
          <Link href="/login" className="app-button app-button--primary">
            Sign in
          </Link>
          <Link href="/dashboards" className="app-button">
            Open dashboards
          </Link>
        </div>
        <dl className="app-facts">
          <div>
            <dt>Locales</dt>
            <dd>{SUPPORTED_LOCALES.join(", ")}</dd>
          </div>
          <div>
            <dt>Max widgets</dt>
            <dd>{PLATFORM_LIMITS.maxWidgets}</dd>
          </div>
          <div>
            <dt>Query timeout</dt>
            <dd>{PLATFORM_LIMITS.queryTimeoutMs / 1000}s</dd>
          </div>
        </dl>
      </section>
    </AppShell>
  );
}
