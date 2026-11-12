import type { DashboardConfig, PlatformId } from "@nama/dashboard-types";

export type Locale = "en" | "fa";
export type Theme = "light" | "dark" | "system";

export interface UserRecord {
  id: PlatformId;
  email: string;
  passwordHash: string;
  displayName: string;
  status: "active" | "disabled";
}

export interface UserPreferenceRecord {
  userId: PlatformId;
  locale: Locale;
  theme: Theme;
  timezone: string;
  defaultOrganizationId: PlatformId | null;
}

export interface OrganizationRecord {
  id: PlatformId;
  name: string;
  slug: string;
}

export interface MembershipRecord {
  id: PlatformId;
  organizationId: PlatformId;
  userId: PlatformId;
  status: "invited" | "active" | "suspended";
  createdAt: string;
}

export interface RoleRecord {
  id: PlatformId;
  organizationId: PlatformId;
  name: string;
  isSystem: boolean;
  permissions: string[];
}

export interface PermissionRecord {
  id: PlatformId;
  name: string;
  description: string;
}

export interface SessionRecord {
  id: PlatformId;
  tokenHash: string;
  csrfToken: string;
  userId: PlatformId;
  organizationId: PlatformId;
  createdAt: string;
  expiresAt: string;
}

export interface DashboardRecord {
  id: PlatformId;
  organizationId: PlatformId;
  name: string;
  draftConfig: DashboardConfig;
  publishedConfig: DashboardConfig | null;
  revision: number;
  publishedRevision: number | null;
  createdBy: PlatformId;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface DashboardVersionRecord {
  id: PlatformId;
  dashboardId: PlatformId;
  organizationId: PlatformId;
  revision: number;
  config: DashboardConfig;
  createdBy: PlatformId;
  createdAt: string;
}

export interface DashboardShareRecord {
  id: PlatformId;
  organizationId: PlatformId;
  dashboardId: PlatformId;
  subjectType: "user" | "role" | "organization";
  subjectId: PlatformId;
  permission: "view" | "edit";
  createdAt: string;
}

export type DataSourceKind = "postgres" | "mysql" | "rest" | "mqtt" | "static";

export interface DataSourceRecord {
  id: PlatformId;
  organizationId: PlatformId;
  name: string;
  kind: DataSourceKind;
  config: Record<string, unknown>;
  allowRawSql: boolean;
  limits: Record<string, unknown>;
  status: "active" | "disabled" | "error";
  createdAt: string;
  updatedAt: string;
}

export interface DataSourceCredentialRecord {
  dataSourceId: PlatformId;
  organizationId: PlatformId;
  ciphertext: Buffer;
  keyVersion: number;
  createdAt: string;
  rotatedAt: string | null;
}

export interface EmbedTokenRecord {
  id: PlatformId;
  dashboardId: PlatformId;
  organizationId: PlatformId;
  tokenHash: Buffer;
  issuedBy: PlatformId;
  viewerIdentity: string | null;
  scope: Record<string, unknown>;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface AuditEventInput {
  organizationId: PlatformId;
  actorType: "user" | "embed" | "system";
  actorId: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  requestId: string;
}

export interface AuthMembership {
  membership: MembershipRecord;
  roleNames: string[];
  permissions: string[];
}

export interface MemberWithUser {
  membership: MembershipRecord;
  user: UserRecord;
  roleNames: string[];
  roleIds: string[];
}

export interface TenantScope {
  organizationId: PlatformId;
  userId: PlatformId | null;
}

export type RevisionWriteResult =
  | { status: "ok"; record: DashboardRecord }
  | { status: "conflict"; currentRevision: number }
  | { status: "missing" };

export interface PageRequest {
  offset: number;
  limit: number;
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: PlatformId): Promise<UserRecord | null>;
  getPreferences(userId: PlatformId): Promise<UserPreferenceRecord | null>;
  updatePreferences(
    userId: PlatformId,
    patch: Partial<Omit<UserPreferenceRecord, "userId">>,
  ): Promise<UserPreferenceRecord>;
}

export interface SessionRepository {
  create(session: SessionRecord): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  deleteByTokenHash(tokenHash: string): Promise<void>;
  deleteExpired(now: Date): Promise<void>;
}

export interface OrganizationRepository {
  findById(id: PlatformId): Promise<OrganizationRecord | null>;
  create(record: OrganizationRecord): Promise<void>;
}

export interface MembershipRepository {
  findActive(
    userId: PlatformId,
    organizationId: PlatformId,
  ): Promise<AuthMembership | null>;
  findFirstActive(userId: PlatformId): Promise<AuthMembership | null>;
  list(
    organizationId: PlatformId,
    page: PageRequest,
  ): Promise<{ items: MemberWithUser[]; total: number }>;
  find(
    organizationId: PlatformId,
    membershipId: PlatformId,
  ): Promise<MemberWithUser | null>;
  create(input: {
    organizationId: PlatformId;
    user: { id: PlatformId; email: string; passwordHash: string; displayName: string };
    roleIds: PlatformId[];
    status: "invited" | "active";
    createdAt: string;
  }): Promise<MemberWithUser>;
  update(input: {
    organizationId: PlatformId;
    membershipId: PlatformId;
    status?: "active" | "suspended";
    roleIds?: PlatformId[];
  }): Promise<MemberWithUser | null>;
  remove(organizationId: PlatformId, membershipId: PlatformId): Promise<boolean>;
}

export interface RoleRepository {
  list(organizationId: PlatformId): Promise<RoleRecord[]>;
  find(organizationId: PlatformId, roleId: PlatformId): Promise<RoleRecord | null>;
  create(input: {
    organizationId: PlatformId;
    name: string;
    permissions: string[];
  }): Promise<RoleRecord>;
  update(input: {
    organizationId: PlatformId;
    roleId: PlatformId;
    name?: string;
    permissions?: string[];
  }): Promise<RoleRecord | null>;
  remove(
    organizationId: PlatformId,
    roleId: PlatformId,
  ): Promise<"deleted" | "missing" | "in-use">;
  resolvePermissions(
    organizationId: PlatformId,
    roleIds: PlatformId[],
  ): Promise<string[]>;
}

export interface DashboardRepository {
  list(
    organizationId: PlatformId,
    page: PageRequest,
  ): Promise<{ items: DashboardRecord[]; total: number }>;
  find(organizationId: PlatformId, id: PlatformId): Promise<DashboardRecord | null>;
  create(record: DashboardRecord): Promise<void>;
  saveDraft(input: {
    organizationId: PlatformId;
    id: PlatformId;
    expectedRevision: number;
    config: DashboardConfig;
    now: string;
  }): Promise<RevisionWriteResult>;
  publish(input: {
    organizationId: PlatformId;
    id: PlatformId;
    expectedRevision: number;
    actorId: PlatformId;
    now: string;
    versionId: PlatformId;
    keepVersions: number;
  }): Promise<RevisionWriteResult>;
  restoreDraft(input: {
    organizationId: PlatformId;
    id: PlatformId;
    expectedRevision: number;
    versionId: PlatformId;
    now: string;
  }): Promise<RevisionWriteResult>;
  rename(
    organizationId: PlatformId,
    id: PlatformId,
    name: string,
  ): Promise<DashboardRecord | null>;
  remove(organizationId: PlatformId, id: PlatformId): Promise<boolean>;
  listVersions(
    organizationId: PlatformId,
    dashboardId: PlatformId,
    page: PageRequest,
  ): Promise<{ items: DashboardVersionRecord[]; total: number }>;
}

export interface ShareRepository {
  list(
    organizationId: PlatformId,
    dashboardId: PlatformId,
  ): Promise<DashboardShareRecord[]>;
  replace(
    organizationId: PlatformId,
    dashboardId: PlatformId,
    shares: Array<{
      id?: PlatformId;
      subjectType: DashboardShareRecord["subjectType"];
      subjectId: PlatformId;
      permission: DashboardShareRecord["permission"];
    }>,
    now: string,
  ): Promise<DashboardShareRecord[]>;
}

export interface EmbedTokenRepository {
  create(record: EmbedTokenRecord): Promise<EmbedTokenRecord>;
  list(organizationId: PlatformId, dashboardId: PlatformId): Promise<EmbedTokenRecord[]>;
  revoke(
    organizationId: PlatformId,
    dashboardId: PlatformId,
    tokenId: PlatformId,
    now: string,
  ): Promise<boolean>;
  findByHash(tokenHash: Buffer): Promise<EmbedTokenRecord | null>;
}

export interface DataSourceRepository {
  list(
    organizationId: PlatformId,
    page: PageRequest,
  ): Promise<{ items: DataSourceRecord[]; total: number }>;
  find(organizationId: PlatformId, id: PlatformId): Promise<DataSourceRecord | null>;
  create(record: DataSourceRecord): Promise<DataSourceRecord>;
  update(
    organizationId: PlatformId,
    id: PlatformId,
    patch: Partial<
      Pick<DataSourceRecord, "name" | "config" | "allowRawSql" | "limits" | "status">
    >,
  ): Promise<DataSourceRecord | null>;
  remove(organizationId: PlatformId, id: PlatformId): Promise<boolean>;
  saveCredential(record: DataSourceCredentialRecord): Promise<void>;
  getCredential(
    organizationId: PlatformId,
    dataSourceId: PlatformId,
  ): Promise<DataSourceCredentialRecord | null>;
}

export interface AuditRepository {
  record(event: AuditEventInput): Promise<void>;
}

/** Persistence facade used by every module. */
export interface Persistence {
  readonly kind: "memory" | "postgres";
  users: UserRepository;
  sessions: SessionRepository;
  organizations: OrganizationRepository;
  memberships: MembershipRepository;
  roles: RoleRepository;
  dashboards: DashboardRepository;
  shares: ShareRepository;
  embedTokens: EmbedTokenRepository;
  dataSources: DataSourceRepository;
  audit: AuditRepository;
  permissions(): Promise<PermissionRecord[]>;
  /** Probes the backing store for `/readyz`; throws or resolves false. */
  ready(): Promise<boolean>;
  /** Runs `fn` with the tenant context applied to the database session. */
  withTenant<T>(scope: TenantScope, fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
