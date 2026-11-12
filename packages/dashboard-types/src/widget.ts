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

/**
 * A selection in this widget writes its category value into a dashboard
 * variable. The variable's bindings decide where the value is applied.
 */
export const widgetInteractionSchema = z
  .object({
    variable: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z_][A-Za-z0-9_]*$/u, "must be an identifier"),
  })
  .strict();

export type WidgetInteraction = z.infer<typeof widgetInteractionSchema>;

export interface DashboardWidget {
  id: string;
  type: string;
  configVersion: number;
  title: string;
  dataSourceId?: string;
  config: Record<string, unknown>;
  query?: QueryDefinition;
  visibility?: WidgetVisibility;
  interaction?: WidgetInteraction;
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
    interaction: widgetInteractionSchema.optional(),
  })
  .strict();
