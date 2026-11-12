import { createHttpDataAdapter } from "@nama/dashboard-core";
import type { DataAdapter } from "@nama/dashboard-builder";

function readCsrfCookie(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const entry = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("nama_csrf="));
  return entry ? decodeURIComponent(entry.slice("nama_csrf=".length)) : undefined;
}

/**
 * Same-origin adapter over `POST /api/v1/queries/execute`. CSRF stays in the
 * host transport; the SDK only sees the `DataAdapter` interface.
 */
export function createAdapter(): DataAdapter {
  return createHttpDataAdapter({
    baseUrl: "/api",
    csrfToken: readCsrfCookie,
  });
}
