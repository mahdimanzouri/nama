import { describe, expect, it } from "vitest";

import {
  ISSUE_CODES,
  parseDashboardConfig,
  readSchemaVersion,
  runMigrations,
  runWidgetMigrations,
  type SchemaMigration,
  type WidgetMigrationRegistry,
} from "../index";
import { createValidConfig } from "./fixtures";

const identityMetadata = (input: unknown): Record<string, unknown> => ({
  ...(input as Record<string, unknown>),
});

const migrate0to1: SchemaMigration = {
  fromVersion: 0,
  toVersion: 1,
  migrate: (input) => ({ ...identityMetadata(input), schemaVersion: 1 }),
};

function legacyConfig(): Record<string, unknown> {
  return { ...createValidConfig(), schemaVersion: 0 };
}

describe("readSchemaVersion", () => {
  it("returns the integer schema version or undefined", () => {
    expect(readSchemaVersion({ schemaVersion: 1 })).toBe(1);
    expect(readSchemaVersion({ schemaVersion: "1" })).toBeUndefined();
    expect(readSchemaVersion({})).toBeUndefined();
    expect(readSchemaVersion(null)).toBeUndefined();
  });
});

describe("runMigrations", () => {
  it("is idempotent when the input is already at the target version", () => {
    const input = { schemaVersion: 1 };

    const result = runMigrations(input, 1, [migrate0to1]);

    expect(result).toEqual({
      ok: true,
      value: input,
      fromVersion: 1,
      appliedVersions: [],
    });
  });

  it("applies every step in order", () => {
    const result = runMigrations(legacyConfig(), 1, [migrate0to1]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.appliedVersions).toEqual([0]);
    expect(readSchemaVersion(result.value)).toBe(1);
  });

  it("rejects a version newer than supported", () => {
    const result = runMigrations({ schemaVersion: 2 }, 1, [migrate0to1]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issue.code).toBe(ISSUE_CODES.unsupportedSchemaVersion);
    expect(result.issue.path).toEqual(["schemaVersion"]);
  });

  it("rejects an input without an integer schema version", () => {
    const result = runMigrations({}, 1, [migrate0to1]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issue.path).toEqual(["schemaVersion"]);
  });

  it("fails when a required step is missing", () => {
    const result = runMigrations(legacyConfig(), 2, [migrate0to1]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issue.code).toBe("missing_migration");
  });

  it("rejects a migration that does not advance the version", () => {
    const result = runMigrations(legacyConfig(), 1, [
      { fromVersion: 0, toVersion: 0, migrate: identityMetadata },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issue.code).toBe("invalid_migration");
  });

  it("converts a throwing migration into a validation issue", () => {
    const result = runMigrations(legacyConfig(), 1, [
      {
        fromVersion: 0,
        toVersion: 1,
        migrate: () => {
          throw new Error("boom");
        },
      },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issue.code).toBe("migration_failed");
    expect(result.issue.message).toBe("boom");
  });
});

describe("parseDashboardConfig migration path", () => {
  it("migrates an older document before validating it", () => {
    const result = parseDashboardConfig(legacyConfig(), {
      migrations: [migrate0to1],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.schemaVersion).toBe(1);
  });

  it("fails cleanly when no migration is registered", () => {
    const result = parseDashboardConfig(legacyConfig());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.code).toBe("missing_migration");
    expect(result.warnings).toEqual([]);
  });
});

describe("runWidgetMigrations", () => {
  const registry: WidgetMigrationRegistry = {
    kpi: {
      1: (config) => ({ ...(config as Record<string, unknown>), valueField: "value" }),
      2: (config) => ({ ...(config as Record<string, unknown>), format: "decimal" }),
    },
  };

  it("is a no-op when the widget is at the target version", () => {
    const result = runWidgetMigrations("kpi", { valueField: "value" }, 3, 3, registry);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.appliedVersions).toEqual([]);
  });

  it("applies each widget version in order", () => {
    const result = runWidgetMigrations("kpi", {}, 1, 3, registry);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.appliedVersions).toEqual([1, 2]);
    expect(result.value).toEqual({ valueField: "value", format: "decimal" });
  });

  it("rejects a widget configVersion newer than the plugin supports", () => {
    const result = runWidgetMigrations("kpi", {}, 4, 3, registry);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issue.code).toBe(ISSUE_CODES.unsupportedSchemaVersion);
    expect(result.issue.path).toEqual(["configVersion"]);
  });

  it("rejects an unknown widget type", () => {
    const result = runWidgetMigrations("gauge", {}, 1, 2, registry);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issue.code).toBe("missing_migration");
  });

  it("rejects a missing intermediate widget migration", () => {
    const firstStep = registry.kpi?.[1];
    if (!firstStep) throw new Error("missing fixture migration");

    const result = runWidgetMigrations("kpi", {}, 1, 3, { kpi: { 1: firstStep } });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issue.code).toBe("missing_migration");
  });
});
