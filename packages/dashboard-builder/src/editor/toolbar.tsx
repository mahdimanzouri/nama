import { useRef, useState } from "react";
import { useStore } from "zustand";
import {
  exportDashboardConfig,
  importDashboardConfig,
  type Breakpoint,
} from "@nama/dashboard-types";

import { joinClassNames } from "../classnames";
import { useDashboardRuntime } from "../context";
import { useEditorContext } from "./context";
import { isDirty } from "./store";

const BREAKPOINTS: readonly Breakpoint[] = ["desktop", "tablet", "mobile"];

const APPLICATION_VERSION = "@nama/dashboard-builder@0.0.0";

function fileNameFor(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return `${slug || "dashboard"}.nama.json`;
}

/** Title, history, breakpoint, preview and save/publish actions. */
export function DashboardToolbar({ className }: { className?: string }) {
  const { store, save, publish, canSave, canPublish, readOnly } = useEditorContext();
  const state = useStore(store);
  const runtime = useDashboardRuntime();
  const translate = runtime.i18n.translate;
  const formatDate = runtime.i18n.formatDate;
  const formatNumber = runtime.i18n.formatNumber;
  const dirty = isDirty(state);
  const pending = state.phase !== "idle";
  const interactive = !readOnly && !state.preview;
  const fileInput = useRef<HTMLInputElement>(null);
  const [importFailed, setImportFailed] = useState(false);

  const handleExport = () => {
    const envelope = exportDashboardConfig(state.config, {
      applicationVersion: APPLICATION_VERSION,
    });
    const blob = new Blob([JSON.stringify(envelope, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileNameFor(state.config.metadata.title);
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File) => {
    let payload: unknown;

    try {
      payload = JSON.parse(await file.text());
    } catch {
      setImportFailed(true);
      return;
    }

    const result = importDashboardConfig(payload);

    if (!result.ok) {
      setImportFailed(true);
      return;
    }

    if (!window.confirm(translate("builder.import.confirm"))) return;

    setImportFailed(false);
    store.getState().importConfig(result.value);
  };

  const statusParts = [
    translate("builder.status.revision", {
      revision: formatNumber(state.revision),
    }),
    dirty
      ? translate("builder.status.unsaved")
      : state.updatedAt
        ? translate("builder.status.savedAt", { time: formatDate(state.updatedAt) })
        : null,
    state.publishedAt
      ? translate("builder.status.publishedAt", { time: formatDate(state.publishedAt) })
      : translate("builder.status.neverPublished"),
  ].filter((part): part is string => part !== null);

  return (
    <header className={joinClassNames("nama-toolbar", className)}>
      <div className="nama-toolbar__meta">
        <TextField
          label={translate("builder.toolbar.title")}
          value={state.config.metadata.title}
          disabled={!interactive}
          onCommit={(title) => store.getState().updateMetadata({ title })}
        />
        <p className="nama-toolbar__status">
          {statusParts.map((part, index) => (
            <span key={part}>
              {index > 0 ? " · " : null}
              {part}
            </span>
          ))}
        </p>
      </div>

      <div className="nama-toolbar__actions">
        <div className="nama-toolbar__group" role="group">
          <button
            type="button"
            className="nama-button"
            disabled={!interactive || state.history.length === 0}
            onClick={() => store.getState().undo()}
          >
            {translate("builder.toolbar.undo")}
          </button>
          <button
            type="button"
            className="nama-button"
            disabled={!interactive || state.future.length === 0}
            onClick={() => store.getState().redo()}
          >
            {translate("builder.toolbar.redo")}
          </button>
        </div>

        <div className="nama-toolbar__group" role="group">
          <button type="button" className="nama-button" onClick={handleExport}>
            {translate("builder.toolbar.export")}
          </button>
          <button
            type="button"
            className="nama-button"
            disabled={!interactive}
            onClick={() => fileInput.current?.click()}
          >
            {translate("builder.toolbar.import")}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void handleImport(file);
            }}
          />
        </div>

        <div className="nama-toolbar__group" role="group">
          {BREAKPOINTS.map((breakpoint) => (
            <button
              key={breakpoint}
              type="button"
              className="nama-button"
              aria-pressed={state.breakpoint === breakpoint}
              disabled={readOnly}
              onClick={() => store.getState().setBreakpoint(breakpoint)}
            >
              {translate(`builder.toolbar.breakpoint.${breakpoint}`)}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="nama-button"
          aria-pressed={state.preview}
          disabled={readOnly}
          onClick={() => store.getState().setPreview(!state.preview)}
        >
          {state.preview
            ? translate("builder.toolbar.exitPreview")
            : translate("builder.toolbar.preview")}
        </button>

        {canSave ? (
          <button
            type="button"
            className="nama-button"
            disabled={!dirty || pending || readOnly}
            onClick={() => void save()}
          >
            {state.phase === "saving"
              ? translate("builder.status.saving")
              : translate("builder.toolbar.save")}
          </button>
        ) : null}

        {canPublish ? (
          <button
            type="button"
            className="nama-button nama-button--primary"
            disabled={pending || readOnly}
            onClick={() => void publish()}
          >
            {state.phase === "publishing"
              ? translate("builder.status.publishing")
              : translate("builder.toolbar.publish")}
          </button>
        ) : null}
      </div>

      {importFailed ? (
        <div className="nama-notice nama-notice--error" role="alert">
          {translate("builder.import.error")}
        </div>
      ) : null}
    </header>
  );
}

/**
 * Commits on blur so one edit is one history entry. The `key` resets the
 * uncontrolled input when the value changes from outside (undo, restore).
 */
function TextField({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onCommit: (next: string) => void;
}) {
  return (
    <input
      key={value}
      className="nama-input nama-toolbar__title"
      aria-label={label}
      defaultValue={value}
      maxLength={200}
      disabled={disabled}
      onBlur={(event) => {
        const next = event.currentTarget.value.trim();
        if (next.length === 0 || next === value) {
          event.currentTarget.value = value;
          return;
        }
        onCommit(next);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.currentTarget.value = value;
          event.currentTarget.blur();
        }
      }}
    />
  );
}
