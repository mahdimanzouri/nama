type LabelSet = ReadonlyArray<readonly [string, string]>;

interface Sample {
  labels: LabelSet;
  value: number;
}

/**
 * Minimal Prometheus text exposition for the API. Counters are kept in
 * process memory; a multi-replica deployment scrapes every instance or ships
 * these through an OpenTelemetry collector.
 */
export class Metrics {
  readonly startedAt = Date.now();
  private readonly httpRequests = new Map<string, Sample>();
  private readonly httpDurationSum = new Map<string, Sample>();
  private readonly httpDurationCount = new Map<string, Sample>();
  private readonly queryOutcomes = new Map<string, Sample>();
  private readonly rateLimited = new Map<string, Sample>();
  private realtimeConnections = 0;

  observeHttp(method: string, route: string, status: number, durationMs: number): void {
    const key = `${method}|${route}|${status}`;
    increment(this.httpRequests, key, [
      ["method", method],
      ["route", route],
      ["status", String(status)],
    ]);
    const routeKey = `${method}|${route}`;
    add(this.httpDurationSum, routeKey, durationMs / 1000, [
      ["method", method],
      ["route", route],
    ]);
    increment(this.httpDurationCount, routeKey, [
      ["method", method],
      ["route", route],
    ]);
  }

  recordQuery(outcome: "ok" | "truncated" | "error"): void {
    increment(this.queryOutcomes, outcome, [["outcome", outcome]]);
  }

  recordRateLimited(scope: "login" | "query"): void {
    increment(this.rateLimited, scope, [["scope", scope]]);
  }

  setRealtimeConnections(count: number): void {
    this.realtimeConnections = count;
  }

  render(): string {
    const lines: string[] = [];
    this.renderSamples(
      lines,
      "nama_http_requests_total",
      "counter",
      "HTTP requests by method, route and status.",
      this.httpRequests,
    );
    this.renderSamples(
      lines,
      "nama_http_request_duration_seconds_sum",
      "summary",
      "Total HTTP request duration in seconds.",
      this.httpDurationSum,
    );
    this.renderSamples(
      lines,
      "nama_http_request_duration_seconds_count",
      "summary",
      "Observed HTTP requests for duration.",
      this.httpDurationCount,
    );
    this.renderSamples(
      lines,
      "nama_query_executions_total",
      "counter",
      "Query executions by outcome.",
      this.queryOutcomes,
    );
    this.renderSamples(
      lines,
      "nama_rate_limited_total",
      "counter",
      "Requests rejected by a rate limiter.",
      this.rateLimited,
    );
    lines.push(
      "# HELP nama_realtime_connections Open realtime connections and streams.",
      "# TYPE nama_realtime_connections gauge",
      `nama_realtime_connections ${this.realtimeConnections}`,
      "# HELP nama_uptime_seconds Seconds since the process started.",
      "# TYPE nama_uptime_seconds gauge",
      `nama_uptime_seconds ${((Date.now() - this.startedAt) / 1000).toFixed(3)}`,
      "",
    );
    return lines.join("\n");
  }

  private renderSamples(
    lines: string[],
    name: string,
    type: "counter" | "summary",
    help: string,
    samples: Map<string, Sample>,
  ): void {
    lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`);
    for (const sample of [...samples.values()].sort((a, b) =>
      formatLabels(a.labels).localeCompare(formatLabels(b.labels)),
    )) {
      lines.push(`${name}${formatLabels(sample.labels)} ${sample.value}`);
    }
  }
}

function increment(map: Map<string, Sample>, key: string, labels: LabelSet): void {
  const current = map.get(key);
  if (current) {
    current.value += 1;
    return;
  }
  map.set(key, { labels, value: 1 });
}

function add(
  map: Map<string, Sample>,
  key: string,
  amount: number,
  labels: LabelSet,
): void {
  const current = map.get(key);
  if (current) {
    current.value += amount;
    return;
  }
  map.set(key, { labels, value: amount });
}

function formatLabels(labels: LabelSet): string {
  if (labels.length === 0) return "";
  const body = labels.map(([name, value]) => `${name}="${escapeLabel(value)}"`).join(",");
  return `{${body}}`;
}

function escapeLabel(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll('"', '\\"');
}
