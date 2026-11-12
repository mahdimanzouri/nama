import {
  forwardRef,
  useMemo,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
} from "react";
import { useStore } from "zustand";
import {
  GridLayout,
  noCompactor,
  useContainerWidth,
  type Layout,
} from "react-grid-layout";
import { PLATFORM_LIMITS, type DashboardWidget } from "@nama/dashboard-types";
import { isWidgetVisible } from "@nama/dashboard-core";

import { joinClassNames } from "../classnames";
import { useDashboardRuntime } from "../context";
import { WidgetRenderer } from "../widget-renderer";
import { useEditorContext } from "./context";
import {
  MAX_WIDGET_HEIGHT,
  MIN_WIDGET_HEIGHT,
  editableItems,
  fromGridLayout,
  toGridLayout,
} from "./model";

function isEditableTarget(target: EventTarget): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest("input, textarea, select, button, [contenteditable='true']") !== null
  );
}

/**
 * The editor grid. React Grid Layout positions the items; the persisted config
 * stays the only source of truth and is updated once per drag/resize gesture.
 */
export function EditorCanvas({ className }: { className?: string }) {
  const { store, readOnly } = useEditorContext();
  const state = useStore(store);
  const runtime = useDashboardRuntime();
  const translate = runtime.i18n.translate;
  const { width, mounted, containerRef } = useContainerWidth({ initialWidth: 960 });
  const layout = state.config.layouts[state.breakpoint];
  const interactive = !readOnly && !state.preview;
  const controlValues = runtime.controls.values;

  const { widgets, unplaced, gridLayout } = useMemo(() => {
    const widgetIds = new Set(state.config.widgets.map((widget) => widget.id));
    const items = editableItems(state.config, state.breakpoint).filter((item) =>
      widgetIds.has(item.widgetId),
    );
    const byId = new Map(
      state.config.widgets.map((widget) => [widget.id, widget] as const),
    );
    const widgets = items.flatMap((item) => {
      const widget = byId.get(item.widgetId);
      return widget ? [widget] : [];
    });
    const placedIds = new Set(items.map((item) => item.widgetId));

    return {
      widgets,
      unplaced: state.config.widgets.filter((widget) => !placedIds.has(widget.id)),
      gridLayout: toGridLayout(items).map((item) => ({
        ...item,
        minH: MIN_WIDGET_HEIGHT,
        maxH: MAX_WIDGET_HEIGHT,
      })),
    };
  }, [state.config, state.breakpoint]);

  const commitLayout = (next: Layout) => {
    if (!interactive) return;
    store.getState().commitLayout(fromGridLayout(next));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive || isEditableTarget(event.target)) return;

    const editor = store.getState();
    const selected = editor.selectedWidgetId;

    if (event.key === "Escape") {
      editor.selectWidget(null);
      return;
    }

    if (!selected) return;

    const resize = event.shiftKey;
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      editor.removeWidget(selected);
      return;
    }

    const delta = deltas[event.key];
    if (!delta) return;

    event.preventDefault();
    if (resize) editor.resizeWidget(selected, delta[0], delta[1]);
    else editor.moveWidget(selected, delta[0], delta[1]);
  };

  return (
    <div className={joinClassNames("nama-editor-canvas", className)}>
      {runtime.i18n.direction === "rtl" ? (
        <p className="nama-canvas__notice" role="note">
          {translate("builder.canvas.ltrNotice")}
        </p>
      ) : null}
      <div
        ref={containerRef}
        className="nama-editor-canvas__surface"
        dir="ltr"
        data-breakpoint={state.breakpoint}
        role="group"
        aria-label={translate("builder.canvas.label")}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {mounted ? (
          <GridLayout
            width={width}
            layout={gridLayout}
            gridConfig={{
              cols: layout.columns,
              rowHeight: layout.rowHeight,
              margin: [layout.gap, layout.gap] as const,
              containerPadding: [0, 0] as const,
              maxRows: 1000,
            }}
            dragConfig={{
              enabled: interactive,
              handle: ".nama-widget__header",
              threshold: 3,
            }}
            resizeConfig={{ enabled: interactive, handles: ["se"] as const }}
            compactor={noCompactor}
            onDragStart={(next) => {
              if (!interactive) return;
              const item = next.find((entry) => entry.moved);
              if (item) store.getState().selectWidget(item.i);
            }}
            onDragStop={commitLayout}
            onResizeStop={commitLayout}
          >
            {widgets.map((widget) => (
              <EditorItem
                key={widget.id}
                widget={widget}
                selected={state.selectedWidgetId === widget.id}
                interactive={interactive}
                hidden={!isWidgetVisible(widget, controlValues)}
              />
            ))}
          </GridLayout>
        ) : (
          <div className="nama-editor-canvas__pending" aria-hidden="true" />
        )}
      </div>
      {unplaced.length > 0 ? (
        <section
          className="nama-editor-unplaced"
          aria-label={translate("builder.canvas.unplaced")}
        >
          {unplaced.map((widget) => (
            <div key={widget.id} className="nama-editor-unplaced__item">
              <WidgetRenderer widget={widget} ignoreVisibility={interactive} />
              <button
                type="button"
                className="nama-button"
                disabled={!interactive}
                onClick={() => store.getState().placeWidget(widget.id)}
              >
                {translate("builder.canvas.place")}
              </button>
            </div>
          ))}
        </section>
      ) : null}
      {state.config.widgets.length > PLATFORM_LIMITS.widgetWarningThreshold ? (
        <p className="nama-editor-canvas__warning" role="note">
          {translate("builder.canvas.manyWidgets", {
            count: state.config.widgets.length,
          })}
        </p>
      ) : null}
    </div>
  );
}

type EditorItemProps = {
  widget: DashboardWidget;
  selected: boolean;
  interactive: boolean;
  /** Visibility is dimmed, not enforced, while authoring. */
  hidden: boolean;
} & ComponentPropsWithoutRef<"div">;

/**
 * GridLayout v2 clones each child and injects positioning style, grid classes,
 * a ref, drag handlers and resize handles (as children), so this wrapper must
 * forward all of them.
 */
const EditorItem = forwardRef<HTMLDivElement, EditorItemProps>(function EditorItem(
  { widget, selected, interactive, hidden, className, onMouseDown, children, ...rest },
  ref,
) {
  const { store } = useEditorContext();

  return (
    <div
      {...rest}
      ref={ref}
      className={joinClassNames(
        "nama-editor-item",
        className,
        selected ? "nama-editor-item--selected" : undefined,
        hidden ? "nama-editor-item--hidden" : undefined,
      )}
      data-widget-id={widget.id}
      onMouseDown={(event) => {
        onMouseDown?.(event);
        if (interactive) store.getState().selectWidget(widget.id);
      }}
    >
      <WidgetRenderer widget={widget} ignoreVisibility={interactive} />
      {children}
    </div>
  );
});
