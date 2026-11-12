export interface RateLimitConfig {
  /** Requests allowed inside one window. */
  limit: number;
  windowMs: number;
}

export type RateLimitDecision =
  { allowed: true; remaining: number } | { allowed: false; retryAfterMs: number };

interface Bucket {
  windowStart: number;
  count: number;
}

/**
 * Fixed-window, in-process limiter. Limits are per instance; a multi-replica
 * deployment needs a shared store or an edge limiter (TD-054).
 */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly config: RateLimitConfig) {}

  consume(key: string, now: number): RateLimitDecision {
    const bucket = this.buckets.get(key);
    if (!bucket || now - bucket.windowStart >= this.config.windowMs) {
      this.buckets.set(key, { windowStart: now, count: 1 });
      this.prune(now);
      return { allowed: true, remaining: this.config.limit - 1 };
    }

    if (bucket.count >= this.config.limit) {
      return {
        allowed: false,
        retryAfterMs: Math.max(this.config.windowMs - (now - bucket.windowStart), 0),
      };
    }

    bucket.count += 1;
    return { allowed: true, remaining: this.config.limit - bucket.count };
  }

  /** Drops expired windows so the map stays bounded by active keys. */
  private prune(now: number): void {
    if (this.buckets.size < 1_000) return;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.windowStart >= this.config.windowMs) this.buckets.delete(key);
    }
  }
}
