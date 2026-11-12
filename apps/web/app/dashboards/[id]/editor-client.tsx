"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  DashboardDraft,
  DashboardVersionSummary,
  DashboardView,
  SessionPayload,
} from "@nama/api-client";
import {
  DashboardEditor,
  DashboardProvider,
  useDashboardEditor,
} from "@nama/dashboard-builder";

import { WorkspaceGate } from "@/components/workspace-gate";
import { apiClient, dataAdapter } from "@/lib/api";
import { errorMessage } from "@/lib/error-message";
import { directionFor } from "@/lib/locale";
import { WEB_WIDGETS } from "@/lib/widgets";

export function EditorPageClient({ dashboardId }: { dashboardId: string }) {
  return (
    <WorkspaceGate>
      {(session) => (
        <EditorLoader key={dashboardId} dashboardId={dashboardId} session={session} />
      )}
    </WorkspaceGate>
  );
}

function EditorLoader({
  dashboardId,
  session,
}: {
  dashboardId: string;
  session: SessionPayload;
}) {
  const [data, setData] = useState<{ draft: DashboardDraft; view: DashboardView } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      apiClient.getDashboardDraft(dashboardId, { signal: controller.signal }),
      apiClient.getDashboard(dashboardId, { signal: controller.signal }),
    ]).then(
      ([draft, view]) => {
        if (!controller.signal.aborted) setData({ draft, view });
      },
      (failure: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(failure));
      },
    );

    return () => controller.abort();
  }, [dashboardId, attempt]);

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
              setData(null);
              setError(null);
              setAttempt((value) => value + 1);
            }}
          >
            Try again
          </button>
          <Link href="/dashboards" className="app-button">
            Back to dashboards
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return <p className="app-muted">Loading the draft…</p>;

  return (
    <EditorWorkspace
      dashboardId={dashboardId}
      session={session}
      initialDraft={data.draft}
      initialView={data.view}
    />
  );
}

function EditorWorkspace({
  dashboardId,
  session,
  initialDraft,
  initialView,
}: {
  dashboardId: string;
  session: SessionPayload;
  initialDraft: DashboardDraft;
  initialView: DashboardView;
}) {
  const canEdit = session.permissions.includes("dashboard.update");
  const canPublish = session.permissions.includes("dashboard.publish");

  return (
    <div className="app-stack">
      <header className="app-row app-row--between">
        <Link href="/dashboards" className="app-button">
          Back to dashboards
        </Link>
        {initialView.publishedAt ? (
          <Link href={`/dashboards/${dashboardId}/view`} className="app-button">
            Open published view
          </Link>
        ) : null}
      </header>

      {!canEdit ? (
        <div className="app-notice" role="status">
          Your role can read this dashboard but cannot save edits.
        </div>
      ) : null}

      <DashboardProvider
        config={initialDraft.config}
        revision={initialDraft.revision}
        publishedAt={initialView.publishedAt}
        publishedRevision={initialView.publishedRevision}
        dashboardId={dashboardId}
        locale={session.user.locale}
        direction={directionFor(session.user.locale)}
        theme={session.user.theme}
        timezone={session.user.timezone}
        dataAdapter={dataAdapter}
        widgets={WEB_WIDGETS}
        onSave={
          canEdit
            ? async (config, { revision }) => {
                const result = await apiClient.saveDashboardDraft(
                  dashboardId,
                  config,
                  revision,
                );
                return { revision: result.revision, updatedAt: result.updatedAt };
              }
            : undefined
        }
        onPublish={
          canPublish
            ? async ({ revision }) => {
                const view = await apiClient.publishDashboard(dashboardId, revision);
                return {
                  revision: view.revision,
                  publishedRevision: view.publishedRevision ?? view.revision,
                  ...(view.publishedAt ? { publishedAt: view.publishedAt } : {}),
                };
              }
            : undefined
        }
      >
        <DashboardEditor readOnly={!canEdit}>
          <ConflictRecovery dashboardId={dashboardId} />
          <VersionHistory dashboardId={dashboardId} canEdit={canEdit} />
        </DashboardEditor>
      </DashboardProvider>
    </div>
  );
}

function ConflictRecovery({ dashboardId }: { dashboardId: string }) {
  const editor = useDashboardEditor();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editor.conflict) return null;

  async function reload(): Promise<void> {
    setBusy(true);
    setError(null);

    try {
      const [draft, view] = await Promise.all([
        apiClient.getDashboardDraft(dashboardId),
        apiClient.getDashboard(dashboardId),
      ]);
      editor.replaceDraft({
        config: draft.config,
        revision: draft.revision,
        updatedAt: draft.updatedAt,
        publishedAt: view.publishedAt,
        publishedRevision: view.publishedRevision,
      });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-notice" role="status">
      <p>
        The server is at revision {editor.conflict.currentRevision}. Reloading fetches
        that draft and replaces the local changes in this tab.
      </p>
      <div className="app-row">
        <button
          type="button"
          className="app-button"
          disabled={busy}
          onClick={() => void reload()}
        >
          {busy ? "Reloading…" : "Reload latest draft"}
        </button>
      </div>
      {error ? (
        <p className="app-notice app-notice--error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function VersionHistory({
  dashboardId,
  canEdit,
}: {
  dashboardId: string;
  canEdit: boolean;
}) {
  const editor = useDashboardEditor();
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<DashboardVersionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();

    apiClient.listDashboardVersions(dashboardId, { pageSize: 20 }).then(
      (result) => {
        if (!controller.signal.aborted) setVersions(result.items);
      },
      (failure: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(failure));
      },
    );

    return () => controller.abort();
  }, [dashboardId, open]);

  async function restore(version: DashboardVersionSummary): Promise<void> {
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const draft = await apiClient.restoreDashboardVersion(
        dashboardId,
        version.id,
        editor.revision,
      );
      editor.replaceDraft({
        config: draft.config,
        revision: draft.revision,
        updatedAt: draft.updatedAt,
        publishedAt: editor.publishedAt,
        publishedRevision: editor.publishedRevision,
      });
      setNotice(`Restored revision ${version.revision} into the draft.`);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="app-card app-stack" aria-label="Version history">
      <div className="app-row app-row--between">
        <h2 className="app-section-title">Version history</h2>
        <button
          type="button"
          className="app-button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide versions" : "Show versions"}
        </button>
      </div>

      {open ? (
        versions === null ? (
          <p className="app-muted">Loading versions…</p>
        ) : versions.length === 0 ? (
          <p className="app-muted">This dashboard has not been published yet.</p>
        ) : (
          <ul className="app-list">
            {versions.map((version) => (
              <li key={version.id} className="app-widget-card">
                <span className="app-widget-card__title">
                  Revision {version.revision} · {version.title}
                </span>
                <span className="app-widget-card__meta">
                  {new Date(version.createdAt).toLocaleString()}
                </span>
                <button
                  type="button"
                  className="app-button"
                  disabled={!canEdit || busy}
                  onClick={() => void restore(version)}
                >
                  Restore into draft
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {notice ? (
        <p className="app-muted" role="status">
          {notice}
        </p>
      ) : null}

      {error ? (
        <div className="app-notice app-notice--error" role="alert">
          {error}
        </div>
      ) : null}
    </section>
  );
}
