import { ISSUE_CODES, type ValidationIssue } from "./errors";

/** A single migration step. `migrate` receives untrusted input and must not throw on shape. */
export interface SchemaMigration {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly migrate: (input: unknown, fromVersion: number) => unknown;
}

export type MigrateConfig<T> = (config: unknown, fromVersion: number) => T;

export type MigrationOutcome =
  | { ok: true; value: unknown; fromVersion: number; appliedVersions: number[] }
  | { ok: false; issue: ValidationIssue };

export function readSchemaVersion(input: unknown): number | undefined {
  if (typeof input !== "object" || input === null) return undefined;

  const version = (input as { schemaVersion?: unknown }).schemaVersion;
  return typeof version === "number" && Number.isInteger(version) ? version : undefined;
}

const MISSING_VERSION: ValidationIssue = {
  code: "invalid_type",
  path: ["schemaVersion"],
  message: "schemaVersion must be an integer",
};

/**
 * Applies migrations in order until `targetVersion` is reached. Idempotent: an
 * input already at the target is returned untouched, and a migration whose
 * `toVersion` does not advance is rejected rather than looped.
 */
export function runMigrations(
  input: unknown,
  targetVersion: number,
  migrations: readonly SchemaMigration[],
): MigrationOutcome {
  const startVersion = readSchemaVersion(input);
  if (startVersion === undefined) return { ok: false, issue: MISSING_VERSION };

  if (startVersion > targetVersion) {
    return {
      ok: false,
      issue: {
        code: ISSUE_CODES.unsupportedSchemaVersion,
        path: ["schemaVersion"],
        message: `schemaVersion ${startVersion} is newer than supported ${targetVersion}`,
      },
    };
  }

  if (startVersion === targetVersion) {
    return { ok: true, value: input, fromVersion: startVersion, appliedVersions: [] };
  }

  let current = input;
  let version = startVersion;
  const appliedVersions: number[] = [];

  while (version < targetVersion) {
    const migration = migrations.find((candidate) => candidate.fromVersion === version);
    if (!migration) {
      return {
        ok: false,
        issue: {
          code: "missing_migration",
          path: ["schemaVersion"],
          message: `no migration registered from version ${version}`,
        },
      };
    }

    if (migration.toVersion <= migration.fromVersion) {
      return {
        ok: false,
        issue: {
          code: "invalid_migration",
          path: ["schemaVersion"],
          message: `migration from ${migration.fromVersion} must advance the version`,
        },
      };
    }

    try {
      current = migration.migrate(current, version);
    } catch (error) {
      return {
        ok: false,
        issue: {
          code: "migration_failed",
          path: ["schemaVersion"],
          message: error instanceof Error ? error.message : "migration threw",
        },
      };
    }

    appliedVersions.push(version);
    version = migration.toVersion;
  }

  return { ok: true, value: current, fromVersion: startVersion, appliedVersions };
}

/** Per-widget-type migrations, keyed by widget type then source version. */
export type WidgetMigrationRegistry = Record<
  string,
  Record<number, MigrateConfig<unknown>>
>;

export function runWidgetMigrations(
  widgetType: string,
  config: unknown,
  fromVersion: number,
  targetVersion: number,
  registry: WidgetMigrationRegistry,
): MigrationOutcome {
  if (fromVersion === targetVersion) {
    return { ok: true, value: config, fromVersion, appliedVersions: [] };
  }

  if (fromVersion > targetVersion) {
    return {
      ok: false,
      issue: {
        code: ISSUE_CODES.unsupportedSchemaVersion,
        path: ["configVersion"],
        message: `configVersion ${fromVersion} is newer than supported ${targetVersion} for ${widgetType}`,
      },
    };
  }

  const migrations = registry[widgetType];
  if (!migrations) {
    return {
      ok: false,
      issue: {
        code: "missing_migration",
        path: ["configVersion"],
        message: `no migrations registered for widget type ${widgetType}`,
      },
    };
  }

  let current = config;
  let version = fromVersion;
  const appliedVersions: number[] = [];

  while (version < targetVersion) {
    const migrate = migrations[version];
    if (!migrate) {
      return {
        ok: false,
        issue: {
          code: "missing_migration",
          path: ["configVersion"],
          message: `no migration from version ${version} for ${widgetType}`,
        },
      };
    }

    try {
      current = migrate(current, version);
    } catch (error) {
      return {
        ok: false,
        issue: {
          code: "migration_failed",
          path: ["configVersion"],
          message: error instanceof Error ? error.message : "migration threw",
        },
      };
    }

    appliedVersions.push(version);
    version += 1;
  }

  return { ok: true, value: current, fromVersion, appliedVersions };
}
