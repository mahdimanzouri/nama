import {
  PLATFORM_LIMITS,
  REALTIME_DEFAULTS,
  type ProtocolErrorCode,
  type RealtimeServerMessage,
} from "@nama/dashboard-types";

export interface RealtimeOptions {
  /** How often a shared channel re-executes its query for the latest value. */
  pollIntervalMs: number;
  heartbeatIntervalMs: number;
  authTimeoutMs: number;
  /** Minimum gap between two stream-mode data events for one subscription. */
  throttleMs: number;
  missedHeartbeats: number;
  replayMaxEvents: number;
  replayMaxAgeMs: number;
  maxSubscriptionsPerConnection: number;
  maxMessagesPerWindow: number;
  messageWindowMs: number;
  /** Process-wide cap across WebSocket connections and SSE streams. */
  maxConnections: number;
}

export const REALTIME_OPTION_DEFAULTS: RealtimeOptions = {
  pollIntervalMs: 5_000,
  heartbeatIntervalMs: REALTIME_DEFAULTS.heartbeatIntervalMs,
  authTimeoutMs: REALTIME_DEFAULTS.authTimeoutMs,
  throttleMs: PLATFORM_LIMITS.realtimeThrottleMs,
  missedHeartbeats: REALTIME_DEFAULTS.missedHeartbeatsBeforeClose,
  replayMaxEvents: PLATFORM_LIMITS.realtimeReplayEvents,
  replayMaxAgeMs: PLATFORM_LIMITS.realtimeReplayMs,
  maxSubscriptionsPerConnection: 50,
  maxMessagesPerWindow: 120,
  messageWindowMs: 10_000,
  maxConnections: 500,
};

export type RealtimeSend = (message: RealtimeServerMessage) => void;

export interface ProtocolFailure {
  code: ProtocolErrorCode;
  message: string;
  retryAfterMs?: number;
}
