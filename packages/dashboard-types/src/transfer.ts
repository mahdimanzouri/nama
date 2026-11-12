import { z } from "zod";

import { parseDashboardConfig, type DashboardConfig } from "./dashboard";
import { ISSUE_CODES, issuesFromZod, type ValidationResult } from "./errors";
import { createId } from "./primitives";
import type { SchemaMigration } from "./migration";

export const DASHBOARD_EXPORT_KIND = "nama/dashboard";

/**
 * Portable envelope for a dashboard configuration. Ownership, revisions and
 * data-source credentials never appear here; the config is validated on import.
 */
export const dashboardExportEnvelopeSchema = z
  .object({
    kind: z.literal(DASHBOARD_EXPORT_KIND),
    schemaVersion: z.number().int().positive(),
    exportedAt: z.iso.datetime({ offset: true }),
    applicationVersion: z.string().min(1).max(40),
    config: z.unknown(),
  })
  .strict();

export type DashboardExportEnvelope = z.infer<typeof dashboardExportEnvelopeSchema>;

export interface ExportDashboardOptions {
  applicationVersion: string;
  exportedAt?: string;
}

export function exportDashboardConfig(
  config: DashboardConfig,
  options: ExportDashboardOptions,
): DashboardExportEnvelope {
  return {
    kind: DASHBOARD_EXPORT_KIND,
    schemaVersion: config.schemaVersion,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    applicationVersion: options.applicationVersion,
    config,
  };
}

export interface ImportDashboardOptions {
  /** Fresh IDs avoid collisions with the dashboard being imported into. */
  regenerateIds?: boolean;
  migrations?: readonly SchemaMigration[];
}

/**
 * Validates a portable envelope, migrates the configuration and (by default)
 * assigns fresh widget, variable and filter ids. Unknown widget types survive;
 * their ids are regenerated like any other.
 */
export function importDashboardConfig(
  input: unknown,
  options: ImportDashboardOptions = {},
): ValidationResult<DashboardConfig> {
  const envelope = dashboardExportEnvelopeSchema.safeParse(input);

  if (!envelope.success) {
    return { ok: false, issues: issuesFromZod(envelope.error), warnings: [] };
  }

  if (envelope.data.config === undefined) {
    return {
      ok: false,
      issues: [
        {
          code: ISSUE_CODES.invalidImport,
          path: ["config"],
          message: "the envelope does not contain a dashboard configuration",
        },
      ],
      warnings: [],
    };
  }

  const parsed = parseDashboardConfig(envelope.data.config, {
    migrations: options.migrations,
  });

  if (!parsed.ok) return parsed;

  if (options.regenerateIds === false) return parsed;

  return {
    ok: true,
    value: withRegeneratedIds(parsed.value),
    warnings: parsed.warnings,
  };
}

function withRegeneratedIds(config: DashboardConfig): DashboardConfig {
  const widgetIds = new Map(
    config.widgets.map((widget) => [widget.id, createId()] as const),
  );

  const layouts = Object.fromEntries(
    Object.entries(config.layouts).map(([breakpoint, layout]) => [
      breakpoint,
      {
        ...layout,
        items: layout.items.map((item) => ({
          ...item,
          widgetId: widgetIds.get(item.widgetId) ?? item.widgetId,
        })),
      },
    ]),
  );

  return {
    ...config,
    layouts: layouts as DashboardConfig["layouts"],
    variables: config.variables.map((variable) => ({
      ...variable,
      id: createId(),
    })),
    filters: config.filters.map((filter) => ({ ...filter, id: createId() })),
    widgets: config.widgets.map((widget) => ({
      ...widget,
      id: widgetIds.get(widget.id) ?? widget.id,
    })),
  };
}
