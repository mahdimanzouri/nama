import { z } from "zod";

import { PLATFORM_LIMITS, timestampSchema } from "./primitives";

/** Bumped only for breaking changes; a breaking change ships as `/ws/v2`. */
export const REALTIME_PROTOCOL_VERSION = 1;

/**
 * The ten protocol messages. `authenticate` is a handshake frame that precedes
 * the session and is therefore not part of this list.
 */
export const REALTIME_MESSAGE_TYPES = [
  "connected",
  "subscribe",
  "subscribed",
  "snapshot",
  "data",
  "gap",
  "unsubscribe",
  "unsubscribed",
  "error",
  "heartbeat",
] as const;

export const realtimeMessageTypeSchema = z.enum(REALTIME_MESSAGE_TYPES);
export type RealtimeMessageType = z.infer<typeof realtimeMessageTypeSchema>;

export const STREAM_MODES = ["snapshot-then-stream", "stream"] as const;
export const streamModeSchema = z.enum(STREAM_MODES);
export type StreamMode = z.infer<typeof streamModeSchema>;

/**
 * Per-subscription, strictly increasing event counter. JavaScript numbers keep
 * 53 bits of integer precision; the server must stay below `Number.MAX_SAFE_INTEGER`.
 */
export const sequenceSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export type Sequence = z.infer<typeof sequenceSchema>;

export const subscriptionIdSchema = z.string().min(1).max(120);
export const requestIdSchema = z.string().min(1).max(120);

export const PROTOCOL_ERROR_CODES = [
  "PROTOCOL_UNSUPPORTED",
  "AUTH_REQUIRED",
  "AUTH_FAILED",
  "FORBIDDEN",
  "UNKNOWN_SUBSCRIPTION",
  "DUPLICATE_SUBSCRIPTION",
  "INVALID_PARAMETERS",
  "RATE_LIMITED",
  "INTERNAL",
] as const;

export const protocolErrorCodeSchema = z.enum(PROTOCOL_ERROR_CODES);
export type ProtocolErrorCode = z.infer<typeof protocolErrorCodeSchema>;

export const CONNECTION_CLOSE_CODES = Object.freeze({
  normal: 1000,
  authExpired: 4401,
  revoked: 4403,
  heartbeatTimeout: 4408,
  rateLimited: 4429,
} as const);

export const REALTIME_DEFAULTS = Object.freeze({
  authTimeoutMs: 5_000,
  heartbeatIntervalMs: 30_000,
  missedHeartbeatsBeforeClose: 2,
  reconnectBaseMs: 500,
  reconnectFactor: 2,
  reconnectCapMs: 30_000,
  reconnectJitterRatio: 0.2,
  maxBufferedSamples: 500,
} as const);

/** First frame for embedded clients; a cookie-authenticated client may omit it. */
export const realtimeAuthenticateMessageSchema = z
  .object({
    type: z.literal("authenticate"),
    requestId: requestIdSchema.optional(),
    token: z.string().min(1).max(4096),
  })
  .strict();

export type RealtimeAuthenticateMessage = z.infer<
  typeof realtimeAuthenticateMessageSchema
>;

export const realtimeSubscribeMessageSchema = z
  .object({
    type: z.literal("subscribe"),
    requestId: requestIdSchema,
    subscriptionId: subscriptionIdSchema,
    dataSourceId: z.string().min(1).max(200),
    queryId: z.string().min(1).max(200),
    mode: streamModeSchema.default("snapshot-then-stream"),
    resumeFrom: sequenceSchema.optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type RealtimeSubscribeMessage = z.infer<typeof realtimeSubscribeMessageSchema>;

export const realtimeUnsubscribeMessageSchema = z
  .object({
    type: z.literal("unsubscribe"),
    requestId: requestIdSchema,
    subscriptionId: subscriptionIdSchema,
  })
  .strict();

export type RealtimeUnsubscribeMessage = z.infer<typeof realtimeUnsubscribeMessageSchema>;

export const realtimeHeartbeatMessageSchema = z
  .object({
    type: z.literal("heartbeat"),
    timestamp: timestampSchema.optional(),
  })
  .strict();

export type RealtimeHeartbeatMessage = z.infer<typeof realtimeHeartbeatMessageSchema>;

export const realtimeClientMessageSchema = z.discriminatedUnion("type", [
  realtimeSubscribeMessageSchema,
  realtimeUnsubscribeMessageSchema,
  realtimeHeartbeatMessageSchema,
]);

export type RealtimeClientMessage = z.infer<typeof realtimeClientMessageSchema>;

export const realtimeConnectedMessageSchema = z
  .object({
    type: z.literal("connected"),
    protocolVersion: z.literal(REALTIME_PROTOCOL_VERSION),
    sessionId: z.string().min(1).max(200),
    resumeWindowSeconds: z.number().int().positive(),
    heartbeatIntervalMs: z.number().int().positive(),
  })
  .strict();

export type RealtimeConnectedMessage = z.infer<typeof realtimeConnectedMessageSchema>;

export const realtimeSubscribedMessageSchema = z
  .object({
    type: z.literal("subscribed"),
    subscriptionId: subscriptionIdSchema,
    firstSequence: sequenceSchema,
    mode: streamModeSchema,
  })
  .strict();

export type RealtimeSubscribedMessage = z.infer<typeof realtimeSubscribedMessageSchema>;

export const realtimeSnapshotMessageSchema = z
  .object({
    type: z.literal("snapshot"),
    subscriptionId: subscriptionIdSchema,
    sequence: sequenceSchema,
    timestamp: timestampSchema,
    data: z.unknown(),
  })
  .strict();

export type RealtimeSnapshotMessage = z.infer<typeof realtimeSnapshotMessageSchema>;

export const realtimeDataMessageSchema = z
  .object({
    type: z.literal("data"),
    subscriptionId: subscriptionIdSchema,
    sequence: sequenceSchema,
    timestamp: timestampSchema,
    data: z.unknown(),
  })
  .strict();

export type RealtimeDataMessage = z.infer<typeof realtimeDataMessageSchema>;

export const realtimeGapMessageSchema = z
  .object({
    type: z.literal("gap"),
    subscriptionId: subscriptionIdSchema,
    requiresSnapshot: z.boolean(),
  })
  .strict();

export type RealtimeGapMessage = z.infer<typeof realtimeGapMessageSchema>;

export const realtimeUnsubscribedMessageSchema = z
  .object({
    type: z.literal("unsubscribed"),
    subscriptionId: subscriptionIdSchema,
  })
  .strict();

export type RealtimeUnsubscribedMessage = z.infer<
  typeof realtimeUnsubscribedMessageSchema
>;

export const realtimeErrorMessageSchema = z
  .object({
    type: z.literal("error"),
    code: protocolErrorCodeSchema,
    message: z.string().min(1),
    subscriptionId: subscriptionIdSchema.optional(),
    requestId: requestIdSchema.optional(),
    retryAfterMs: z.number().int().nonnegative().optional(),
  })
  .strict();

export type RealtimeErrorMessage = z.infer<typeof realtimeErrorMessageSchema>;

export const realtimeServerMessageSchema = z.discriminatedUnion("type", [
  realtimeConnectedMessageSchema,
  realtimeSubscribedMessageSchema,
  realtimeSnapshotMessageSchema,
  realtimeDataMessageSchema,
  realtimeGapMessageSchema,
  realtimeUnsubscribedMessageSchema,
  realtimeErrorMessageSchema,
  realtimeHeartbeatMessageSchema,
]);

export type RealtimeServerMessage = z.infer<typeof realtimeServerMessageSchema>;

/** Replay buffer per subscription: 60 s or 1,000 events, whichever is smaller. */
export const replayWindow = Object.freeze({
  maxAgeMs: PLATFORM_LIMITS.realtimeReplayMs,
  maxEvents: PLATFORM_LIMITS.realtimeReplayEvents,
});
