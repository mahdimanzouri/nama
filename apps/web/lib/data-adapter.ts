import type { ApiClient } from "@nama/api-client";
import type { DataAdapter } from "@nama/dashboard-builder";

/**
 * Executes widget queries through the typed API client. Credentials and CSRF
 * stay in the host transport; the SDK only sees this interface.
 */
export function createHttpDataAdapter(client: ApiClient): DataAdapter {
  return {
    execute(request, context) {
      return client.executeQuery(request, { signal: context.signal });
    },
  };
}
