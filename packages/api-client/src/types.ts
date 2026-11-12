import type { DashboardConfig, ValidationIssue } from "@nama/dashboard-types";

export type { QueryRequest, QueryResult } from "@nama/dashboard-types";

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  locale: "en" | "fa";
  theme: "light" | "dark" | "system";
  timezone: string;
}

export interface SessionOrganization {
  id: string;
  name: string;
  slug: string;
}

export interface SessionPayload {
  user: SessionUser;
  organization: SessionOrganization;
  role: string;
  roleNames: string[];
  permissions: string[];
  csrfToken: string;
  expiresAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export type DashboardLocale = "en" | "fa";
export type DashboardTheme = "light" | "dark" | "system";

export interface Preferences {
  locale: DashboardLocale;
  theme: DashboardTheme;
  timezone: string;
  defaultOrganizationId: string | null;
}

export interface PreferencesUpdate {
  locale?: DashboardLocale;
  theme?: DashboardTheme;
  timezone?: string;
  defaultOrganizationId?: string;
}

export interface DashboardSummary {
  id: string;
  organizationId: string;
  name: string;
  revision: number;
  publishedRevision: number | null;
  updatedAt: string;
  publishedAt: string | null;
}

export interface DashboardView extends DashboardSummary {
  publishedConfig: DashboardConfig | null;
  permissions: string[];
}

export interface DashboardDraft {
  config: DashboardConfig;
  revision: number;
  updatedAt: string;
}

export interface DashboardList {
  items: DashboardSummary[];
  pagination: { page: number; pageSize: number; total: number };
}

export interface CreateDashboardRequest {
  name: string;
  description?: string;
}

export interface UpdateDashboardRequest {
  name?: string;
  metadata?: {
    title?: string;
    description?: string;
  };
}

export interface RevisionResponse {
  revision: number;
  updatedAt: string;
}

export interface DashboardVersionSummary {
  id: string;
  revision: number;
  title: string;
  createdAt: string;
}

export interface DashboardVersionList {
  items: DashboardVersionSummary[];
  pagination: { page: number; pageSize: number; total: number };
}

export interface DashboardShare {
  id?: string;
  subjectType: "user" | "role" | "organization";
  subjectId: string;
  permission: "view" | "edit";
}

export interface ShareList {
  items: DashboardShare[];
}

export interface EmbedTokenRequest {
  expiresInSeconds: number;
  viewerIdentity?: string;
  scope?: {
    variables?: Record<string, unknown>;
    filters?: Record<string, unknown>;
  };
}

export interface EmbedTokenIssued {
  id: string;
  token: string;
  expiresAt: string;
}

export type DataSourceKind = "postgres" | "mysql" | "rest" | "mqtt" | "static";

export interface DataSourceSummary {
  id: string;
  name: string;
  kind: DataSourceKind;
  status: "active" | "disabled" | "error";
  allowRawSql: boolean;
  updatedAt: string;
}

export interface DataSource extends DataSourceSummary {
  config: Record<string, unknown>;
}

export interface DataSourceCreateRequest {
  name: string;
  kind: DataSourceKind;
  config: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  allowRawSql?: boolean;
}

export interface DataSourceUpdateRequest {
  name?: string;
  config?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  allowRawSql?: boolean;
  status?: "active" | "disabled";
}

export interface DataSourceTestResult {
  ok: boolean;
  latencyMs?: number;
  message?: string;
  errorCode?: string;
}

export interface DataSourceList {
  items: DataSourceSummary[];
  pagination: { page: number; pageSize: number; total: number };
}

export interface Member {
  id: string;
  userId: string;
  email: string;
  displayName?: string;
  status: "invited" | "active" | "suspended";
  roles: string[];
}

export interface MemberCreateRequest {
  email: string;
  roleIds: string[];
}

export interface MemberUpdateRequest {
  roleIds?: string[];
  status?: "active" | "suspended";
}

export interface MemberList {
  items: Member[];
  pagination: { page: number; pageSize: number; total: number };
}

export interface Role {
  id: string;
  name: string;
  isSystem: boolean;
  permissions: string[];
}

export interface RoleCreateRequest {
  name: string;
  permissions: string[];
}

export interface RoleUpdateRequest {
  name?: string;
  permissions?: string[];
}

export interface RoleList {
  items: Role[];
}

export interface Permission {
  key: string;
  description?: string;
}

export interface PermissionList {
  items: Permission[];
}

export interface ApiErrorBody {
  code: string;
  message: string;
  requestId?: string;
  fieldPaths?: Array<string | number>;
  issues?: ValidationIssue[];
  currentRevision?: number;
  retryAfterMs?: number;
}
