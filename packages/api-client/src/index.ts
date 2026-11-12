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
  AuditEventListOptions,
  ListDashboardsOptions,
  ListOptions,
  RequestOptions,
} from "./client";
export { ApiError, RevisionConflictError } from "./errors";
export type {
  ApiErrorBody,
  AuditEvent,
  AuditEventFilter,
  AuditEventList,
  AuditExport,
  CreateDashboardRequest,
  DashboardDraft,
  DashboardList,
  DashboardLocale,
  DashboardShare,
  DashboardSummary,
  DashboardTheme,
  DashboardVersionList,
  DashboardVersionSummary,
  DashboardView,
  DataSource,
  DataSourceCreateRequest,
  DataSourceKind,
  DataSourceList,
  DataSourceSummary,
  DataSourceTestResult,
  DataSourceUpdateRequest,
  EmbedTokenIssued,
  EmbedTokenRequest,
  LoginRequest,
  Member,
  MemberCreateRequest,
  MemberList,
  MemberUpdateRequest,
  Permission,
  PermissionList,
  Preferences,
  PreferencesUpdate,
  QueryRequest,
  QueryResult,
  RevisionResponse,
  Role,
  RoleCreateRequest,
  RoleList,
  RoleUpdateRequest,
  SessionOrganization,
  SessionPayload,
  SessionUser,
  ShareList,
  UpdateDashboardRequest,
} from "./types";
