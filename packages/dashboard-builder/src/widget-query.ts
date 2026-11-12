import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buildControlledQueryRequest,
  queryKeyFor,
  queryKeyForRequest,
  type ErasedWidgetPlugin,
  type StreamState,
  type WidgetDataState,
  type WidgetError,
} from "@nama/dashboard-core";
import {
  REALTIME_DEFAULTS,
  type DashboardWidget,
  type DataEvent,
  type Unsubscribe,
} from "@nama/dashboard-types";

import { useDashboardRuntime } from "./context";
import { createQueryContext } from "./query-context";

const STREAM_BUFFER_SIZE = REALTIME_DEFAULTS.maxBufferedSamples;
/** At most four widget updates per second, whatever the source emits. */
const STREAM_FLUSH_MS = 250;
/** Relative ranges resolve against a pinned clock so the key stays stable. */
const KEY_CLOCK = new Date(0);

function toWidgetError(error: unknown): WidgetError {
  return { code: "INTERNAL", messageKey: "widget.error", details: error };
}

/**
 * Snapshot data comes from TanStack Query; stream events bypass the cache and
 * land in a bounded buffer, coalesced before they reach the widget. Dashboard
 * variables and filters resolve into the request in the SDK, so every adapter
 * sees the same controlled query.
 */
export function useWidgetQuery(
  widget: DashboardWidget,
  plugin: ErasedWidgetPlugin | undefined,
  enabled = true,
): WidgetDataState {
  const runtime = useDashboardRuntime();
  const queryClient = useQueryClient();
  const { config, controls } = runtime;
  const values = controls.values;
  const hasRequest = Boolean(widget.query && widget.dataSourceId);
  const supportsStream =
    plugin?.capabilities?.realtime === true && runtime.realtimeAdapter !== undefined;
  const [stream, setStream] = useState<StreamState | undefined>(undefined);
  const refreshInterval = config.settings.refreshInterval;

  // Control changes alter parameters, filters or the window, so the cache key
  // must include them; the pinned clock keeps relative ranges stable.
  const queryKey = useMemo(() => {
    const request = buildControlledQueryRequest(widget, config, {
      ...values,
      now: KEY_CLOCK,
    });
    return request ? queryKeyForRequest(request) : queryKeyFor(widget);
  }, [widget, config, values]);

  const query = useQuery({
    queryKey,
    enabled: enabled && hasRequest && plugin !== undefined,
    refetchInterval: refreshInterval > 0 ? refreshInterval * 1000 : false,
    queryFn: async ({ signal }) => {
      // Resolve the range per execution so relative windows keep advancing.
      const request = buildControlledQueryRequest(widget, config, values);
      if (!request) {
        throw new Error(`[nama] widget "${widget.id}" has no query to execute`);
      }
      return runtime.dataAdapter.execute(request, createQueryContext(runtime, signal));
    },
  });

  useEffect(() => {
    const adapter = runtime.realtimeAdapter;
    const request = buildControlledQueryRequest(widget, config, values);
    if (!enabled || !request || !supportsStream || !adapter) return;

    let active = true;
    let unsubscribe: Unsubscribe | undefined;
    let stale = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const buffer: DataEvent[] = [];
    const controller = new AbortController();
    const key = queryKey;

    const flush = () => {
      timer = undefined;
      if (!active) return;
      setStream({ latest: buffer.at(-1)?.data, buffered: buffer.length, stale });
    };

    const schedule = () => {
      if (timer === undefined) timer = setTimeout(flush, STREAM_FLUSH_MS);
    };

    const start = async () => {
      try {
        const stop = await adapter.subscribe(
          request,
          createQueryContext(runtime, controller.signal),
          {
            onSnapshot(result) {
              queryClient.setQueryData(key, result);
            },
            onData(event) {
              buffer.push(event);
              if (buffer.length > STREAM_BUFFER_SIZE) {
                buffer.splice(0, buffer.length - STREAM_BUFFER_SIZE);
              }
              schedule();
            },
            onGap() {
              stale = true;
              schedule();
              void queryClient.invalidateQueries({ queryKey: key });
            },
            onError() {
              stale = true;
              schedule();
            },
            onStatus(status) {
              if (status === "closed") {
                stale = true;
                schedule();
              }
            },
          },
        );

        if (!active) {
          void stop();
          return;
        }
        unsubscribe = stop;
      } catch {
        stale = true;
        schedule();
      }
    };

    void start();

    return () => {
      active = false;
      controller.abort();
      if (timer !== undefined) clearTimeout(timer);
      void unsubscribe?.();
    };
  }, [
    enabled,
    hasRequest,
    supportsStream,
    runtime,
    config,
    values,
    queryClient,
    queryKey,
    widget,
  ]);

  if (!hasRequest) return { status: "idle" };
  if (query.data !== undefined) {
    return {
      status: "ready",
      result: query.data,
      truncated: query.data.meta.truncated,
      lastUpdated: query.data.timestamp,
      ...(stream ? { stream } : {}),
    };
  }
  if (query.isError) return { status: "error", error: toWidgetError(query.error) };

  return { status: "loading" };
}
