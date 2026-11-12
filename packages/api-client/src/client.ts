import type { QueryRequest, QueryResult } from "@nama/dashboard-types";

import { ApiError, RevisionConflictError } from "./errors.ts";
import type {
  ApiErrorBody,
  CreateDashboardRequest,
  DashboardDraft,
  DashboardList,
  DashboardView,
  LoginRequest,
  RevisionResponse,
  SessionPayload,
} from "./types.ts";

export interface ApiClientOptions {
  /** Defaults to `/api`, which the host proxies to the API service. */
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  /** Overrides CSRF discovery; defaults to the `nama_csrf` cookie in a browser. */
  csrfToken?: () => string | undefined | Promise<string | undefined>;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface ListDashboardsOptions extends RequestOptions {
  page?: number;
  pageSize?: number;
}

export interface ApiClient {
  login(input: LoginRequest, options?: RequestOptions): Promise<SessionPayload>;
  logout(options?: RequestOptions): Promise<void>;
  getSession(options?: RequestOptions): Promise<SessionPayload>;
  listDashboards(options?: ListDashboardsOptions): Promise<DashboardList>;
  createDashboard(
    input: CreateDashboardRequest,
    options?: RequestOptions,
  ): Promise<DashboardView>;
  getDashboard(id: string, options?: RequestOptions): Promise<DashboardView>;
  getDashboardDraft(id: string, options?: RequestOptions): Promise<DashboardDraft>;
  saveDashboardDraft(
    id: string,
    config: DashboardDraft["config"],
    revision: number,
    options?: RequestOptions,
  ): Promise<RevisionResponse>;
  publishDashboard(
    id: string,
    revision: number,
    options?: RequestOptions,
  ): Promise<DashboardView>;
  executeQuery(request: QueryRequest, options?: RequestOptions): Promise<QueryResult>;
}

interface RequestInitOptions extends RequestOptions {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
  revision?: number;
}

function readCsrfCookie(): string | undefined {
  if (typeof document === "undefined") return undefined;

  const entry = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("nama_csrf="));

  return entry ? decodeURIComponent(entry.slice("nama_csrf=".length)) : undefined;
}

function fallbackBody(status: number): ApiErrorBody {
  return {
    code: status >= 500 ? "INTERNAL" : "REQUEST_FAILED",
    message: `The API responded with ${status}`,
  };
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = (options.baseUrl ?? "/api").replace(/\/$/u, "");
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const csrfToken = options.csrfToken ?? readCsrfCookie;

  async function request<T>(path: string, init: RequestInitOptions = {}): Promise<T> {
    const method = init.method ?? "GET";
    const headers: Record<string, string> = { accept: "application/json" };

    if (init.body !== undefined) headers["content-type"] = "application/json";
    if (init.revision !== undefined) headers["if-match"] = `"${init.revision}"`;

    if (method !== "GET") {
      const token = await csrfToken();
      if (token) headers["x-csrf-token"] = token;
    }

    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers,
      credentials: "include",
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      ...(init.signal ? { signal: init.signal } : {}),
    });

    if (response.status === 204) return undefined as T;

    const payload: unknown = await response.json().catch(() => undefined);

    if (!response.ok) {
      const body =
        (payload as { error?: ApiErrorBody } | undefined)?.error ??
        fallbackBody(response.status);

      if (response.status === 409 && body.code === "REVISION_CONFLICT") {
        throw new RevisionConflictError(409, {
          ...body,
          currentRevision: body.currentRevision ?? 0,
        });
      }

      throw new ApiError(response.status, body);
    }

    return payload as T;
  }

  function dashboardPath(id: string, suffix = ""): string {
    return `/v1/dashboards/${encodeURIComponent(id)}${suffix}`;
  }

  return {
    login(input, requestOptions) {
      return request<SessionPayload>("/v1/auth/login", {
        method: "POST",
        body: input,
        ...requestOptions,
      });
    },

    async logout(requestOptions) {
      await request<void>("/v1/auth/logout", { method: "POST", ...requestOptions });
    },

    getSession(requestOptions) {
      return request<SessionPayload>("/v1/auth/session", { ...requestOptions });
    },

    listDashboards(listOptions = {}) {
      const params = new URLSearchParams();
      if (listOptions.page !== undefined) params.set("page", String(listOptions.page));
      if (listOptions.pageSize !== undefined) {
        params.set("pageSize", String(listOptions.pageSize));
      }
      const query = params.size > 0 ? `?${params.toString()}` : "";

      return request<DashboardList>(`/v1/dashboards${query}`, {
        ...(listOptions.signal ? { signal: listOptions.signal } : {}),
      });
    },

    createDashboard(input, requestOptions) {
      return request<DashboardView>("/v1/dashboards", {
        method: "POST",
        body: input,
        ...requestOptions,
      });
    },

    getDashboard(id, requestOptions) {
      return request<DashboardView>(dashboardPath(id), { ...requestOptions });
    },

    getDashboardDraft(id, requestOptions) {
      return request<DashboardDraft>(dashboardPath(id, "/draft"), {
        ...requestOptions,
      });
    },

    saveDashboardDraft(id, config, revision, requestOptions) {
      return request<RevisionResponse>(dashboardPath(id, "/draft"), {
        method: "PUT",
        body: { config },
        revision,
        ...requestOptions,
      });
    },

    publishDashboard(id, revision, requestOptions) {
      return request<DashboardView>(dashboardPath(id, "/publish"), {
        method: "POST",
        revision,
        ...requestOptions,
      });
    },

    executeQuery(queryRequest, requestOptions) {
      return request<QueryResult>("/v1/queries/execute", {
        method: "POST",
        body: queryRequest,
        ...requestOptions,
      });
    },
  };
}
