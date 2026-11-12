import type { Breakpoint, DashboardLayouts, LayoutItem } from "@nama/dashboard-types";

export const MIN_WIDTH_BY_BREAKPOINT = Object.freeze({
  mobile: 0,
  tablet: 640,
  desktop: 1024,
} satisfies Record<Breakpoint, number>);

/** Breakpoints are widest to narrowest; the canvas is LTR-only in v1. */
export function breakpointForWidth(width: number): Breakpoint {
  if (width >= MIN_WIDTH_BY_BREAKPOINT.desktop) return "desktop";
  if (width >= MIN_WIDTH_BY_BREAKPOINT.tablet) return "tablet";
  return "mobile";
}

const WIDER_BREAKPOINTS: Record<Breakpoint, readonly Breakpoint[]> = {
  desktop: ["desktop"],
  tablet: ["tablet", "desktop"],
  mobile: ["mobile", "tablet", "desktop"],
};

export interface ResolvedLayoutItem extends LayoutItem {
  /** Breakpoint the item was inherited from; equals the active one when local. */
  sourceBreakpoint: Breakpoint;
}

/**
 * Resolves positions for a breakpoint. A widget without a local item inherits
 * from the next wider breakpoint and is clamped to this breakpoint's columns.
 */
export function resolveLayoutItems(
  layouts: DashboardLayouts,
  breakpoint: Breakpoint,
): ResolvedLayoutItem[] {
  const columns = layouts[breakpoint].columns;
  const resolved = new Map<string, ResolvedLayoutItem>();

  for (const candidate of WIDER_BREAKPOINTS[breakpoint]) {
    for (const item of layouts[candidate].items) {
      if (resolved.has(item.widgetId)) continue;

      const x = Math.min(item.x, Math.max(columns - 1, 0));
      const w = Math.max(1, Math.min(item.w, columns - x));
      resolved.set(item.widgetId, { ...item, x, w, sourceBreakpoint: candidate });
    }
  }

  return [...resolved.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}
