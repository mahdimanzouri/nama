import { z } from "zod";

import {
  ISSUE_CODES,
  issuesFromZod,
  type ValidationIssue,
  type ValidationResult,
} from "./errors";
import { dashboardLayoutSchema } from "./layout";
import {
  idSchema,
  SCHEMA_VERSION,
  LAYOUT_BREAKPOINTS,
  timeZoneSchema,
  timestampSchema,
  PLATFORM_LIMITS,
} from "./primitives";
import { filterOperatorSchema, variableBindingSchema } from "./query";
import { dashboardWidgetSchema } from "./widget";
import { runMigrations, type SchemaMigration } from "./migration";

export const VARIABLE_TYPES = [
  "string",
  "number",
  "boolean",
  "date",
  "timeRange",
] as const;

export const variableTypeSchema = z.enum(VARIABLE_TYPES);
export type VariableType = z.infer<typeof variableTypeSchema>;

export const dashboardMetadataSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  })
  .strict();

export const dashboardSettingsSchema = z
  .object({
    refreshInterval: z.number().int().min(0).max(86_400).default(60),
    timezone: timeZoneSchema.optional(),
  })
  .strict()
  .refine((settings) => settings.refreshInterval === 0 || settings.refreshInterval >= 5, {
    path: ["refreshInterval"],
    message: "must be 0 (disabled) or at least 5 seconds",
  });

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

function isTimeRange(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const range = value as { from?: unknown; to?: unknown };
  if (typeof range.from !== "string" || typeof range.to !== "string") return false;
  return (
    timestampSchema.safeParse(range.from).success &&
    timestampSchema.safeParse(range.to).success &&
    Date.parse(range.from) <= Date.parse(range.to)
  );
}

function matchesVariableType(type: VariableType, value: unknown): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "date":
      return (
        typeof value === "string" &&
        (ISO_DATE_PATTERN.test(value) || !Number.isNaN(Date.parse(value)))
      );
    case "timeRange":
      return isTimeRange(value);
    default:
      return false;
  }
}

export const dashboardVariableSchema = z
  .object({
    id: idSchema,
    name: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z_][A-Za-z0-9_]*$/u, "must be an identifier"),
    type: variableTypeSchema,
    defaultValue: z.unknown(),
    bindings: z.array(variableBindingSchema).max(20),
  })
  .strict()
  .superRefine((variable, ctx) => {
    if (variable.defaultValue === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["defaultValue"],
        message: "defaultValue is required",
      });
      return;
    }

    if (!matchesVariableType(variable.type, variable.defaultValue)) {
      ctx.addIssue({
        code: "custom",
        path: ["defaultValue"],
        message: `does not match variable type ${variable.type}`,
      });
    }
  });

export const dashboardFilterSchema = z
  .object({
    id: idSchema,
    field: z.string().min(1).max(200),
    operator: filterOperatorSchema,
    value: z.unknown(),
  })
  .strict()
  .superRefine((filter, ctx) => {
    const { operator, value } = filter;

    if (operator === "in" && (!Array.isArray(value) || value.length === 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "operator in requires a non-empty array",
      });
    }

    if (
      operator === "between" &&
      (!Array.isArray(value) ||
        value.length !== 2 ||
        value.some((entry) => entry === undefined))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "operator between requires a two-element array",
      });
    }
  });

export const dashboardConfigSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    metadata: dashboardMetadataSchema,
    settings: dashboardSettingsSchema,
    variables: z.array(dashboardVariableSchema).max(50),
    filters: z.array(dashboardFilterSchema).max(50),
    layouts: dashboardLayoutSchema,
    widgets: z.array(dashboardWidgetSchema).max(PLATFORM_LIMITS.maxWidgets),
  })
  .strict()
  .superRefine((config, ctx) => {
    const widgetIds = new Set<string>();
    config.widgets.forEach((widget, index) => {
      if (widgetIds.has(widget.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["widgets", index, "id"],
          message: "duplicate widget id",
          params: { code: ISSUE_CODES.duplicateWidgetId },
        });
      }
      widgetIds.add(widget.id);
    });

    const variableNames = new Set<string>();
    config.variables.forEach((variable, index) => {
      if (variableNames.has(variable.name)) {
        ctx.addIssue({
          code: "custom",
          path: ["variables", index, "name"],
          message: "duplicate variable name",
          params: { code: ISSUE_CODES.duplicateVariableName },
        });
      }
      variableNames.add(variable.name);
    });

    for (const breakpoint of LAYOUT_BREAKPOINTS) {
      config.layouts[breakpoint].items.forEach((item, index) => {
        if (!widgetIds.has(item.widgetId)) {
          ctx.addIssue({
            code: "custom",
            path: ["layouts", breakpoint, "items", index, "widgetId"],
            message: "layout references a widget that is not in the configuration",
            params: { code: ISSUE_CODES.layoutUnknownWidget },
          });
        }
      });
    }
  });

export type DashboardConfig = z.infer<typeof dashboardConfigSchema>;
export type DashboardMetadata = z.infer<typeof dashboardMetadataSchema>;
export type DashboardSettings = z.infer<typeof dashboardSettingsSchema>;
export type DashboardVariable = z.infer<typeof dashboardVariableSchema>;
export type DashboardFilter = z.infer<typeof dashboardFilterSchema>;

export const dashboardDocumentSchema = z
  .object({
    id: idSchema,
    organizationId: idSchema,
    name: z.string().min(1).max(200),
    draftConfig: dashboardConfigSchema,
    publishedConfig: dashboardConfigSchema.optional(),
    revision: z.number().int().nonnegative(),
    updatedAt: timestampSchema,
    publishedAt: timestampSchema.optional(),
  })
  .strict();

export type DashboardDocument = z.infer<typeof dashboardDocumentSchema>;

function collectWarnings(config: DashboardConfig): ValidationIssue[] {
  const warnings: ValidationIssue[] = [];

  if (config.widgets.length > PLATFORM_LIMITS.widgetWarningThreshold) {
    warnings.push({
      code: ISSUE_CODES.manyWidgets,
      path: ["widgets"],
      message: `${config.widgets.length} widgets is above the recommended ${PLATFORM_LIMITS.widgetWarningThreshold}`,
    });
  }

  const laidOut = new Set<string>();
  for (const breakpoint of LAYOUT_BREAKPOINTS) {
    for (const item of config.layouts[breakpoint].items) laidOut.add(item.widgetId);
  }

  config.widgets.forEach((widget, index) => {
    if (!laidOut.has(widget.id)) {
      warnings.push({
        code: ISSUE_CODES.widgetNotLaidOut,
        path: ["widgets", index],
        message: `widget ${widget.id} is not positioned in any layout`,
      });
    }
  });

  return warnings;
}

function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/**
 * Validates a persisted dashboard configuration.
 *
 * Migrations run first (when supplied), so the result is always checked against
 * the current schema. Unsupported future versions are rejected instead of
 * partially loaded; caps and cross-field rules produce stable issue codes.
 */
export function parseDashboardConfig(
  input: unknown,
  options: { migrations?: readonly SchemaMigration[] } = {},
): ValidationResult<DashboardConfig> {
  const migrated = runMigrations(input, SCHEMA_VERSION, options.migrations ?? []);

  if (!migrated.ok) {
    return { ok: false, issues: [migrated.issue], warnings: [] };
  }

  const parsed = dashboardConfigSchema.safeParse(migrated.value);

  if (!parsed.success) {
    return { ok: false, issues: issuesFromZod(parsed.error), warnings: [] };
  }

  if (serializedBytes(parsed.data) > PLATFORM_LIMITS.configBytes) {
    return {
      ok: false,
      issues: [
        {
          code: ISSUE_CODES.configTooLarge,
          path: [],
          message: `configuration exceeds ${PLATFORM_LIMITS.configBytes} bytes`,
        },
      ],
      warnings: [],
    };
  }

  return { ok: true, value: parsed.data, warnings: collectWarnings(parsed.data) };
}
