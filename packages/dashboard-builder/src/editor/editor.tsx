import type { ReactNode } from "react";
import { useStore } from "zustand";
import type { DataSourceSummary } from "@nama/dashboard-core";

import { joinClassNames } from "../classnames";
import { DashboardControls } from "../controls";
import { useDashboardRuntime } from "../context";
import { EditorCanvas } from "./canvas";
import { EditorDraftProvider, useEditorContext } from "./context";
import { WidgetPalette } from "./palette";
import { WidgetSettings } from "./settings";
import { DashboardToolbar } from "./toolbar";

export interface DashboardEditorProps {
  className?: string;
  /** Renders the draft without any editing affordances. */
  readOnly?: boolean;
  /** Sources offered to widget settings panels; the host owns the list. */
  dataSources?: readonly DataSourceSummary[];
  /** Host controls rendered inside the editor (for example version restore). */
  children?: ReactNode;
}

/**
 * Full editing experience for one draft. The host supplies the config and the
 * persistence callbacks on `DashboardProvider`; the SDK owns everything else.
 */
export function DashboardEditor({
  className,
  readOnly,
  dataSources,
  children,
}: DashboardEditorProps) {
  return (
    <EditorDraftProvider readOnly={readOnly ?? false}>
      <EditorLayout className={className} dataSources={dataSources}>
        {children}
      </EditorLayout>
    </EditorDraftProvider>
  );
}

function EditorLayout({
  className,
  dataSources,
  children,
}: {
  className?: string;
  dataSources?: readonly DataSourceSummary[];
  children?: ReactNode;
}) {
  const { store } = useEditorContext();
  const state = useStore(store);

  return (
    <div className={joinClassNames("nama-editor", className)}>
      <DashboardToolbar />
      <EditorMessages />
      {children ? <div className="nama-editor__extra">{children}</div> : null}
      <div
        className={joinClassNames(
          "nama-editor__body",
          state.preview ? "nama-editor__body--preview" : undefined,
        )}
      >
        {state.preview ? null : <WidgetPalette />}
        <div className="nama-editor__main">
          {state.preview ? <DashboardControls /> : null}
          <EditorCanvas />
        </div>
        {state.preview ? null : <WidgetSettings dataSources={dataSources} />}
      </div>
    </div>
  );
}

function EditorMessages() {
  const { store, readOnly } = useEditorContext();
  const state = useStore(store);
  const runtime = useDashboardRuntime();
  const translate = runtime.i18n.translate;
  const formatNumber = runtime.i18n.formatNumber;

  return (
    <div className="nama-editor__messages">
      {state.conflict ? (
        <div className="nama-notice nama-notice--warning" role="alert">
          <p>
            <strong>{translate("builder.conflict.title")}</strong>{" "}
            {translate("builder.conflict.body", {
              expected: formatNumber(state.conflict.expectedRevision),
              current: formatNumber(state.conflict.currentRevision),
            })}
          </p>
          <div className="nama-notice__actions">
            <button
              type="button"
              className="nama-button"
              onClick={() => store.getState().dismissConflict()}
            >
              {translate("builder.conflict.dismiss")}
            </button>
            <button
              type="button"
              className="nama-button nama-button--danger"
              onClick={() => store.getState().discardChanges()}
            >
              {translate("builder.conflict.discard")}
            </button>
          </div>
        </div>
      ) : null}

      {state.error ? (
        <div className="nama-notice nama-notice--error" role="alert">
          {translate(state.error.key, state.error.values)}
        </div>
      ) : null}

      {state.notice && !state.error && !state.conflict ? (
        <p className="nama-notice nama-notice--status" role="status">
          {translate(
            state.notice === "saved"
              ? "builder.notice.saved"
              : "builder.notice.published",
          )}
        </p>
      ) : null}

      {readOnly ? (
        <p className="nama-notice nama-notice--status" role="status">
          {translate("builder.notice.readOnly")}
        </p>
      ) : null}
    </div>
  );
}
