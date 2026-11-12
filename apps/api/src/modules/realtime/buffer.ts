export interface BufferedEvent {
  sequence: number;
  timestamp: string;
  kind: "snapshot" | "data";
  data: unknown;
}

export interface ResumePlan {
  events: BufferedEvent[];
  gap: boolean;
}

/**
 * Per-subscription replay window: 60 s or 1,000 events, whichever is reached
 * first. Sequences are allocated when an event is sent, so a throttled stream
 * never leaves holes in the replay range.
 */
export class ReplayBuffer {
  private events: BufferedEvent[] = [];
  private highest = 0;

  constructor(
    private readonly maxEvents: number,
    private readonly maxAgeMs: number,
    private readonly now: () => number,
  ) {}

  get latestSequence(): number {
    return this.highest;
  }

  append(event: BufferedEvent): void {
    this.prune();
    this.highest = event.sequence;
    this.events.push(event);
    while (this.events.length > this.maxEvents) this.events.shift();
  }

  since(sequence: number): ResumePlan {
    this.prune();

    if (sequence > this.highest) return { events: [], gap: true };
    if (sequence === this.highest) return { events: [], gap: false };

    const first = this.events[0];
    if (!first || first.sequence > sequence + 1) return { events: [], gap: true };

    return {
      events: this.events.filter((event) => event.sequence > sequence),
      gap: false,
    };
  }

  private prune(): void {
    const cutoff = this.now() - this.maxAgeMs;
    while (this.events.length > 0 && Date.parse(this.events[0]!.timestamp) < cutoff) {
      this.events.shift();
    }
  }
}
