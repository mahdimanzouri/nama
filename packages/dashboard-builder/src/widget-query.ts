import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buildQueryRequest,
  queryKeyFor,
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

function toWidgetError(error: unknown): WidgetError {
  return { code: "INTERNAL", messageKey: "widget.error", details: error };
}

/**
 * Snapshot data comes from TanStack Query; stream events bypass the cache and
 * land in a bounded buffer, coalesced before they reach the widget.
 */
export function useWidgetQuery(
  widget: DashboardWidget,
  plugin: ErasedWidgetPlugin | undefined,
): WidgetDataState {
  const runtime = useDashboardRuntime();
  const queryClient = useQueryClient();
  const hasRequest = Boolean(widget.query && widget.dataSourceId);
  const supportsStream =
    plugin?.capabilities?.realtime === true && runtime.realtimeAdapter !== undefined;
  const [stream, setStream] = useState<StreamState | undefined>(undefined);
  const refreshInterval = runtime.config.settings.refreshInterval;

  const query = useQuery({
    queryKey: queryKeyFor(widget),
    enabled: hasRequest && plugin !== undefined,
    refetchInterval: refreshInterval > 0 ? refreshInterval * 1000 : false,
    queryFn: async ({ signal }) => {
      // Resolve the range per execution so relative windows keep advancing.
      const request = buildQueryRequest(widget);
      if (!request) {
        throw new Error(`[nama] widget "${widget.id}" has no query to execute`);
      }
      return runtime.dataAdapter.execute(request, createQueryContext(runtime, signal));
    },
  });

  useEffect(() => {
    const adapter = runtime.realtimeAdapter;
    const request = buildQueryRequest(widget);
    if (!request || !supportsStream || !adapter) return;

    let active = true;
    let unsubscribe: Unsubscribe | undefined;
    let stale = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const buffer: DataEvent[] = [];
    const controller = new AbortController();
    const key = queryKeyFor(widget);

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
  }, [hasRequest, supportsStream, runtime, queryClient, widget]);

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
