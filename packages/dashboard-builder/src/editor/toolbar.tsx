import { useStore } from "zustand";
import type { Breakpoint } from "@nama/dashboard-types";

import { joinClassNames } from "../classnames";
import { useDashboardRuntime } from "../context";
import { useEditorContext } from "./context";
import { isDirty } from "./store";

const BREAKPOINTS: readonly Breakpoint[] = ["desktop", "tablet", "mobile"];

/** Title, history, breakpoint, preview and save/publish actions. */
export function DashboardToolbar({ className }: { className?: string }) {
  const { store, save, publish, canSave, canPublish, readOnly } = useEditorContext();
  const state = useStore(store);
  const runtime = useDashboardRuntime();
  const translate = runtime.i18n.translate;
  const formatDate = runtime.i18n.formatDate;
  const dirty = isDirty(state);
  const pending = state.phase !== "idle";
  const interactive = !readOnly && !state.preview;

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
          <span>
            {translate("builder.status.revision", { revision: state.revision })}
          </span>
          {" · "}
          <span>
            {dirty
              ? translate("builder.status.unsaved")
              : state.updatedAt
                ? translate("builder.status.savedAt", {
                    time: formatDate(state.updatedAt),
                  })
                : null}
          </span>
          {" · "}
          <span>
            {state.publishedAt
              ? translate("builder.status.publishedAt", {
                  time: formatDate(state.publishedAt),
                })
              : translate("builder.status.neverPublished")}
          </span>
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
