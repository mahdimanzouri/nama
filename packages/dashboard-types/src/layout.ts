import { z } from "zod";

import { ISSUE_CODES } from "./errors";
import {
  idSchema,
  PLATFORM_LIMITS,
  LAYOUT_BREAKPOINTS,
  type Breakpoint,
} from "./primitives";

export const BREAKPOINT_COLUMNS = Object.freeze({
  desktop: 12,
  tablet: 8,
  mobile: 4,
} as const);

export const DEFAULT_ROW_HEIGHT = 40;
export const DEFAULT_GAP = 8;

export interface LayoutItem {
  widgetId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardLayout {
  columns: number;
  rowHeight: number;
  gap: number;
  items: LayoutItem[];
}

export type DashboardLayouts = Record<Breakpoint, DashboardLayout>;

export const layoutItemSchema: z.ZodType<LayoutItem> = z
  .object({
    widgetId: idSchema,
    x: z.number().int().min(0),
    y: z.number().int().min(0),
    w: z.number().int().min(1),
    h: z.number().int().min(1),
  })
  .strict();

function createLayoutSchema(breakpoint: Breakpoint) {
  const columns = BREAKPOINT_COLUMNS[breakpoint];

  return z
    .object({
      columns: z.literal(columns),
      rowHeight: z.number().int().min(10).max(200),
      gap: z.number().int().min(0).max(48),
      items: z.array(layoutItemSchema).max(PLATFORM_LIMITS.maxWidgets),
    })
    .strict()
    .superRefine((layout, ctx) => {
      const seen = new Set<string>();

      layout.items.forEach((item, index) => {
        if (item.x + item.w > layout.columns) {
          ctx.addIssue({
            code: "custom",
            path: ["items", index, "w"],
            message: `item extends past column ${layout.columns}`,
          });
        }

        if (seen.has(item.widgetId)) {
          ctx.addIssue({
            code: "custom",
            path: ["items", index, "widgetId"],
            message: "widget is positioned more than once in this breakpoint",
            params: { code: ISSUE_CODES.layoutDuplicateWidget },
          });
        }
        seen.add(item.widgetId);
      });
    });
}

export const dashboardLayoutSchema = z.object({
  desktop: createLayoutSchema("desktop"),
  tablet: createLayoutSchema("tablet"),
  mobile: createLayoutSchema("mobile"),
});

export const LAYOUT_BREAKPOINT_ORDER: readonly Breakpoint[] = LAYOUT_BREAKPOINTS;
