import type { QueryRequest, QueryResult, StreamMode } from "@nama/dashboard-types";

import { HttpError } from "../../infrastructure/errors.ts";
import type { PluginLogger } from "../queries/plugins/types.ts";
import type { QueryCaller, QueryService } from "../queries/service.ts";
import { ReplayBuffer, type BufferedEvent } from "./buffer.ts";
import type { ProtocolFailure, RealtimeOptions, RealtimeSend } from "./options.ts";

export interface RealtimeHubDeps {
  service: Pick<QueryService, "execute">;
  options: RealtimeOptions;
  now: () => number;
  logger?: PluginLogger;
}

export interface SubscribeInput {
  /** Stable across reconnects: caller identity plus the client subscription id. */
  resumeKey: string;
  subscriptionId: string;
  caller: QueryCaller;
  request: QueryRequest;
  mode: StreamMode;
  resumeFrom?: number;
  send: RealtimeSend;
  /** Runs after the plan is computed, before any event is delivered. */
  announce?: (firstSequence: number) => void;
}

export interface SubscriptionPlan {
  firstSequence: number;
  gap: boolean;
  replay: BufferedEvent[];
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function channelKey(organizationId: string, request: QueryRequest): string {
  return stable({ organizationId, request });
}

function protocolFailure(error: unknown): ProtocolFailure {
  if (error instanceof HttpError) {
    if (error.status === 401) {
      return { code: "AUTH_REQUIRED", message: "Authentication expired" };
    }
    if (error.status === 403 || error.status === 404) {
      return { code: "FORBIDDEN", message: "Not permitted to read this data source" };
    }
    if (error.status === 422) {
      return { code: "INVALID_PARAMETERS", message: error.message };
    }
    if (error.status === 429) {
      return {
        code: "RATE_LIMITED",
        message: error.message,
        ...(error.retryAfterMs === undefined ? {} : { retryAfterMs: error.retryAfterMs }),
      };
    }
  }
  return { code: "INTERNAL", message: "The subscription could not be refreshed" };
}

interface SubscriptionThread {
  buffer: ReplayBuffer;
  subscription?: RealtimeSubscription;
  expiry?: ReturnType<typeof setTimeout>;
}

/**
 * A subscription owns its own sequence counter and replay window, even when it
 * shares a poll-backed channel with other widgets. The thread outlives the
 * socket for the replay window so a reconnect can resume without a new snapshot.
 */
export class RealtimeSubscription {
  private readonly buffer: ReplayBuffer;
  private plan: SubscriptionPlan | undefined;
  private active = false;
  private pending: QueryResult | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lastSentAt = 0;
  private channel: Channel | undefined;

  constructor(
    readonly id: string,
    private readonly mode: StreamMode,
    private readonly send: RealtimeSend,
    private readonly deps: RealtimeHubDeps,
    buffer: ReplayBuffer,
    private readonly finish: (remove: boolean) => void,
  ) {
    this.buffer = buffer;
  }

  /** Computes the resume outcome without sending anything. */
  prepare(resumeFrom?: number): SubscriptionPlan {
    if (resumeFrom === undefined) {
      this.plan = {
        firstSequence: this.buffer.latestSequence + 1,
        gap: false,
        replay: [],
      };
      return this.plan;
    }

    const resume = this.buffer.since(resumeFrom);
    this.plan = {
      firstSequence: resume.events[0]?.sequence ?? this.buffer.latestSequence + 1,
      gap: resume.gap,
      replay: resume.events,
    };
    return this.plan;
  }

  /** Attaches to the channel and delivers the replay or an initial snapshot. */
  start(channel: Channel): void {
    this.channel = channel;
    channel.add(this);
    this.active = true;

    const plan = this.plan ?? this.prepare();

    if (plan.gap) {
      this.send({ type: "gap", subscriptionId: this.id, requiresSnapshot: true });
      if (channel.latest) this.deliver(channel.latest);
      return;
    }

    for (const event of plan.replay) this.sendBuffered(event);
    if (plan.replay.length === 0 && channel.latest) this.deliver(channel.latest);
  }

  deliver(result: QueryResult): void {
    if (!this.active) return;
    if (this.mode === "stream") {
      this.pending = result;
      this.scheduleData();
      return;
    }
    this.sendSnapshot(result);
  }

  deliverError(failure: ProtocolFailure): void {
    if (!this.active) return;
    this.send({
      type: "error",
      code: failure.code,
      message: failure.message,
      subscriptionId: this.id,
      ...(failure.retryAfterMs === undefined
        ? {}
        : { retryAfterMs: failure.retryAfterMs }),
    });
  }

  /** Releases the channel. Explicit unsubscribes drop replay state immediately. */
  close(remove: boolean): void {
    if (!this.active) return;
    this.active = false;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.channel?.remove(this);
    this.channel = undefined;
    this.finish(remove);
  }

  private scheduleData(): void {
    const elapsed = this.deps.now() - this.lastSentAt;
    if (elapsed >= this.deps.options.throttleMs) {
      this.flushData();
      return;
    }
    if (this.timer !== undefined) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.flushData();
    }, this.deps.options.throttleMs - elapsed);
  }

  private flushData(): void {
    const result = this.pending;
    this.pending = undefined;
    if (!result || !this.active) return;
    this.sendSequenced("data", result);
  }

  private sendSnapshot(result: QueryResult): void {
    this.sendSequenced("snapshot", result);
    this.lastSentAt = this.deps.now();
  }

  private sendSequenced(kind: "snapshot" | "data", data: unknown): void {
    const event: BufferedEvent = {
      sequence: this.buffer.latestSequence + 1,
      timestamp: new Date(this.deps.now()).toISOString(),
      kind,
      data,
    };
    this.buffer.append(event);
    this.sendBuffered(event);
  }

  private sendBuffered(event: BufferedEvent): void {
    const message =
      event.kind === "snapshot"
        ? {
            type: "snapshot" as const,
            subscriptionId: this.id,
            sequence: event.sequence,
            timestamp: event.timestamp,
            data: event.data,
          }
        : {
            type: "data" as const,
            subscriptionId: this.id,
            sequence: event.sequence,
            timestamp: event.timestamp,
            data: event.data,
          };
    this.send(message);
  }
}

/** One execution loop per distinct tenant + query; subscribers share results. */
class Channel {
  private readonly subscribers = new Set<RealtimeSubscription>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private current: AbortController | undefined;
  private polling = false;
  latest: QueryResult | undefined;

  constructor(
    private readonly caller: QueryCaller,
    private readonly request: QueryRequest,
    private readonly deps: RealtimeHubDeps,
    private readonly onEmpty: () => void,
  ) {}

  add(subscription: RealtimeSubscription): void {
    this.subscribers.add(subscription);
    if (this.timer === undefined) {
      void this.poll();
      this.timer = setInterval(() => void this.poll(), this.deps.options.pollIntervalMs);
    }
  }

  remove(subscription: RealtimeSubscription): void {
    this.subscribers.delete(subscription);
    if (this.subscribers.size === 0) {
      this.stop();
      this.onEmpty();
    }
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    this.current?.abort();
    this.current = undefined;
    this.subscribers.clear();
  }

  private async poll(): Promise<void> {
    if (this.polling || this.subscribers.size === 0) return;
    this.polling = true;
    const controller = new AbortController();
    this.current = controller;

    try {
      const result = await this.deps.service.execute(this.caller, this.request, {
        requestId: `realtime-${Date.now()}`,
        signal: controller.signal,
        ...(this.deps.logger ? { logger: this.deps.logger } : {}),
      });
      this.latest = result;
      for (const subscriber of this.subscribers) subscriber.deliver(result);
    } catch (error) {
      if (!controller.signal.aborted) {
        const failure = protocolFailure(error);
        for (const subscriber of this.subscribers) subscriber.deliverError(failure);
      }
    } finally {
      if (this.current === controller) this.current = undefined;
      this.polling = false;
    }
  }
}

export class RealtimeHub {
  private readonly channels = new Map<string, Channel>();
  private readonly threads = new Map<string, SubscriptionThread>();

  constructor(private readonly deps: RealtimeHubDeps) {}

  subscribe(input: SubscribeInput): RealtimeSubscription {
    const thread = this.threadFor(input);
    const previous = thread.subscription;
    previous?.close(false);

    const subscription = new RealtimeSubscription(
      input.subscriptionId,
      input.mode,
      input.send,
      this.deps,
      thread.buffer,
      (remove) => this.finishThread(input.resumeKey, thread, subscription, remove),
    );
    thread.subscription = subscription;
    if (thread.expiry !== undefined) {
      clearTimeout(thread.expiry);
      thread.expiry = undefined;
    }

    const plan = subscription.prepare(input.resumeFrom);
    input.announce?.(plan.firstSequence);
    subscription.start(this.channelFor(input));
    return subscription;
  }

  close(): void {
    for (const channel of this.channels.values()) channel.stop();
    this.channels.clear();
    for (const thread of this.threads.values()) {
      if (thread.expiry !== undefined) clearTimeout(thread.expiry);
    }
    this.threads.clear();
  }

  private threadFor(input: SubscribeInput): SubscriptionThread {
    let thread = this.threads.get(input.resumeKey);
    if (!thread) {
      thread = {
        buffer: new ReplayBuffer(
          this.deps.options.replayMaxEvents,
          this.deps.options.replayMaxAgeMs,
          this.deps.now,
        ),
      };
      this.threads.set(input.resumeKey, thread);
    }
    if (thread.expiry !== undefined) {
      clearTimeout(thread.expiry);
      thread.expiry = undefined;
    }
    return thread;
  }

  private finishThread(
    resumeKey: string,
    thread: SubscriptionThread,
    subscription: RealtimeSubscription,
    remove: boolean,
  ): void {
    const current = thread.subscription === subscription;
    if (current) thread.subscription = undefined;
    if (remove) {
      if (current) this.threads.delete(resumeKey);
      return;
    }
    if (!current) return;
    if (thread.expiry !== undefined) clearTimeout(thread.expiry);
    thread.expiry = setTimeout(() => {
      if (!thread.subscription) this.threads.delete(resumeKey);
    }, this.deps.options.replayMaxAgeMs);
    thread.expiry.unref?.();
  }

  private channelFor(input: SubscribeInput): Channel {
    const key = channelKey(input.caller.organizationId, input.request);
    const existing = this.channels.get(key);
    if (existing) return existing;

    const channel = new Channel(input.caller, input.request, this.deps, () => {
      if (this.channels.get(key) === channel) this.channels.delete(key);
    });
    this.channels.set(key, channel);
    return channel;
  }
}
