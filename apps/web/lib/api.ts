import { createApiClient } from "@nama/api-client";

import { createHttpDataAdapter } from "./data-adapter";

/** Same-origin base URL; `next.config.ts` proxies `/api/*` to the API service. */
export const apiClient = createApiClient({ baseUrl: "/api" });

export const dataAdapter = createHttpDataAdapter(apiClient);
