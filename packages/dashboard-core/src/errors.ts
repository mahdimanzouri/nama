import type { DashboardConfig, ValidationIssue } from "@nama/dashboard-types";

/**
 * Thrown (or returned by a host save callback) when the server rejects a write
 * because its revision is newer than the one the client edited.
 */
export class RevisionConflictError extends Error {
  readonly code = "REVISION_CONFLICT" as const;

  constructor(
    readonly expectedRevision: number,
    readonly currentRevision: number,
    readonly currentConfig?: DashboardConfig,
  ) {
    super(
      `Dashboard revision ${expectedRevision} is stale; the server is at ${currentRevision}`,
    );
    this.name = "RevisionConflictError";
  }
}

export function isRevisionConflictError(value: unknown): value is RevisionConflictError {
  return (
    value instanceof RevisionConflictError ||
    (typeof value === "object" &&
      value !== null &&
      (value as { code?: unknown }).code === "REVISION_CONFLICT")
  );
}

/** A widget's persisted config is newer than the plugin can migrate. */
export class UnsupportedConfigVersionError extends Error {
  readonly code = "UNSUPPORTED_CONFIG_VERSION" as const;

  constructor(
    readonly widgetType: string,
    readonly fromVersion: number,
    readonly supportedVersion: number,
  ) {
    super(
      `${widgetType} config version ${fromVersion} is not supported (latest ${supportedVersion})`,
    );
    this.name = "UnsupportedConfigVersionError";
  }
}

/** A plugin failed manifest, size or default-config validation. */
export class WidgetRegistrationError extends Error {
  readonly code = "WIDGET_REGISTRATION_FAILED" as const;

  constructor(
    readonly widgetId: string,
    readonly issues: ValidationIssue[],
  ) {
    super(
      `Widget plugin ${widgetId} is invalid: ${issues
        .map((issue) => issue.message)
        .join("; ")}`,
    );
    this.name = "WidgetRegistrationError";
  }
}

/** The configuration handed to the provider does not satisfy the schema. */
export class InvalidDashboardConfigError extends Error {
  readonly code = "INVALID_DASHBOARD_CONFIG" as const;

  constructor(readonly issues: ValidationIssue[]) {
    super(
      `Dashboard configuration is invalid: ${issues
        .map((issue) => `${issue.path.join(".")} ${issue.message}`)
        .join("; ")}`,
    );
    this.name = "InvalidDashboardConfigError";
  }
}
