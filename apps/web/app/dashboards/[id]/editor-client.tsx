"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useStore } from "zustand";
import {
  RevisionConflictError,
  type DashboardDraft,
  type DashboardView,
  type SessionPayload,
} from "@nama/api-client";
import { DashboardCanvas, DashboardProvider } from "@nama/dashboard-builder";
import { PLATFORM_LIMITS, parseDashboardConfig } from "@nama/dashboard-types";

import { WorkspaceGate } from "@/components/workspace-gate";
import { apiClient, dataAdapter } from "@/lib/api";
import { desktopItemFor } from "@/lib/dashboard-config";
import { createEditorStore, isDirty, type EditorStoreApi } from "@/lib/editor-store";
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
  const [store] = useState(() =>
    createEditorStore({
      config: initialDraft.config,
      revision: initialDraft.revision,
      updatedAt: initialDraft.updatedAt,
      publishedAt: initialView.publishedAt,
      publishedConfig: initialView.publishedConfig,
    }),
  );
  const state = useStore(store);
  const dirty = isDirty(state);
  const pending = state.phase !== "idle";
  const canPublish = session.permissions.includes("dashboard.publish");
  const canEdit = session.permissions.includes("dashboard.update");

  async function handleSave(): Promise<{ revision: number; updatedAt: string } | null> {
    const snapshot = store.getState();
    if (snapshot.phase !== "idle" || !isDirty(snapshot)) return null;

    const validation = parseDashboardConfig(snapshot.config);
    if (!validation.ok) {
      store
        .getState()
        .failed(
          validation.issues
            .map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`)
            .join("; "),
        );
      return null;
    }

    store.getState().beginWork("saving");

    try {
      const result = await apiClient.saveDashboardDraft(
        dashboardId,
        snapshot.config,
        snapshot.revision,
      );
      store.getState().saved(snapshot.config, result.revision, result.updatedAt);
      return result;
    } catch (failure) {
      if (failure instanceof RevisionConflictError) {
        store.getState().conflicted(failure.currentRevision);
      } else {
        store.getState().failed(errorMessage(failure));
      }
      return null;
    }
  }

  async function handlePublish(): Promise<void> {
    const snapshot = store.getState();
    if (snapshot.phase !== "idle") return;

    let revision = snapshot.revision;

    if (isDirty(snapshot)) {
      const saved = await handleSave();
      if (!saved) return;
      revision = saved.revision;
    }

    store.getState().beginWork("publishing");

    try {
      const view = await apiClient.publishDashboard(dashboardId, revision);
      store.getState().published(view);
    } catch (failure) {
      if (failure instanceof RevisionConflictError) {
        store.getState().conflicted(failure.currentRevision);
      } else {
        store.getState().failed(errorMessage(failure));
      }
    }
  }

  async function handleReload(): Promise<void> {
    try {
      const [draft, view] = await Promise.all([
        apiClient.getDashboardDraft(dashboardId),
        apiClient.getDashboard(dashboardId),
      ]);
      store.getState().reloaded({
        config: draft.config,
        revision: draft.revision,
        updatedAt: draft.updatedAt,
        publishedAt: view.publishedAt,
        publishedConfig: view.publishedConfig,
      });
    } catch (failure) {
      store.getState().failed(errorMessage(failure));
    }
  }

  return (
    <div className="app-stack">
      <header className="app-row app-row--between">
        <div>
          <h1 className="app-title">{state.config.metadata.title}</h1>
          <p className="app-subtitle">
            Revision {state.revision} ·{" "}
            {dirty
              ? "unsaved changes"
              : `saved ${new Date(state.updatedAt).toLocaleString()}`}{" "}
            ·{" "}
            {state.publishedAt
              ? `published ${new Date(state.publishedAt).toLocaleString()}`
              : "never published"}
          </p>
        </div>
        <div className="app-row">
          <Link href="/dashboards" className="app-button">
            Back
          </Link>
          <button
            type="button"
            className="app-button"
            disabled={!dirty || pending}
            onClick={() => void handleSave()}
          >
            {state.phase === "saving" ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            className="app-button app-button--primary"
            disabled={pending || !canPublish}
            onClick={() => void handlePublish()}
          >
            {state.phase === "publishing" ? "Publishing…" : "Publish"}
          </button>
          {state.publishedAt ? (
            <Link href={`/dashboards/${dashboardId}/view`} className="app-button">
              Open published view
            </Link>
          ) : null}
        </div>
      </header>

      {state.conflictRevision !== null ? (
        <div className="app-notice" role="alert">
          <p>
            <strong>This dashboard changed elsewhere.</strong> The server is at revision{" "}
            {state.conflictRevision}, while this editor is based on revision{" "}
            {state.revision}. Reload the latest draft before saving again; local changes
            are not saved.
          </p>
          <div className="app-row">
            <button
              type="button"
              className="app-button app-button--primary"
              onClick={() => void handleReload()}
            >
              Reload latest draft
            </button>
            <button
              type="button"
              className="app-button"
              onClick={() => store.getState().dismissConflict()}
            >
              Keep editing
            </button>
          </div>
        </div>
      ) : null}

      {state.error ? (
        <div className="app-notice app-notice--error" role="alert">
          {state.error}
        </div>
      ) : null}

      {state.notice && state.error === null && state.conflictRevision === null ? (
        <p className="app-muted" role="status">
          {state.notice}
        </p>
      ) : null}

      {!canEdit ? (
        <div className="app-notice" role="status">
          Your role can read this dashboard but cannot save edits.
        </div>
      ) : null}

      <div className="app-editor">
        <aside className="app-card app-stack">
          <div>
            <h2 className="app-section-title">Widgets</h2>
            <p className="app-muted">
              Drag and drop arrives in M4; use these controls for now. Positions are
              stored on the desktop layout, and narrower breakpoints inherit them.
            </p>
          </div>
          <div className="app-row">
            <button
              type="button"
              className="app-button"
              disabled={
                !canEdit || state.config.widgets.length >= PLATFORM_LIMITS.maxWidgets
              }
              onClick={() => store.getState().addWidget("kpi")}
            >
              Add KPI
            </button>
            <button
              type="button"
              className="app-button"
              disabled={
                !canEdit || state.config.widgets.length >= PLATFORM_LIMITS.maxWidgets
              }
              onClick={() => store.getState().addWidget("line")}
            >
              Add line chart
            </button>
          </div>
          {state.config.widgets.length === 0 ? (
            <p className="app-muted">No widgets yet.</p>
          ) : (
            <ul className="app-list">
              {state.config.widgets.map((widget) => {
                const item = desktopItemFor(state.config, widget.id);

                return (
                  <li key={widget.id} className="app-widget-card">
                    <span className="app-widget-card__title">{widget.title}</span>
                    <span className="app-widget-card__meta">
                      {widget.type} ·{" "}
                      {item
                        ? `x ${item.x} · y ${item.y} · ${item.w}×${item.h}`
                        : "not placed"}
                    </span>
                    <WidgetControls
                      store={store}
                      widgetId={widget.id}
                      title={widget.title}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className="app-card app-stack" aria-label="Draft preview">
          <h2 className="app-section-title">Draft preview</h2>
          {state.config.widgets.length === 0 ? (
            <p className="app-muted">Add a widget to see it here.</p>
          ) : (
            <DashboardProvider
              config={state.config}
              revision={state.revision}
              dashboardId={dashboardId}
              locale={session.user.locale}
              direction={directionFor(session.user.locale)}
              theme={session.user.theme}
              timezone={session.user.timezone}
              dataAdapter={dataAdapter}
              widgets={WEB_WIDGETS}
            >
              <DashboardCanvas />
            </DashboardProvider>
          )}
        </section>
      </div>
    </div>
  );
}

function WidgetControls({
  store,
  widgetId,
  title,
}: {
  store: EditorStoreApi;
  widgetId: string;
  title: string;
}) {
  return (
    <div className="app-widget-card__controls">
      <button
        type="button"
        className="app-button"
        aria-label={`Move ${title} left`}
        onClick={() => store.getState().moveWidget(widgetId, -1, 0)}
      >
        ←
      </button>
      <button
        type="button"
        className="app-button"
        aria-label={`Move ${title} right`}
        onClick={() => store.getState().moveWidget(widgetId, 1, 0)}
      >
        →
      </button>
      <button
        type="button"
        className="app-button"
        aria-label={`Move ${title} up`}
        onClick={() => store.getState().moveWidget(widgetId, 0, -1)}
      >
        ↑
      </button>
      <button
        type="button"
        className="app-button"
        aria-label={`Move ${title} down`}
        onClick={() => store.getState().moveWidget(widgetId, 0, 1)}
      >
        ↓
      </button>
      <button
        type="button"
        className="app-button"
        aria-label={`Make ${title} narrower`}
        onClick={() => store.getState().resizeWidget(widgetId, -1, 0)}
      >
        −
      </button>
      <button
        type="button"
        className="app-button"
        aria-label={`Make ${title} wider`}
        onClick={() => store.getState().resizeWidget(widgetId, 1, 0)}
      >
        +
      </button>
      <button
        type="button"
        className="app-button"
        aria-label={`Make ${title} shorter`}
        onClick={() => store.getState().resizeWidget(widgetId, 0, -1)}
      >
        ↕−
      </button>
      <button
        type="button"
        className="app-button"
        aria-label={`Make ${title} taller`}
        onClick={() => store.getState().resizeWidget(widgetId, 0, 1)}
      >
        ↕+
      </button>
      <button
        type="button"
        className="app-button app-button--danger"
        aria-label={`Remove ${title}`}
        onClick={() => store.getState().removeWidget(widgetId)}
      >
        Remove
      </button>
    </div>
  );
}
