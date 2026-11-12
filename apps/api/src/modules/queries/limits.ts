import { PLATFORM_LIMITS } from "@nama/dashboard-types";

import type { DataSourceLimits } from "./plugins/types.ts";

export type { DataSourceLimits };

export const DEFAULT_LIMITS: DataSourceLimits = Object.freeze({
  timeoutMs: PLATFORM_LIMITS.queryTimeoutMs,
  maxRows: PLATFORM_LIMITS.maxQueryRows,
  maxBytes: PLATFORM_LIMITS.maxResultBytes,
  maxConcurrent: 4,
});

function positiveInteger(value: unknown, fallback: number, maximum: number): number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= maximum
    ? value
    : fallback;
}

/**
 * Source configuration may tighten platform limits, never loosen them.
 */
export function resolveLimits(configured: Record<string, unknown>): DataSourceLimits {
  return {
    timeoutMs: positiveInteger(
      configured.timeoutMs,
      DEFAULT_LIMITS.timeoutMs,
      PLATFORM_LIMITS.queryTimeoutMs,
    ),
    maxRows: positiveInteger(
      configured.maxRows,
      DEFAULT_LIMITS.maxRows,
      PLATFORM_LIMITS.maxQueryRows,
    ),
    maxBytes: positiveInteger(
      configured.maxBytes,
      DEFAULT_LIMITS.maxBytes,
      PLATFORM_LIMITS.maxResultBytes,
    ),
    maxConcurrent: positiveInteger(
      configured.maxConcurrent,
      DEFAULT_LIMITS.maxConcurrent,
      32,
    ),
  };
}

/** In-process query concurrency, keyed by organization and data source. */
export class ConcurrencyGate {
  private readonly active = new Map<string, number>();

  tryAcquire(key: string, maximum: number): (() => void) | null {
    const current = this.active.get(key) ?? 0;
    if (current >= maximum) return null;
    this.active.set(key, current + 1);

    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = (this.active.get(key) ?? 1) - 1;
      if (next <= 0) this.active.delete(key);
      else this.active.set(key, next);
    };
  }

  activeCount(key: string): number {
    return this.active.get(key) ?? 0;
  }
}
