import {
  CONNECTION_CLOSE_CODES,
  realtimeAuthenticateMessageSchema,
  realtimeClientMessageSchema,
  type RealtimeServerMessage,
  type RealtimeSubscribeMessage,
} from "@nama/dashboard-types";
import type { FastifyBaseLogger } from "fastify";
import type { WebSocket } from "ws";

import type { RealtimePrincipal, RealtimeAuthorizer } from "./authorizer.ts";
import { HttpError } from "../../infrastructure/errors.ts";
import type { RealtimeHub, RealtimeSubscription } from "./hub.ts";
import type { ProtocolFailure, RealtimeOptions } from "./options.ts";

export interface ConnectionDeps {
  authorizer: RealtimeAuthorizer;
  hub: RealtimeHub;
  options: RealtimeOptions;
  now: () => number;
  logger?: FastifyBaseLogger;
}

const OPEN = 1;

function failureFrom(error: unknown): ProtocolFailure {
  if (error instanceof HttpError) {
    if (error.status === 401)
      return { code: "AUTH_FAILED", message: "Authentication failed" };
    if (error.status === 403) return { code: "FORBIDDEN", message: error.message };
    if (error.status === 422) {
      return { code: "INVALID_PARAMETERS", message: error.message };
    }
  }
  return { code: "INTERNAL", message: "The subscription could not be authorized" };
}

/**
 * One WebSocket serves every widget in a browser tab. Authentication happens
 * once; each subscription and each heartbeat is authorized separately.
 */
export class RealtimeConnection {
  private principal: RealtimePrincipal | undefined;
  private authTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private heartbeatBusy = false;
  private lastActivity: number;
  private readonly messageWindow: number[] = [];
  private readonly subscriptions = new Map<string, RealtimeSubscription>();
  private closed = false;

  constructor(
    private readonly socket: WebSocket,
    private readonly deps: ConnectionDeps,
    principal?: RealtimePrincipal,
  ) {
    this.lastActivity = deps.now();
    this.socket.on("message", (data: unknown) => void this.onMessage(data));
    this.socket.on("close", () => this.cleanup());
    this.socket.on("error", () => this.cleanup());

    if (principal) {
      this.principal = principal;
      this.connected();
      return;
    }

    this.authTimer = setTimeout(() => {
      if (!this.principal)
        this.close(CONNECTION_CLOSE_CODES.authExpired, "Authentication timeout");
    }, deps.options.authTimeoutMs);
    this.authTimer.unref?.();
  }

  /** Cookie-authenticated clients are accepted during the upgrade. */
  async authenticateCookie(token: string | undefined): Promise<void> {
    try {
      const principal = await this.deps.authorizer.fromCookie(token);
      if (!principal) return;
      this.principal = principal;
      this.connected();
    } catch {
      this.close(CONNECTION_CLOSE_CODES.authExpired, "Authentication failed");
    }
  }

  shutdown(): void {
    this.close(CONNECTION_CLOSE_CODES.normal, "Server shutting down");
  }

  send(message: RealtimeServerMessage): void {
    if (this.socket.readyState !== OPEN) return;
    this.socket.send(JSON.stringify(message));
  }

  private sendFailure(failure: ProtocolFailure, subscriptionId?: string): void {
    this.send({
      type: "error",
      code: failure.code,
      message: failure.message,
      ...(subscriptionId === undefined ? {} : { subscriptionId }),
      ...(failure.retryAfterMs === undefined
        ? {}
        : { retryAfterMs: failure.retryAfterMs }),
    });
  }

  private connected(): void {
    if (!this.principal) return;
    if (this.authTimer !== undefined) {
      clearTimeout(this.authTimer);
      this.authTimer = undefined;
    }
    this.send({
      type: "connected",
      protocolVersion: 1,
      sessionId:
        this.principal.kind === "session"
          ? this.principal.sessionId
          : `embed:${this.principal.tokenId}`,
      resumeWindowSeconds: Math.round(this.deps.options.replayMaxAgeMs / 1000),
      heartbeatIntervalMs: this.deps.options.heartbeatIntervalMs,
    });
    this.startHeartbeat();
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer !== undefined) return;
    this.heartbeatTimer = setInterval(
      () => void this.heartbeat(),
      this.deps.options.heartbeatIntervalMs,
    );
    this.heartbeatTimer.unref?.();
  }

  private async heartbeat(): Promise<void> {
    if (this.heartbeatBusy || this.closed || !this.principal) return;
    this.heartbeatBusy = true;

    try {
      const idle = this.deps.now() - this.lastActivity;
      if (
        idle >
        this.deps.options.heartbeatIntervalMs * this.deps.options.missedHeartbeats
      ) {
        this.close(CONNECTION_CLOSE_CODES.heartbeatTimeout, "Heartbeat timeout");
        return;
      }

      const valid = await this.deps.authorizer.revalidate(this.principal);
      if (!valid) {
        const code =
          this.principal.kind === "session"
            ? CONNECTION_CLOSE_CODES.authExpired
            : CONNECTION_CLOSE_CODES.revoked;
        this.close(code, "Credentials are no longer valid");
        return;
      }

      this.send({
        type: "heartbeat",
        timestamp: new Date(this.deps.now()).toISOString(),
      });
    } finally {
      this.heartbeatBusy = false;
    }
  }

  private async onMessage(raw: unknown): Promise<void> {
    this.lastActivity = this.deps.now();

    let payload: unknown;
    try {
      payload = JSON.parse(
        typeof raw === "string" ? raw : Buffer.from(raw as Buffer).toString("utf8"),
      );
    } catch {
      this.sendFailure({
        code: "PROTOCOL_UNSUPPORTED",
        message: "Malformed JSON message",
      });
      return;
    }

    if (!this.principal) {
      const authentication = realtimeAuthenticateMessageSchema.safeParse(payload);
      if (!authentication.success) {
        this.sendFailure({
          code: "AUTH_REQUIRED",
          message: "Authenticate before using the session",
        });
        return;
      }
      try {
        this.principal = await this.deps.authorizer.fromToken(authentication.data.token);
        this.connected();
      } catch {
        this.sendFailure({
          code: "AUTH_FAILED",
          message: "The embed token was rejected",
        });
        this.close(CONNECTION_CLOSE_CODES.authExpired, "Authentication failed");
      }
      return;
    }

    if (!this.allowMessage()) return;

    const message = realtimeClientMessageSchema.safeParse(payload);
    if (!message.success) {
      const type = (payload as { type?: unknown } | null)?.type;
      this.sendFailure({
        code: typeof type === "string" ? "INVALID_PARAMETERS" : "PROTOCOL_UNSUPPORTED",
        message:
          typeof type === "string"
            ? "The message parameters are invalid"
            : "Unknown message type",
      });
      return;
    }

    if (message.data.type === "subscribe") {
      await this.subscribe(message.data);
      return;
    }
    if (message.data.type === "unsubscribe") {
      this.unsubscribe(message.data.subscriptionId);
      return;
    }

    this.send({ type: "heartbeat", timestamp: new Date(this.deps.now()).toISOString() });
  }

  private async subscribe(message: RealtimeSubscribeMessage): Promise<void> {
    const principal = this.principal;
    if (!principal) return;

    if (this.subscriptions.has(message.subscriptionId)) {
      this.sendFailure(
        {
          code: "DUPLICATE_SUBSCRIPTION",
          message: "That subscription is already active",
        },
        message.subscriptionId,
      );
      return;
    }
    if (this.subscriptions.size >= this.deps.options.maxSubscriptionsPerConnection) {
      this.sendFailure(
        {
          code: "RATE_LIMITED",
          message: "Too many subscriptions on this connection",
          retryAfterMs: 1_000,
        },
        message.subscriptionId,
      );
      return;
    }

    try {
      await this.deps.authorizer.authorizeSubscription(principal, message);
    } catch (error) {
      this.sendFailure(failureFrom(error), message.subscriptionId);
      return;
    }

    const request = {
      queryId: message.queryId,
      dataSourceId: message.dataSourceId,
      query: message.query,
      ...(message.parameters === undefined ? {} : { parameters: message.parameters }),
    };
    const scoped = this.deps.authorizer.applyScope(principal, request);

    const subscription = this.deps.hub.subscribe({
      resumeKey: this.deps.authorizer.resumeKey(principal, message.subscriptionId),
      subscriptionId: message.subscriptionId,
      caller: principal.caller,
      request: scoped,
      mode: message.mode,
      ...(message.resumeFrom === undefined ? {} : { resumeFrom: message.resumeFrom }),
      send: (outgoing) => this.send(outgoing),
      announce: (firstSequence) =>
        this.send({
          type: "subscribed",
          subscriptionId: message.subscriptionId,
          firstSequence,
          mode: message.mode,
        }),
    });

    this.subscriptions.set(message.subscriptionId, subscription);
  }

  private unsubscribe(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      this.sendFailure(
        { code: "UNKNOWN_SUBSCRIPTION", message: "No such subscription" },
        subscriptionId,
      );
      return;
    }
    subscription.close(true);
    this.subscriptions.delete(subscriptionId);
    this.send({ type: "unsubscribed", subscriptionId });
  }

  private allowMessage(): boolean {
    const now = this.deps.now();
    const windowStart = now - this.deps.options.messageWindowMs;
    while (this.messageWindow.length > 0 && this.messageWindow[0]! < windowStart) {
      this.messageWindow.shift();
    }
    if (this.messageWindow.length >= this.deps.options.maxMessagesPerWindow) {
      const retryAfterMs =
        (this.messageWindow[0] ?? now) + this.deps.options.messageWindowMs - now;
      this.sendFailure({
        code: "RATE_LIMITED",
        message: "Too many messages on this connection",
        retryAfterMs: Math.max(retryAfterMs, 1),
      });
      return false;
    }
    this.messageWindow.push(now);
    return true;
  }

  private close(code: number, reason: string): void {
    if (this.closed) return;
    this.closed = true;
    if (this.socket.readyState === OPEN) this.socket.close(code, reason);
    this.cleanup();
  }

  private cleanup(): void {
    if (this.authTimer !== undefined) clearTimeout(this.authTimer);
    if (this.heartbeatTimer !== undefined) clearInterval(this.heartbeatTimer);
    this.authTimer = undefined;
    this.heartbeatTimer = undefined;

    for (const subscription of this.subscriptions.values()) subscription.close(false);
    this.subscriptions.clear();
    this.closed = true;
    this.deps.logger?.debug(
      { subscriptions: this.subscriptions.size },
      "realtime connection closed",
    );
  }
}
