import type { CSSProperties } from "react";

import { joinClassNames } from "./classnames";
import { useDashboardRuntime } from "./context";
import { useDashboardLayout } from "./hooks";
import { WidgetRenderer } from "./widget-renderer";

type CanvasVariables = CSSProperties & {
  "--nama-columns": number;
  "--nama-row-height": string;
  "--nama-gap": string;
};

export interface DashboardCanvasProps {
  className?: string;
}

/**
 * CSS-grid composition of the resolved layout. The grid itself is LTR-only in
 * v1; chrome around it still follows the document direction.
 */
export function DashboardCanvas({ className }: DashboardCanvasProps) {
  const runtime = useDashboardRuntime();
  const { items, columns, rowHeight, gap, breakpoint } = useDashboardLayout();
  const widgets = runtime.config.widgets.filter(
    (widget) => widget.visibility?.enabled !== false,
  );
  const byId = new Map(widgets.map((widget) => [widget.id, widget]));
  const placed = items.flatMap((item) => {
    const widget = byId.get(item.widgetId);
    return widget ? [{ widget, item }] : [];
  });
  const placedIds = new Set(placed.map(({ widget }) => widget.id));
  const unplaced = widgets.filter((widget) => !placedIds.has(widget.id));
  const style: CanvasVariables = {
    "--nama-columns": columns,
    "--nama-row-height": `${rowHeight}px`,
    "--nama-gap": `${gap}px`,
  };

  return (
    <div className={joinClassNames("nama-canvas-shell", className)}>
      {runtime.i18n.direction === "rtl" ? (
        <p className="nama-canvas__notice" role="note">
          {runtime.i18n.translate("builder.canvas.ltrNotice")}
        </p>
      ) : null}
      <section
        className="nama-canvas"
        dir="ltr"
        data-breakpoint={breakpoint}
        style={style}
        aria-label={runtime.config.metadata.title}
      >
        {placed.map(({ widget, item }) => (
          <div
            key={widget.id}
            className="nama-canvas__item"
            style={{
              gridColumn: `${item.x + 1} / span ${item.w}`,
              gridRow: `${item.y + 1} / span ${item.h}`,
            }}
          >
            <WidgetRenderer widget={widget} />
          </div>
        ))}
        {unplaced.map((widget) => (
          <div key={widget.id} className="nama-canvas__item nama-canvas__item--unplaced">
            <WidgetRenderer widget={widget} />
          </div>
        ))}
      </section>
    </div>
  );
}
