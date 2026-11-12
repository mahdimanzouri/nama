import { z } from "zod";

import { idSchema, opaqueIdSchema } from "./primitives";
import { queryDefinitionSchema, type QueryDefinition } from "./query";

export const widgetVisibilitySchema = z
  .object({
    enabled: z.boolean(),
    condition: z.string().min(1).max(500).optional(),
  })
  .strict();

export type WidgetVisibility = z.infer<typeof widgetVisibilitySchema>;

export interface DashboardWidget {
  id: string;
  type: string;
  configVersion: number;
  title: string;
  dataSourceId?: string;
  config: Record<string, unknown>;
  query?: QueryDefinition;
  visibility?: WidgetVisibility;
}

export const dashboardWidgetSchema: z.ZodType<DashboardWidget> = z
  .object({
    id: idSchema,
    type: z.string().min(1).max(120),
    configVersion: z.number().int().min(1),
    title: z.string().min(1).max(200),
    dataSourceId: opaqueIdSchema.optional(),
    config: z.record(z.string(), z.unknown()),
    query: queryDefinitionSchema.optional(),
    visibility: widgetVisibilitySchema.optional(),
  })
  .strict();
