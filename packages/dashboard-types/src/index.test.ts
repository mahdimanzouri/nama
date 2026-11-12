import { describe, expect, it } from "vitest";

import {
  LAYOUT_BREAKPOINTS,
  PLATFORM_LIMITS,
  SUPPORTED_LOCALES,
  SUPPORTED_THEMES,
} from "./index";

describe("platform invariants", () => {
  it("uses the three documented layout breakpoints in order", () => {
    expect(LAYOUT_BREAKPOINTS).toEqual(["desktop", "tablet", "mobile"]);
  });

  it("supports English and Persian only", () => {
    expect(SUPPORTED_LOCALES).toEqual(["en", "fa"]);
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
