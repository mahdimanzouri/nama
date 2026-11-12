import type { QueryRequest, QueryResult } from "@nama/dashboard-types";

import { ApiError, RevisionConflictError } from "./errors.ts";
import type {
  ApiErrorBody,
  AuditEventFilter,
  AuditEventList,
  AuditExport,
  CreateDashboardRequest,
  DashboardDraft,
  DashboardList,
  DashboardShare,
  DashboardSummary,
  DashboardVersionList,
  DashboardView,
  DataSource,
  DataSourceCreateRequest,
  DataSourceList,
  DataSourceSchema,
  DataSourceTestResult,
  DataSourceUpdateRequest,
  EmbedTokenIssued,
  EmbedTokenRequest,
  LoginRequest,
  Member,
  MemberCreateRequest,
  MemberList,
  MemberUpdateRequest,
  PermissionList,
  Preferences,
  PreferencesUpdate,
  QueryValidationResult,
  RevisionResponse,
  Role,
  RoleCreateRequest,
  RoleList,
  RoleUpdateRequest,
  SessionPayload,
  ShareList,
  UpdateDashboardRequest,
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
  /**
   * Sent as `Idempotency-Key` on unsafe requests. Repeat the same key when
   * retrying so the API replays the stored response instead of repeating the
   * effect.
   */
  idempotencyKey?: string;
}

export interface ListOptions extends RequestOptions {
  page?: number;
  pageSize?: number;
}

export interface AuditEventListOptions extends ListOptions, AuditEventFilter {}

export type ListDashboardsOptions = ListOptions;

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
  updateDashboard(
    id: string,
    input: UpdateDashboardRequest,
    revision: number,
    options?: RequestOptions,
  ): Promise<DashboardSummary>;
  deleteDashboard(id: string, revision: number, options?: RequestOptions): Promise<void>;
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
  listDashboardVersions(
    id: string,
    options?: ListDashboardsOptions,
  ): Promise<DashboardVersionList>;
  restoreDashboardVersion(
    id: string,
    versionId: string,
    revision: number,
    options?: RequestOptions,
  ): Promise<DashboardDraft>;
  executeQuery(request: QueryRequest, options?: RequestOptions): Promise<QueryResult>;
  validateQuery(
    request: QueryRequest,
    options?: RequestOptions,
  ): Promise<QueryValidationResult>;
  listDashboardShares(id: string, options?: RequestOptions): Promise<ShareList>;
  replaceDashboardShares(
    id: string,
    shares: DashboardShare[],
    revision: number,
    options?: RequestOptions,
  ): Promise<ShareList>;
  issueEmbedToken(
    id: string,
    input: EmbedTokenRequest,
    options?: RequestOptions,
  ): Promise<EmbedTokenIssued>;
  revokeEmbedToken(id: string, tokenId: string, options?: RequestOptions): Promise<void>;
  listDataSources(options?: ListOptions): Promise<DataSourceList>;
  getDataSource(id: string, options?: RequestOptions): Promise<DataSource>;
  createDataSource(
    input: DataSourceCreateRequest,
    options?: RequestOptions,
  ): Promise<DataSource>;
  updateDataSource(
    id: string,
    input: DataSourceUpdateRequest,
    options?: RequestOptions,
  ): Promise<DataSource>;
  deleteDataSource(id: string, options?: RequestOptions): Promise<void>;
  testDataSource(id: string, options?: RequestOptions): Promise<DataSourceTestResult>;
  getDataSourceSchema(id: string, options?: RequestOptions): Promise<DataSourceSchema>;
  listMembers(organizationId: string, options?: ListOptions): Promise<MemberList>;
  inviteMember(
    organizationId: string,
    input: MemberCreateRequest,
    options?: RequestOptions,
  ): Promise<Member>;
  updateMember(
    organizationId: string,
    memberId: string,
    input: MemberUpdateRequest,
    options?: RequestOptions,
  ): Promise<Member>;
  removeMember(
    organizationId: string,
    memberId: string,
    options?: RequestOptions,
  ): Promise<void>;
  listRoles(organizationId: string, options?: RequestOptions): Promise<RoleList>;
  createRole(
    organizationId: string,
    input: RoleCreateRequest,
    options?: RequestOptions,
  ): Promise<Role>;
  updateRole(
    organizationId: string,
    roleId: string,
    input: RoleUpdateRequest,
    options?: RequestOptions,
  ): Promise<Role>;
  deleteRole(
    organizationId: string,
    roleId: string,
    options?: RequestOptions,
  ): Promise<void>;
  listEffectivePermissions(
    organizationId: string,
    options?: RequestOptions,
  ): Promise<PermissionList>;
  listAuditEvents(
    organizationId: string,
    options?: AuditEventListOptions,
  ): Promise<AuditEventList>;
  exportAuditEvents(
    organizationId: string,
    options?: AuditEventFilter & RequestOptions,
  ): Promise<AuditExport>;
  getPreferences(options?: RequestOptions): Promise<Preferences>;
  updatePreferences(
    input: PreferencesUpdate,
    options?: RequestOptions,
  ): Promise<Preferences>;
}

interface RequestInitOptions extends RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
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

function toApiError(status: number, payload: unknown): ApiError | RevisionConflictError {
  const body =
    (payload as { error?: ApiErrorBody } | undefined)?.error ?? fallbackBody(status);

  if (status === 409 && body.code === "REVISION_CONFLICT") {
    return new RevisionConflictError(409, {
      ...body,
      currentRevision: body.currentRevision ?? 0,
    });
  }

  return new ApiError(status, body);
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
    if (init.idempotencyKey !== undefined) {
      headers["idempotency-key"] = init.idempotencyKey;
    }

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

    if (!response.ok) throw toApiError(response.status, payload);

    return payload as T;
  }

  async function requestText(
    path: string,
    init: RequestInitOptions = {},
  ): Promise<{ body: string; headers: Headers }> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers: { accept: "text/csv" },
      credentials: "include",
      ...(init.signal ? { signal: init.signal } : {}),
    });

    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => undefined);
      throw toApiError(response.status, payload);
    }

    return { body: await response.text(), headers: response.headers };
  }

  function filenameFromDisposition(disposition: string | null): string | null {
    if (!disposition) return null;
    const match = /filename="?([^";]+)"?/u.exec(disposition);
    return match ? match[1]! : null;
  }

  function dashboardPath(id: string, suffix = ""): string {
    return `/v1/dashboards/${encodeURIComponent(id)}${suffix}`;
  }

  function organizationPath(id: string, suffix = ""): string {
    return `/v1/organizations/${encodeURIComponent(id)}${suffix}`;
  }

  function listQuery(options: ListOptions): string {
    const params = new URLSearchParams();
    if (options.page !== undefined) params.set("page", String(options.page));
    if (options.pageSize !== undefined) {
      params.set("pageSize", String(options.pageSize));
    }
    return params.size > 0 ? `?${params.toString()}` : "";
  }

  function auditQuery(filter: AuditEventFilter & ListOptions): string {
    const params = new URLSearchParams();
    if (filter.page !== undefined) params.set("page", String(filter.page));
    if (filter.pageSize !== undefined) {
      params.set("pageSize", String(filter.pageSize));
    }
    if (filter.action !== undefined) params.set("action", filter.action);
    if (filter.resourceType !== undefined) {
      params.set("resourceType", filter.resourceType);
    }
    if (filter.resourceId !== undefined) {
      params.set("resourceId", filter.resourceId);
    }
    if (filter.actorId !== undefined) params.set("actorId", filter.actorId);
    if (filter.from !== undefined) params.set("from", filter.from);
    if (filter.to !== undefined) params.set("to", filter.to);
    return params.size > 0 ? `?${params.toString()}` : "";
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

    listDashboardVersions(id, listOptions = {}) {
      const params = new URLSearchParams();
      if (listOptions.page !== undefined) params.set("page", String(listOptions.page));
      if (listOptions.pageSize !== undefined) {
        params.set("pageSize", String(listOptions.pageSize));
      }
      const query = params.size > 0 ? `?${params.toString()}` : "";

      return request<DashboardVersionList>(dashboardPath(id, `/versions${query}`), {
        ...(listOptions.signal ? { signal: listOptions.signal } : {}),
      });
    },

    restoreDashboardVersion(id, versionId, revision, requestOptions) {
      return request<DashboardDraft>(dashboardPath(id, "/restore"), {
        method: "POST",
        body: { versionId },
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

    validateQuery(queryRequest, requestOptions) {
      return request<QueryValidationResult>("/v1/queries/validate", {
        method: "POST",
        body: queryRequest,
        ...requestOptions,
      });
    },

    updateDashboard(id, input, revision, requestOptions) {
      return request<DashboardSummary>(dashboardPath(id), {
        method: "PATCH",
        body: input,
        revision,
        ...requestOptions,
      });
    },

    async deleteDashboard(id, revision, requestOptions) {
      await request<void>(dashboardPath(id), {
        method: "DELETE",
        revision,
        ...requestOptions,
      });
    },

    listDashboardShares(id, requestOptions) {
      return request<ShareList>(dashboardPath(id, "/shares"), { ...requestOptions });
    },

    replaceDashboardShares(id, shares, revision, requestOptions) {
      return request<ShareList>(dashboardPath(id, "/shares"), {
        method: "PUT",
        body: { shares },
        revision,
        ...requestOptions,
      });
    },

    issueEmbedToken(id, input, requestOptions) {
      return request<EmbedTokenIssued>(dashboardPath(id, "/embed-tokens"), {
        method: "POST",
        body: input,
        ...requestOptions,
      });
    },

    async revokeEmbedToken(id, tokenId, requestOptions) {
      await request<void>(
        dashboardPath(id, `/embed-tokens/${encodeURIComponent(tokenId)}`),
        { method: "DELETE", ...requestOptions },
      );
    },

    listDataSources(listOptions = {}) {
      return request<DataSourceList>(`/v1/data-sources${listQuery(listOptions)}`, {
        ...(listOptions.signal ? { signal: listOptions.signal } : {}),
      });
    },

    getDataSource(id, requestOptions) {
      return request<DataSource>(`/v1/data-sources/${encodeURIComponent(id)}`, {
        ...requestOptions,
      });
    },

    createDataSource(input, requestOptions) {
      return request<DataSource>("/v1/data-sources", {
        method: "POST",
        body: input,
        ...requestOptions,
      });
    },

    updateDataSource(id, input, requestOptions) {
      return request<DataSource>(`/v1/data-sources/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: input,
        ...requestOptions,
      });
    },

    async deleteDataSource(id, requestOptions) {
      await request<void>(`/v1/data-sources/${encodeURIComponent(id)}`, {
        method: "DELETE",
        ...requestOptions,
      });
    },

    testDataSource(id, requestOptions) {
      return request<DataSourceTestResult>(
        `/v1/data-sources/${encodeURIComponent(id)}/test`,
        { method: "POST", ...requestOptions },
      );
    },

    getDataSourceSchema(id, requestOptions) {
      return request<DataSourceSchema>(
        `/v1/data-sources/${encodeURIComponent(id)}/schema`,
        requestOptions ?? {},
      );
    },

    listMembers(organizationId, listOptions = {}) {
      return request<MemberList>(
        organizationPath(organizationId, `/members${listQuery(listOptions)}`),
        { ...(listOptions.signal ? { signal: listOptions.signal } : {}) },
      );
    },

    inviteMember(organizationId, input, requestOptions) {
      return request<Member>(organizationPath(organizationId, "/members"), {
        method: "POST",
        body: input,
        ...requestOptions,
      });
    },

    updateMember(organizationId, memberId, input, requestOptions) {
      return request<Member>(
        organizationPath(organizationId, `/members/${encodeURIComponent(memberId)}`),
        { method: "PATCH", body: input, ...requestOptions },
      );
    },

    async removeMember(organizationId, memberId, requestOptions) {
      await request<void>(
        organizationPath(organizationId, `/members/${encodeURIComponent(memberId)}`),
        { method: "DELETE", ...requestOptions },
      );
    },

    listRoles(organizationId, requestOptions) {
      return request<RoleList>(organizationPath(organizationId, "/roles"), {
        ...requestOptions,
      });
    },

    createRole(organizationId, input, requestOptions) {
      return request<Role>(organizationPath(organizationId, "/roles"), {
        method: "POST",
        body: input,
        ...requestOptions,
      });
    },

    updateRole(organizationId, roleId, input, requestOptions) {
      return request<Role>(
        organizationPath(organizationId, `/roles/${encodeURIComponent(roleId)}`),
        { method: "PATCH", body: input, ...requestOptions },
      );
    },

    async deleteRole(organizationId, roleId, requestOptions) {
      await request<void>(
        organizationPath(organizationId, `/roles/${encodeURIComponent(roleId)}`),
        { method: "DELETE", ...requestOptions },
      );
    },

    listEffectivePermissions(organizationId, requestOptions) {
      return request<PermissionList>(organizationPath(organizationId, "/permissions"), {
        ...requestOptions,
      });
    },

    listAuditEvents(organizationId, auditOptions = {}) {
      return request<AuditEventList>(
        organizationPath(organizationId, `/audit-events${auditQuery(auditOptions)}`),
        auditOptions.signal ? { signal: auditOptions.signal } : {},
      );
    },

    async exportAuditEvents(organizationId, exportOptions = {}) {
      const { body, headers } = await requestText(
        organizationPath(
          organizationId,
          `/audit-events/export${auditQuery(exportOptions)}`,
        ),
        exportOptions.signal ? { signal: exportOptions.signal } : {},
      );

      return {
        csv: body,
        truncated: headers.get("x-audit-export-truncated") === "true",
        filename: filenameFromDisposition(headers.get("content-disposition")),
      };
    },

    getPreferences(requestOptions) {
      return request<Preferences>("/v1/me/preferences", { ...requestOptions });
    },

    updatePreferences(input, requestOptions) {
      return request<Preferences>("/v1/me/preferences", {
        method: "PATCH",
        body: input,
        ...requestOptions,
      });
    },
  };
}
