import type { ZodType } from "zod";

/**
 * Stable issue codes. Zod's own issue codes (for example `invalid_type`) are
 * passed through unchanged; these are the cross-field and cap checks.
 */
export const ISSUE_CODES = Object.freeze({
  tooManyWidgets: "too_many_widgets",
  manyWidgets: "many_widgets",
  configTooLarge: "config_too_large",
  duplicateWidgetId: "duplicate_widget_id",
  layoutUnknownWidget: "layout_unknown_widget",
  layoutDuplicateWidget: "layout_duplicate_widget",
  duplicateVariableName: "duplicate_variable_name",
  unsupportedSchemaVersion: "unsupported_schema_version",
  widgetNotLaidOut: "widget_not_laid_out",
  invalidWidgetPlugin: "invalid_widget_plugin",
  duplicateWidgetType: "duplicate_widget_type",
  widgetMigrationFailed: "widget_migration_failed",
  invalidImport: "invalid_import",
} as const);

export interface ValidationIssue {
  code: string;
  path: Array<string | number>;
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T; warnings: ValidationIssue[] }
  | { ok: false; issues: ValidationIssue[]; warnings: ValidationIssue[] };

type ZodIssueLike = {
  code: string;
  path: readonly PropertyKey[];
  message: string;
  params?: unknown;
};

function toValidationPath(path: readonly PropertyKey[]): Array<string | number> {
  return path.filter(
    (segment): segment is string | number =>
      typeof segment === "string" || typeof segment === "number",
  );
}

/**
 * Zod reports every cross-field check as `custom`. Checks pass their stable
 * code in `params.code` so callers branch on a documented value, not a message.
 */
function stableCode(issue: ZodIssueLike): string {
  const params = issue.params;
  if (typeof params !== "object" || params === null) return issue.code;

  const code = (params as { code?: unknown }).code;
  return typeof code === "string" ? code : issue.code;
}

export function issuesFromZod(error: {
  issues: readonly ZodIssueLike[];
}): ValidationIssue[] {
  return error.issues.map((issue) => ({
    code: stableCode(issue),
    path: toValidationPath(issue.path),
    message: issue.message,
  }));
}

export function validate<T>(schema: ZodType<T>, input: unknown): ValidationResult<T> {
  const result = schema.safeParse(input);

  if (!result.success) {
    return { ok: false, issues: issuesFromZod(result.error), warnings: [] };
  }

  return { ok: true, value: result.data, warnings: [] };
}
