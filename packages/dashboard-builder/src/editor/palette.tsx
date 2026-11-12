import { useStore } from "zustand";
import { PLATFORM_LIMITS } from "@nama/dashboard-types";

import { joinClassNames } from "../classnames";
import { useDashboardRuntime } from "../context";
import { useEditorContext } from "./context";

/** Registered widget types; adding one places it on the active breakpoint. */
export function WidgetPalette({ className }: { className?: string }) {
  const { store, readOnly } = useEditorContext();
  const state = useStore(store);
  const runtime = useDashboardRuntime();
  const translate = runtime.i18n.translate;
  const manifests = runtime.registry.list();
  const disabled =
    readOnly ||
    state.preview ||
    state.config.widgets.length >= PLATFORM_LIMITS.maxWidgets;

  return (
    <aside className={joinClassNames("nama-panel", "nama-palette", className)}>
      <h2 className="nama-panel__title">{translate("builder.palette.title")}</h2>
      {manifests.length === 0 ? (
        <p className="nama-panel__hint">{translate("builder.palette.empty")}</p>
      ) : (
        <ul className="nama-palette__list">
          {manifests.map((manifest) => (
            <li key={manifest.id}>
              <button
                type="button"
                className="nama-button nama-palette__button"
                disabled={disabled}
                aria-label={translate("builder.palette.add", { name: manifest.name })}
                onClick={() => store.getState().addWidget(manifest.id)}
              >
                <span>{manifest.name}</span>
                <span className="nama-palette__type">{manifest.id}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
