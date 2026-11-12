"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  DashboardControls,
  DashboardProvider,
  DashboardViewer,
} from "@nama/dashboard-builder";
import type { DashboardView, SessionPayload } from "@nama/api-client";

import { WorkspaceGate } from "@/components/workspace-gate";
import { apiClient, dataAdapter, realtimeAdapter } from "@/lib/api";
import { errorMessage } from "@/lib/error-message";
import { directionFor } from "@/lib/locale";
import { useWebI18n } from "@/lib/web-preferences";
import { WEB_WIDGETS } from "@/lib/widgets";

export function ViewerPageClient({ dashboardId }: { dashboardId: string }) {
  return (
    <WorkspaceGate>
      {(session) => (
        <ViewerLoader key={dashboardId} dashboardId={dashboardId} session={session} />
      )}
    </WorkspaceGate>
  );
}

function ViewerLoader({
  dashboardId,
  session,
}: {
  dashboardId: string;
  session: SessionPayload;
}) {
  const [view, setView] = useState<DashboardView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const t = useWebI18n();

  useEffect(() => {
    const controller = new AbortController();

    apiClient.getDashboard(dashboardId, { signal: controller.signal }).then(
      (result) => {
        if (!controller.signal.aborted) setView(result);
      },
      (failure: unknown) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(failure, t.translate("web.common.errorFallback")));
        }
      },
    );

    return () => controller.abort();
  }, [dashboardId, attempt, t]);

  if (error) {
    return (
      <div className="app-stack">
        <div className="app-notice app-notice--error" role="alert">
          {error}
        </div>
        <div className="app-row">
          <button
            type="button"
            className="app-button"
            onClick={() => {
              setView(null);
              setError(null);
              setAttempt((value) => value + 1);
            }}
          >
            {t.translate("web.common.tryAgain")}
          </button>
          <Link href="/dashboards" className="app-button">
            {t.translate("web.common.backToDashboards")}
          </Link>
        </div>
      </div>
    );
  }

  if (!view) {
    return <p className="app-muted">{t.translate("web.viewer.loading")}</p>;
  }

  const config = view.publishedConfig;
  const publishedRevision = view.publishedRevision ?? view.revision;

  if (!config) {
    return (
      <div className="app-stack">
        <header className="app-row app-row--between">
          <h1 className="app-title">{view.name}</h1>
          <Link href="/dashboards" className="app-button">
            {t.translate("web.common.back")}
          </Link>
        </header>
        <div className="app-notice" role="status">
          {t.translate("web.viewer.notPublished")}
        </div>
      </div>
    );
  }

  return (
    <div className="app-stack">
      <header className="app-row app-row--between">
        <div>
          <h1 className="app-title">{config.metadata.title}</h1>
          <p className="app-subtitle">
            {view.publishedAt
              ? t.translate("web.viewer.meta", {
                  revision: t.formatNumber(publishedRevision),
                  time: t.formatDate(view.publishedAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }),
                })
              : t.translate("web.viewer.meta.published", {
                  revision: t.formatNumber(publishedRevision),
                })}
          </p>
        </div>
        <Link href="/dashboards" className="app-button">
          {t.translate("web.common.back")}
        </Link>
      </header>

      <DashboardProvider
        config={config}
        revision={publishedRevision}
        dashboardId={dashboardId}
        locale={session.user.locale}
        direction={directionFor(session.user.locale)}
        theme={session.user.theme}
        timezone={session.user.timezone}
        dataAdapter={dataAdapter}
        realtimeAdapter={realtimeAdapter}
        widgets={WEB_WIDGETS}
      >
        <DashboardControls />
        <DashboardViewer />
      </DashboardProvider>
    </div>
  );
}
