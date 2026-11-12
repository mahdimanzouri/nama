import { z } from "zod";

/**
 * Semantic Versioning 2.0.0 pattern. Plugin package versions and widget
 * `configVersion` values are independent of each other and of `schemaVersion`.
 */
export const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/u;

export const semverSchema = z
  .string()
  .min(5)
  .max(120)
  .regex(SEMVER_PATTERN, "must be a semantic version");

/** Lowercase, scope-safe and immutable after publication, e.g. `@acme/gauge`. */
export const PLUGIN_ID_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;

export const pluginIdSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(PLUGIN_ID_PATTERN, "must be a lowercase, scope-safe identifier");

export const widgetManifestSchema = z
  .object({
    id: pluginIdSchema,
    version: semverSchema,
    name: z.string().min(1).max(120),
    description: z.string().min(1).max(500).optional(),
    author: z.string().min(1).max(200).optional(),
  })
  .strict();

export type WidgetManifest = z.infer<typeof widgetManifestSchema>;

export const widgetCapabilitiesSchema = z
  .object({
    realtime: z.boolean().optional(),
    export: z.boolean().optional(),
    filters: z.boolean().optional(),
  })
  .strict();

export type WidgetCapabilities = z.infer<typeof widgetCapabilitiesSchema>;

/** Stable connector kind, e.g. `rest`, `postgres`, `mqtt`. */
export const DATA_SOURCE_KIND_PATTERN = /^[a-z][a-z0-9._-]*$/u;

export const dataSourceKindSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(DATA_SOURCE_KIND_PATTERN, "must be a lowercase connector kind");

export const dataSourceCapabilitiesSchema = z
  .object({
    test: z.boolean(),
    execute: z.boolean(),
    stream: z.boolean().optional(),
    rawSql: z.boolean().optional(),
    schemaDiscovery: z.boolean().optional(),
  })
  .strict();

export type DataSourceCapabilities = z.infer<typeof dataSourceCapabilitiesSchema>;

export const dataSourcePluginManifestSchema = z
  .object({
    kind: dataSourceKindSchema,
    version: semverSchema,
    name: z.string().min(1).max(200),
    capabilities: dataSourceCapabilitiesSchema,
  })
  .strict();

export type DataSourcePluginManifest = z.infer<typeof dataSourcePluginManifestSchema>;
