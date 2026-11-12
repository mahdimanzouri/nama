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
  permissions: string[];
  csrfToken: string;
  expiresAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
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

export interface ApiErrorBody {
  code: string;
  message: string;
  requestId?: string;
  fieldPaths?: Array<string | number>;
  issues?: ValidationIssue[];
  currentRevision?: number;
  retryAfterMs?: number;
}
