import { useState, type ReactNode } from "react";
import { useStore } from "zustand";
import {
  resolveWidgetConfig,
  type DataSourceSummary,
  type WidgetSettingsProps,
} from "@nama/dashboard-core";
import {
  issuesFromZod,
  type DashboardVariable,
  type DashboardWidget,
  type ValidationIssue,
  type WidgetInteraction,
  type WidgetVisibility,
} from "@nama/dashboard-types";

import { joinClassNames } from "../classnames";
import { useDashboardRuntime } from "../context";
import { TextField, ToggleField } from "../widgets/settings-controls";
import { useEditorContext } from "./context";
import { DashboardSettings } from "./dashboard-settings";

export interface WidgetSettingsPropsPanel {
  className?: string;
  /** Sources offered to widget settings panels; the SDK never fetches them. */
  dataSources?: readonly DataSourceSummary[];
}

/**
 * Settings for the selected widget. The draft is updated through editor
 * actions, so every change is undoable and unsaved until the host saves.
 */
export function WidgetSettings({
  className,
  dataSources = [],
}: WidgetSettingsPropsPanel) {
  const { store, readOnly } = useEditorContext();
  const state = useStore(store);
  const runtime = useDashboardRuntime();
  const translate = runtime.i18n.translate;
  const widget = state.config.widgets.find(
    (entry) => entry.id === state.selectedWidgetId,
  );
  const disabled = readOnly || state.preview;

  return (
    <aside className={joinClassNames("nama-panel", "nama-settings", className)}>
      <DashboardSettings disabled={disabled} />
      <h2 className="nama-panel__title">{translate("builder.settings.title")}</h2>
      {!widget ? (
        <p className="nama-panel__hint">{translate("builder.settings.none")}</p>
      ) : (
        <WidgetSettingsBody
          key={widget.id}
          widget={widget}
          disabled={disabled}
          dataSources={dataSources}
          variables={state.config.variables}
          onChangeTitle={(title) => store.getState().updateWidget(widget.id, { title })}
          onChangeConfig={(config) =>
            store.getState().updateWidget(widget.id, { config })
          }
          onChangeVisibility={(visibility) =>
            store.getState().updateWidget(widget.id, { visibility })
          }
          onChangeInteraction={(interaction) =>
            store.getState().updateWidget(widget.id, { interaction })
          }
          onRemove={() => store.getState().removeWidget(widget.id)}
          onMove={(dx, dy) => store.getState().moveWidget(widget.id, dx, dy)}
          onResize={(dw, dh) => store.getState().resizeWidget(widget.id, dw, dh)}
        />
      )}
    </aside>
  );
}

interface WidgetSettingsBodyProps {
  widget: DashboardWidget;
  disabled: boolean;
  dataSources: readonly DataSourceSummary[];
  variables: readonly DashboardVariable[];
  onChangeTitle: (title: string) => void;
  onChangeConfig: (config: unknown) => void;
  onChangeVisibility: (visibility: WidgetVisibility | undefined) => void;
  onChangeInteraction: (interaction: WidgetInteraction | undefined) => void;
  onRemove: () => void;
  onMove: (dx: number, dy: number) => void;
  onResize: (dw: number, dh: number) => void;
}

function WidgetSettingsBody({
  widget,
  disabled,
  dataSources,
  variables,
  onChangeTitle,
  onChangeConfig,
  onChangeVisibility,
  onChangeInteraction,
  onRemove,
  onMove,
  onResize,
}: WidgetSettingsBodyProps) {
  const runtime = useDashboardRuntime();
  const translate = runtime.i18n.translate;
  const plugin = runtime.registry.get(widget.type);
  const resolved = plugin ? resolveWidgetConfig(plugin, widget) : undefined;
  const Settings = plugin?.settings as unknown as
    ((props: WidgetSettingsProps<unknown>) => ReactNode) | undefined;
  // Invalid settings are reported here and never reach the draft.
  const [issues, setIssues] = useState<ValidationIssue[]>([]);

  const applyConfig = (next: unknown) => {
    if (!plugin) return;

    const parsed = plugin.configSchema.safeParse(next);
    if (!parsed.success) {
      setIssues(issuesFromZod(parsed.error));
      return;
    }

    setIssues([]);
    onChangeConfig(parsed.data);
  };

  return (
    <div className="nama-settings__body">
      <label className="nama-settings__field">
        <span>{translate("builder.settings.name")}</span>
        <input
          key={widget.title}
          className="nama-input"
          defaultValue={widget.title}
          maxLength={200}
          disabled={disabled}
          onBlur={(event) => {
            const next = event.currentTarget.value.trim();
            if (next.length === 0 || next === widget.title) {
              event.currentTarget.value = widget.title;
              return;
            }
            onChangeTitle(next);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              event.currentTarget.value = widget.title;
              event.currentTarget.blur();
            }
          }}
        />
      </label>

      {widget.dataSourceId ? (
        <p className="nama-settings__meta">
          {translate("builder.settings.dataSource")}: <code>{widget.dataSourceId}</code>
        </p>
      ) : null}

      {resolved?.status === "ready" && Settings ? (
        <div
          className="nama-settings__plugin"
          // The notice describes the last rejected commit; typing starts a fresh
          // attempt without clearing it on the Tab that caused the rejection.
          onInputCapture={() => setIssues([])}
        >
          <Settings
            widget={widget}
            config={resolved.config}
            onChange={applyConfig}
            dataSources={dataSources}
            disabled={disabled}
          />
        </div>
      ) : resolved?.status === "ready" ? (
        <p className="nama-panel__hint">{translate("builder.settings.noOptions")}</p>
      ) : null}

      {issues.length > 0 ? (
        <div className="nama-notice nama-notice--error" role="alert">
          <p>{translate("builder.settings.invalid")}</p>
          <ul className="nama-settings__issues">
            {issues.map((issue, index) => (
              <li key={`${issue.code}:${index}`}>
                {issue.path.length > 0 ? `${issue.path.join(".")}: ` : ""}
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="nama-settings__group">
        <p className="nama-settings__group-title">
          {translate("builder.settings.visibility")}
        </p>
        <ToggleField
          label={translate("builder.settings.visibilityEnabled")}
          checked={widget.visibility?.enabled !== false}
          disabled={disabled}
          onCommit={(visible) => {
            const condition = widget.visibility?.condition;
            onChangeVisibility(buildVisibility(visible, condition ?? undefined));
          }}
        />
        <TextField
          label={translate("builder.settings.visibilityCondition")}
          value={widget.visibility?.condition ?? ""}
          placeholder={translate("builder.settings.visibilityHint")}
          maxLength={500}
          disabled={disabled}
          onCommit={(condition) =>
            onChangeVisibility(
              buildVisibility(
                widget.visibility?.enabled !== false,
                condition || undefined,
              ),
            )
          }
        />
        <p className="nama-panel__hint">{translate("builder.settings.visibilityHint")}</p>
      </div>

      <label className="nama-settings__field">
        <span>{translate("builder.settings.interaction")}</span>
        <select
          className="nama-input"
          value={widget.interaction?.variable ?? ""}
          disabled={disabled}
          onChange={(event) => {
            const variable = event.currentTarget.value;
            onChangeInteraction(variable ? { variable } : undefined);
          }}
        >
          <option value="">{translate("builder.settings.interactionNone")}</option>
          {variables.map((variable) => (
            <option key={variable.id} value={variable.name}>
              {variable.name}
            </option>
          ))}
        </select>
      </label>
      <p className="nama-panel__hint">{translate("builder.settings.interactionHint")}</p>

      <div className="nama-settings__nudge" role="group">
        <NudgeButton
          label="builder.settings.moveLeft"
          symbol="←"
          disabled={disabled}
          onClick={() => onMove(-1, 0)}
        />
        <NudgeButton
          label="builder.settings.moveRight"
          symbol="→"
          disabled={disabled}
          onClick={() => onMove(1, 0)}
        />
        <NudgeButton
          label="builder.settings.moveUp"
          symbol="↑"
          disabled={disabled}
          onClick={() => onMove(0, -1)}
        />
        <NudgeButton
          label="builder.settings.moveDown"
          symbol="↓"
          disabled={disabled}
          onClick={() => onMove(0, 1)}
        />
        <NudgeButton
          label="builder.settings.narrower"
          symbol="−w"
          disabled={disabled}
          onClick={() => onResize(-1, 0)}
        />
        <NudgeButton
          label="builder.settings.wider"
          symbol="+w"
          disabled={disabled}
          onClick={() => onResize(1, 0)}
        />
        <NudgeButton
          label="builder.settings.shorter"
          symbol="−h"
          disabled={disabled}
          onClick={() => onResize(0, -1)}
        />
        <NudgeButton
          label="builder.settings.taller"
          symbol="+h"
          disabled={disabled}
          onClick={() => onResize(0, 1)}
        />
      </div>

      <button
        type="button"
        className="nama-button nama-button--danger"
        disabled={disabled}
        onClick={onRemove}
      >
        {translate("builder.settings.remove")}
      </button>
    </div>
  );
}

function buildVisibility(
  enabled: boolean,
  condition: string | undefined,
): WidgetVisibility | undefined {
  if (enabled && !condition) return undefined;
  return { enabled, ...(condition ? { condition } : {}) };
}

function NudgeButton({
  label,
  symbol,
  disabled,
  onClick,
}: {
  label: string;
  symbol: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const runtime = useDashboardRuntime();

  return (
    <button
      type="button"
      className="nama-button"
      aria-label={runtime.i18n.translate(label)}
      disabled={disabled}
      onClick={onClick}
    >
      {symbol}
    </button>
  );
}
