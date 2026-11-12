import type { ReactNode } from "react";

import { DashboardCanvas } from "./canvas";
import { joinClassNames } from "./classnames";
import { useDashboardRuntime } from "./context";

export interface DashboardViewerProps {
  className?: string;
  /** Replaces the localized empty state. */
  emptyState?: ReactNode;
}

/**
 * Read-only experience. The host passes the published configuration; the SDK
 * never fetches draft state on its own.
 */
export function DashboardViewer({ className, emptyState }: DashboardViewerProps) {
  const runtime = useDashboardRuntime();
  const hasVisibleWidgets = runtime.config.widgets.some(
    (widget) => widget.visibility?.enabled !== false,
  );

  if (!hasVisibleWidgets) {
    return (
      <div
        className={joinClassNames("nama-viewer", "nama-viewer--empty", className)}
        role="status"
      >
        {emptyState ?? runtime.i18n.translate("viewer.empty")}
      </div>
    );
  }

  return (
    <div
      className={joinClassNames("nama-viewer", className)}
      data-testid="nama-viewer"
      aria-label={runtime.config.metadata.title}
    >
      <DashboardCanvas />
    </div>
  );
}
