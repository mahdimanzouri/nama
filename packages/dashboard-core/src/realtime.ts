import {
  REALTIME_DEFAULTS,
  queryResultSchema,
  realtimeServerMessageSchema,
  type DataEvent,
  type QueryContext,
  type QueryError,
  type QueryRequest,
  type QueryResult,
  type RealtimeAdapter,
  type RealtimeErrorMessage,
  type RealtimeGapMessage,
  type RealtimeSnapshotMessage,
  type RealtimeDataMessage,
  type StreamMode,
  type SubscriptionHandlers,
  type SubscriptionStatus,
  type Unsubscribe,
} from "@nama/dashboard-types";

/** Structural subset of the browser WebSocket API, injectable for tests. */
export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number; reason?: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export interface WebSocketConstructor {
  new (url: string, protocols?: string | string[]): WebSocketLike;
}

export interface EventSourceLike {
  onopen: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void;
  close(): void;
}

export interface EventSourceConstructor {
  new (url: string, init?: { withCredentials?: boolean }): EventSourceLike;
}

export interface ReconnectOptions {
  baseMs: number;
  factor: number;
  capMs: number;
  jitterRatio: number;
}

export interface WebSocketRealtimeAdapterOptions {
  /** Full `ws(s)://…/ws/v1` URL, or a getter for a refreshable origin. */
  url: string | (() => string);
  /**
   * Embed token for non-cookie clients. It is sent as
   * `Sec-WebSocket-Protocol: nama.embed.<token>`, never in the URL.
   */
  embedToken?: string | (() => string | undefined);
  WebSocket?: WebSocketConstructor;
  mode?: StreamMode | ((request: QueryRequest) => StreamMode);
  reconnect?: Partial<ReconnectOptions>;
  heartbeatIntervalMs?: number;
}

export interface SseRealtimeAdapterOptions {
  /** Base URL without `/v1/stream`, e.g. `/api` behind the host proxy. */
  url: string | (() => string);
  EventSource?: EventSourceConstructor;
  mode?: StreamMode;
  withCredentials?: boolean;
}

export interface RealtimeConnectionHandle extends RealtimeAdapter {
  /** Closes the socket or every stream and prevents reconnection. */
  close(): void;
}

interface Subscription {
  id: string;
  request: QueryRequest;
  handlers: SubscriptionHandlers;
  lastSequence: number;
  awaitingSnapshot: boolean;
}

const OPEN = 1;
const CODE_AUTH_EXPIRED = 4401;
const CODE_REVOKED = 4403;

function errorFor(message: RealtimeErrorMessage): QueryError {
  const mapped =
    message.code === "RATE_LIMITED"
      ? "RATE_LIMITED"
      : message.code === "INTERNAL"
        ? "INTERNAL"
        : "QUERY_INVALID";
  return {
    code: mapped,
    message: message.message,
    ...(message.requestId === undefined ? {} : { requestId: message.requestId }),
    ...(message.retryAfterMs === undefined ? {} : { retryAfterMs: message.retryAfterMs }),
  };
}

type SubscriptionMessage =
  | RealtimeSnapshotMessage
  | RealtimeDataMessage
  | RealtimeGapMessage
  | RealtimeErrorMessage;

function applyMessage(subscription: Subscription, message: SubscriptionMessage): void {
  const { handlers } = subscription;

  if (message.type === "snapshot") {
    if (message.sequence <= subscription.lastSequence) return;
    if (message.sequence > subscription.lastSequence + 1) handlers.onGap();
    const parsed = queryResultSchema.safeParse(message.data);
    if (!parsed.success) {
      handlers.onError({
        code: "INTERNAL",
        message: "The realtime snapshot did not match the query result contract",
      });
      return;
    }
    subscription.lastSequence = message.sequence;
    subscription.awaitingSnapshot = false;
    handlers.onSnapshot(parsed.data as QueryResult);
    return;
  }

  if (message.type === "data") {
    if (message.sequence <= subscription.lastSequence) return;
    if (message.sequence > subscription.lastSequence + 1) {
      subscription.awaitingSnapshot = true;
      handlers.onGap();
      return;
    }
    if (subscription.awaitingSnapshot) return;
    subscription.lastSequence = message.sequence;
    const event: DataEvent = {
      sequence: message.sequence,
      timestamp: message.timestamp,
      data: message.data,
    };
    handlers.onData(event);
    return;
  }

  if (message.type === "gap") {
    subscription.awaitingSnapshot = true;
    handlers.onGap();
    return;
  }

  handlers.onError(errorFor(message));
}

function resolve<T>(value: T | (() => T)): T {
  return typeof value === "function" ? (value as () => T)() : value;
}

function modeFor(
  option: StreamMode | ((request: QueryRequest) => StreamMode) | undefined,
  request: QueryRequest,
): StreamMode {
  if (typeof option === "function") return option(request);
  return option ?? "snapshot-then-stream";
}

/**
 * One socket per adapter instance; every widget subscription shares it. The
 * manager owns reconnect, heartbeat, sequence and replay bookkeeping so widgets
 * only see the `RealtimeAdapter` contract.
 */
export function createWebSocketRealtimeAdapter(
  options: WebSocketRealtimeAdapterOptions,
): RealtimeConnectionHandle {
  const WebSocketImpl =
    options.WebSocket ?? (globalThis.WebSocket as unknown as WebSocketConstructor);
  const reconnect: ReconnectOptions = {
    baseMs: REALTIME_DEFAULTS.reconnectBaseMs,
    factor: REALTIME_DEFAULTS.reconnectFactor,
    capMs: REALTIME_DEFAULTS.reconnectCapMs,
    jitterRatio: REALTIME_DEFAULTS.reconnectJitterRatio,
    ...options.reconnect,
  };

  const adapterId = Math.random().toString(36).slice(2, 10);
  const subscriptions = new Map<string, Subscription>();
  let counter = 0;
  let socket: WebSocketLike | undefined;
  let connected = false;
  let stopped = false;
  let status: SubscriptionStatus = "connecting";
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let watchdogTimer: ReturnType<typeof setInterval> | undefined;
  let lastMessageAt = 0;
  let heartbeatMs = options.heartbeatIntervalMs ?? REALTIME_DEFAULTS.heartbeatIntervalMs;

  const notifyStatus = (next: SubscriptionStatus): void => {
    if (status === next) return;
    status = next;
    for (const subscription of subscriptions.values()) {
      subscription.handlers.onStatus(next);
    }
  };

  const send = (payload: unknown): void => {
    if (socket?.readyState === OPEN) socket.send(JSON.stringify(payload));
  };

  const sendSubscribe = (subscription: Subscription): void => {
    send({
      type: "subscribe",
      requestId: `req-${subscription.id}`,
      subscriptionId: subscription.id,
      dataSourceId: subscription.request.dataSourceId,
      queryId: subscription.request.queryId,
      query: subscription.request.query,
      mode: modeFor(options.mode, subscription.request),
      ...(subscription.lastSequence > 0 ? { resumeFrom: subscription.lastSequence } : {}),
      ...(subscription.request.parameters
        ? { parameters: subscription.request.parameters }
        : {}),
    });
  };

  const stopTimers = (): void => {
    if (heartbeatTimer !== undefined) clearInterval(heartbeatTimer);
    if (watchdogTimer !== undefined) clearInterval(watchdogTimer);
    if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
    heartbeatTimer = undefined;
    watchdogTimer = undefined;
    reconnectTimer = undefined;
  };

  const scheduleReconnect = (): void => {
    if (stopped || reconnectTimer !== undefined || subscriptions.size === 0) return;
    const exponential = reconnect.baseMs * reconnect.factor ** attempt;
    const capped = Math.min(exponential, reconnect.capMs);
    const jitter = 1 + (Math.random() * 2 - 1) * reconnect.jitterRatio;
    attempt += 1;
    notifyStatus("reconnecting");
    reconnectTimer = setTimeout(
      () => {
        reconnectTimer = undefined;
        open();
      },
      Math.round(capped * jitter),
    );
  };

  const startHeartbeat = (): void => {
    if (heartbeatTimer !== undefined) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => send({ type: "heartbeat" }), heartbeatMs);
    heartbeatTimer.unref?.();
    watchdogTimer = setInterval(() => {
      const idle = Date.now() - lastMessageAt;
      if (idle > heartbeatMs * (REALTIME_DEFAULTS.missedHeartbeatsBeforeClose + 1)) {
        socket?.close(CODE_AUTH_EXPIRED, "Heartbeat timeout");
      }
    }, heartbeatMs);
    watchdogTimer.unref?.();
  };

  const handleMessage = (raw: unknown): void => {
    lastMessageAt = Date.now();
    let payload: unknown;
    try {
      payload = JSON.parse(typeof raw === "string" ? raw : String(raw));
    } catch {
      notifyStatus("open");
      return;
    }

    const parsed = realtimeServerMessageSchema.safeParse(payload);
    if (!parsed.success) return;
    const message = parsed.data;

    if (message.type === "connected") {
      connected = true;
      attempt = 0;
      heartbeatMs = message.heartbeatIntervalMs;
      notifyStatus("open");
      startHeartbeat();
      for (const subscription of subscriptions.values()) sendSubscribe(subscription);
      return;
    }

    if (message.type === "heartbeat") return;

    if (message.type === "error" && message.subscriptionId === undefined) {
      for (const subscription of subscriptions.values()) {
        subscription.handlers.onError(errorFor(message));
      }
      return;
    }

    if (message.type === "subscribed") {
      const subscription = subscriptions.get(message.subscriptionId);
      if (subscription) {
        subscription.lastSequence = Math.max(
          subscription.lastSequence,
          message.firstSequence - 1,
        );
      }
      return;
    }

    if (message.type === "unsubscribed") return;

    if (
      message.type === "snapshot" ||
      message.type === "data" ||
      message.type === "gap"
    ) {
      const subscription = subscriptions.get(message.subscriptionId);
      if (subscription) applyMessage(subscription, message);
      return;
    }

    if (message.type === "error" && message.subscriptionId !== undefined) {
      const subscription = subscriptions.get(message.subscriptionId);
      if (subscription) applyMessage(subscription, message);
    }
  };

  const open = (): void => {
    if (stopped || socket || subscriptions.size === 0) return;
    if (!WebSocketImpl) {
      notifyStatus("closed");
      return;
    }

    const token = options.embedToken ? resolve(options.embedToken) : undefined;
    let instance: WebSocketLike;
    try {
      instance = token
        ? new WebSocketImpl(resolve(options.url), [`nama.embed.${token}`])
        : new WebSocketImpl(resolve(options.url));
    } catch {
      scheduleReconnect();
      return;
    }

    socket = instance;
    connected = false;
    lastMessageAt = Date.now();
    notifyStatus(attempt > 0 ? "reconnecting" : "connecting");

    instance.onopen = () => {
      if (stopped) {
        instance.close();
        return;
      }
      lastMessageAt = Date.now();
    };

    instance.onmessage = (event) => handleMessage(event.data);

    instance.onclose = (event) => {
      if (socket === instance) socket = undefined;
      connected = false;
      stopTimers();

      if (stopped) return;
      if (event.code === 1000 && subscriptions.size === 0) {
        notifyStatus("closed");
        return;
      }
      if (event.code === CODE_REVOKED) {
        stopped = true;
        notifyStatus("closed");
        return;
      }
      scheduleReconnect();
    };

    instance.onerror = () => {
      // The close event carries the retry decision.
    };
  };

  const release = (subscriptionId: string): void => {
    const subscription = subscriptions.get(subscriptionId);
    if (!subscription) return;
    subscriptions.delete(subscriptionId);
    send({ type: "unsubscribe", requestId: `req-${subscriptionId}`, subscriptionId });
    subscription.handlers.onStatus("closed");

    if (subscriptions.size === 0) {
      stopTimers();
      const current = socket;
      socket = undefined;
      connected = false;
      if (current?.readyState === OPEN) current.close(1000, "No subscriptions");
    }
  };

  return {
    async subscribe(
      request: QueryRequest,
      _context: QueryContext,
      handlers: SubscriptionHandlers,
    ): Promise<Unsubscribe> {
      if (stopped) throw new Error("[nama] the realtime adapter is closed");

      const id = `${adapterId}-${++counter}`;
      subscriptions.set(id, {
        id,
        request,
        handlers,
        lastSequence: 0,
        awaitingSnapshot: false,
      });
      handlers.onStatus(socket?.readyState === OPEN ? status : "connecting");

      if (!socket) open();
      else if (connected) sendSubscribe(subscriptions.get(id)!);

      let released = false;
      return () => {
        if (released) return;
        released = true;
        release(id);
      };
    },

    close(): void {
      stopped = true;
      stopTimers();
      const current = socket;
      socket = undefined;
      connected = false;
      subscriptions.clear();
      if (current?.readyState === OPEN) current.close(1000, "Adapter closed");
      notifyStatus("closed");
    },
  };
}

/**
 * SSE fallback for hosts that cannot proxy WebSocket upgrades. One stream per
 * subscription; the browser reconnects and replays with `Last-Event-ID`.
 */
export function createSseRealtimeAdapter(
  options: SseRealtimeAdapterOptions,
): RealtimeConnectionHandle {
  const EventSourceImpl =
    options.EventSource ?? (globalThis.EventSource as unknown as EventSourceConstructor);
  const adapterId = Math.random().toString(36).slice(2, 10);
  const subscriptions = new Map<
    string,
    { source: EventSourceLike; subscription: Subscription }
  >();
  let counter = 0;
  let stopped = false;

  const base = (): string => resolve(options.url).replace(/\/$/u, "");

  return {
    async subscribe(
      request: QueryRequest,
      _context: QueryContext,
      handlers: SubscriptionHandlers,
    ): Promise<Unsubscribe> {
      if (stopped) throw new Error("[nama] the realtime adapter is closed");
      if (!EventSourceImpl) throw new Error("[nama] EventSource is not available");

      const id = `${adapterId}-${++counter}`;
      const subscription: Subscription = {
        id,
        request,
        handlers,
        lastSequence: 0,
        awaitingSnapshot: false,
      };

      const params = new URLSearchParams({
        dataSourceId: request.dataSourceId,
        queryId: request.queryId,
        query: JSON.stringify(request.query),
        mode: options.mode ?? "snapshot-then-stream",
        subscriptionId: id,
      });
      const source = new EventSourceImpl(`${base()}/v1/stream?${params}`, {
        withCredentials: options.withCredentials ?? true,
      });

      handlers.onStatus("connecting");
      source.onopen = () => handlers.onStatus("open");
      source.onerror = () => handlers.onStatus("reconnecting");

      const onEvent = (event: { data?: unknown }): void => {
        if (typeof event.data !== "string") return;
        try {
          const parsed = realtimeServerMessageSchema.safeParse(JSON.parse(event.data));
          if (!parsed.success) return;
          const message = parsed.data;
          if (message.type === "subscribed") {
            subscription.lastSequence = Math.max(
              subscription.lastSequence,
              message.firstSequence - 1,
            );
            return;
          }
          if (
            message.type === "snapshot" ||
            message.type === "data" ||
            message.type === "gap" ||
            message.type === "error"
          ) {
            applyMessage(subscription, message);
          }
        } catch {
          // A malformed frame is ignored; the stream continues.
        }
      };

      for (const type of ["subscribed", "snapshot", "data", "gap", "error"]) {
        source.addEventListener(type, onEvent);
      }

      subscriptions.set(id, { source, subscription });

      let released = false;
      return () => {
        if (released) return;
        released = true;
        const entry = subscriptions.get(id);
        subscriptions.delete(id);
        entry?.source.close();
        handlers.onStatus("closed");
      };
    },

    close(): void {
      stopped = true;
      for (const entry of subscriptions.values()) entry.source.close();
      subscriptions.clear();
    },
  };
}
