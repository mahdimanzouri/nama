/**
 * Typed transport client for the platform API.
 *
 * The client handles cookie credentials, CSRF headers, `If-Match` revision
 * headers and error-envelope mapping. It is hand-written for the M3.5 slice;
 * M6 may generate it from the OpenAPI document once the contract settles.
 */
export { createApiClient } from "./client";
export type {
  ApiClient,
  ApiClientOptions,
  ListDashboardsOptions,
  RequestOptions,
} from "./client";
export { ApiError, RevisionConflictError } from "./errors";
export type {
  ApiErrorBody,
  CreateDashboardRequest,
  DashboardDraft,
  DashboardList,
  DashboardSummary,
  DashboardView,
  LoginRequest,
  QueryRequest,
  QueryResult,
  RevisionResponse,
  SessionOrganization,
  SessionPayload,
  SessionUser,
} from "./types";
