import type { ErasedWidgetPlugin } from "@nama/dashboard-builder";

import { kpiWidget } from "./kpi";
import { lineWidget } from "./line";

/** Module-level constant so the provider does not rebuild its registry. */
export const WEB_WIDGETS: readonly ErasedWidgetPlugin[] = [kpiWidget, lineWidget];
