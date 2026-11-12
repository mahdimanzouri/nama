import { z } from "zod";

export const PLATFORM_NAME = "Nama";

/** Current dashboard configuration version. Bump with a registered migration. */
export const SCHEMA_VERSION = 1;

export const SUPPORTED_LOCALES = ["en", "fa"] as const;
export const localeSchema = z.enum(SUPPORTED_LOCALES);
export type Locale = z.infer<typeof localeSchema>;

export const LAYOUT_BREAKPOINTS = ["desktop", "tablet", "mobile"] as const;
export const breakpointSchema = z.enum(LAYOUT_BREAKPOINTS);
export type Breakpoint = z.infer<typeof breakpointSchema>;

export const SUPPORTED_THEMES = ["light", "dark", "system"] as const;
export const themeModeSchema = z.enum(SUPPORTED_THEMES);
export type ThemeMode = z.infer<typeof themeModeSchema>;

/** Persisted identifiers are UUIDv7 so they sort by creation time. */
export const idSchema = z.uuidv7();
export type PlatformId = z.infer<typeof idSchema>;

function hexByte(value: number): string {
  return value.toString(16).padStart(2, "0");
}

/**
 * Generates a UUIDv7 identifier. Shared by the API and the web app so both
 * sides produce the same sortable identifier format without a dependency.
 */
export function createId(): PlatformId {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  const now = Date.now();

  bytes[0] = Math.floor(now / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(now / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(now / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(now / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(now / 2 ** 8) & 0xff;
  bytes[5] = now & 0xff;
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes, hexByte).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Data-source identifiers are opaque to the client: it never parses them and
 * never assumes they are UUIDs, so a future connector may use another scheme.
 */
export const opaqueIdSchema = z.string().min(1).max(200);
export type OpaqueId = z.infer<typeof opaqueIdSchema>;

/** UTC ISO-8601 timestamps. Offsets are accepted and normalised by the API. */
export const timestampSchema = z.iso.datetime({ offset: true });
export type Timestamp = z.infer<typeof timestampSchema>;

/**
 * Hard limits from the M0 invariants. Server and client both enforce them;
 * changing a value here requires a schema-version decision.
 */
export const PLATFORM_LIMITS = Object.freeze({
  configBytes: 1024 * 1024,
  maxWidgets: 100,
  widgetWarningThreshold: 50,
  queryTimeoutMs: 15_000,
  maxQueryRows: 10_000,
  maxResultBytes: 5 * 1024 * 1024,
  maxLiveChartsPerViewport: 12,
  maxHistoryEntries: 50,
  maxRetainedVersions: 50,
  realtimeReplayMs: 60_000,
  realtimeReplayEvents: 1_000,
  realtimeThrottleMs: 250,
  widgetUpdatesPerSecond: 4,
} as const);

export type PlatformLimits = typeof PLATFORM_LIMITS;

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const timeZoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(isValidTimeZone, { message: "must be a valid IANA time zone" });
