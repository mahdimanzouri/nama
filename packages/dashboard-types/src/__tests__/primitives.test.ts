import { describe, expect, it } from "vitest";

import {
  LAYOUT_BREAKPOINTS,
  PLATFORM_LIMITS,
  SUPPORTED_LOCALES,
  SUPPORTED_THEMES,
  idSchema,
  isValidTimeZone,
  localeSchema,
  timestampSchema,
  timeZoneSchema,
} from "../index";

describe("platform invariants", () => {
  it("uses the three documented layout breakpoints in order", () => {
    expect(LAYOUT_BREAKPOINTS).toEqual(["desktop", "tablet", "mobile"]);
  });

  it("supports English and Persian only", () => {
    expect(SUPPORTED_LOCALES).toEqual(["en", "fa"]);
    expect(localeSchema.safeParse("de").success).toBe(false);
  });

  it("supports light, dark and system themes", () => {
    expect(SUPPORTED_THEMES).toEqual(["light", "dark", "system"]);
  });

  it("matches the documented size and rate limits", () => {
    expect(PLATFORM_LIMITS.configBytes).toBe(1_048_576);
    expect(PLATFORM_LIMITS.maxWidgets).toBe(100);
    expect(PLATFORM_LIMITS.widgetWarningThreshold).toBe(50);
    expect(PLATFORM_LIMITS.queryTimeoutMs).toBe(15_000);
    expect(PLATFORM_LIMITS.maxQueryRows).toBe(10_000);
    expect(PLATFORM_LIMITS.maxResultBytes).toBe(5_242_880);
    expect(PLATFORM_LIMITS.maxLiveChartsPerViewport).toBe(12);
    expect(PLATFORM_LIMITS.maxHistoryEntries).toBe(50);
    expect(PLATFORM_LIMITS.maxRetainedVersions).toBe(50);
    expect(PLATFORM_LIMITS.realtimeReplayMs).toBe(60_000);
    expect(PLATFORM_LIMITS.realtimeReplayEvents).toBe(1_000);
    expect(PLATFORM_LIMITS.realtimeThrottleMs).toBe(250);
    expect(PLATFORM_LIMITS.widgetUpdatesPerSecond).toBe(4);
  });

  it("is frozen so limits cannot be mutated at runtime", () => {
    expect(Object.isFrozen(PLATFORM_LIMITS)).toBe(true);
  });
});

describe("identifiers and timestamps", () => {
  it("accepts UUIDv7 and rejects older UUID versions", () => {
    expect(idSchema.safeParse("0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b21").success).toBe(true);
    expect(idSchema.safeParse("9b2f8f1e-5c3d-4a2b-8e7f-1a2b3c4d5e6f").success).toBe(
      false,
    );
    expect(idSchema.safeParse("not-an-id").success).toBe(false);
  });

  it("requires UTC ISO-8601 timestamps with an offset", () => {
    expect(timestampSchema.safeParse("2026-11-12T06:00:00Z").success).toBe(true);
    expect(timestampSchema.safeParse("2026-11-12T09:30:00+03:30").success).toBe(true);
    expect(timestampSchema.safeParse("2026-11-12T06:00:00").success).toBe(false);
    expect(timestampSchema.safeParse("2026-11-12").success).toBe(false);
  });
});

describe("time zones", () => {
  it("accepts IANA zones and rejects unknown ones", () => {
    expect(isValidTimeZone("Asia/Tehran")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(timeZoneSchema.safeParse("Europe/Berlin").success).toBe(true);
    expect(timeZoneSchema.safeParse("Mars/Olympus").success).toBe(false);
  });
});
