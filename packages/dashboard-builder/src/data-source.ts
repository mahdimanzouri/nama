import { useMemo } from "react";
import { buildQueryRequest, type BuildQueryRequestOptions } from "@nama/dashboard-core";
import type {
  DashboardWidget,
  QueryResult,
  SubscriptionHandlers,
  Unsubscribe,
} from "@nama/dashboard-types";

import { useDashboardRuntime } from "./context";
import { createQueryContext } from "./query-context";

export interface DashboardDataSource {
  execute(
    widget: DashboardWidget,
    options?: BuildQueryRequestOptions,
  ): Promise<QueryResult>;
  subscribe(
    widget: DashboardWidget,
    handlers: SubscriptionHandlers,
    options?: BuildQueryRequestOptions,
  ): Promise<Unsubscribe>;
}

function missingQuery(widget: DashboardWidget): Error {
  return new Error(`[nama] widget "${widget.id}" has no query or data source to execute`);
}

/**
 * Facade over the injected adapter. Hosts and custom widgets use it instead of
 * calling `fetch` directly, so credentials stay in the host transport.
 */
export function useDataSource(): DashboardDataSource {
  const runtime = useDashboardRuntime();

  return useMemo<DashboardDataSource>(
    () => ({
      async execute(widget, options) {
        const request = buildQueryRequest(widget, options);
        if (!request) throw missingQuery(widget);

        return runtime.dataAdapter.execute(
          request,
          createQueryContext(runtime, new AbortController().signal),
        );
      },
      async subscribe(widget, handlers, options) {
        const request = buildQueryRequest(widget, options);
        if (!request) throw missingQuery(widget);
        if (!runtime.realtimeAdapter) {
          throw new Error("[nama] no realtime adapter was provided");
        }

        const controller = new AbortController();
        const unsubscribe = await runtime.realtimeAdapter.subscribe(
          request,
          createQueryContext(runtime, controller.signal),
          handlers,
        );

        return async () => {
          controller.abort();
          await unsubscribe();
        };
      },
    }),
    [runtime],
  );
}
