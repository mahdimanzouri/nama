import { hashSync } from "@node-rs/argon2";
import { createId } from "@nama/dashboard-types";

import type { Env } from "../../env.ts";
import { PERMISSIONS, SYSTEM_ROLES } from "../rbac.ts";
import type {
  AuthMembership,
  DashboardRecord,
  DataSourceRecord,
  EmbedTokenRecord,
  MemberWithUser,
  MembershipRecord,
  OrganizationRecord,
  PageRequest,
  Persistence,
  RoleRecord,
  SessionRecord,
  UserPreferenceRecord,
  UserRecord,
} from "./types.ts";

const passwordHashes = new Map<string, string>();

function demoHash(password: string): string {
  const cached = passwordHashes.get(password);
  if (cached) return cached;
  const hash = hashSync(password);
  passwordHashes.set(password, hash);
  return hash;
}

interface MemoryState {
  users: Map<string, UserRecord>;
  preferences: Map<string, UserPreferenceRecord>;
  organizations: Map<string, OrganizationRecord>;
  memberships: MembershipRecord[];
  membershipRoles: Map<string, string[]>;
  roles: Map<string, RoleRecord>;
  sessions: Map<string, SessionRecord>;
  dashboards: Map<string, DashboardRecord>;
  versions: Array<{
    id: string;
    dashboardId: string;
    organizationId: string;
    revision: number;
    config: DashboardRecord["draftConfig"];
    createdBy: string;
    createdAt: string;
  }>;
  shares: Array<{
    id: string;
    organizationId: string;
    dashboardId: string;
    subjectType: "user" | "role" | "organization";
    subjectId: string;
    permission: "view" | "edit";
    createdAt: string;
  }>;
  embedTokens: EmbedTokenRecord[];
  dataSources: Map<string, DataSourceRecord>;
  credentials: Map<
    string,
    {
      ciphertext: Buffer;
      keyVersion: number;
      createdAt: string;
      rotatedAt: string | null;
    }
  >;
  audit: unknown[];
}

function seedState(env: Env): MemoryState {
  const organization: OrganizationRecord = {
    id: createId(),
    name: "Nama Demo",
    slug: "nama-demo",
  };

  const editor: UserRecord = {
    id: createId(),
    email: env.DEMO_EDITOR_EMAIL.toLowerCase(),
    passwordHash: demoHash(env.DEMO_EDITOR_PASSWORD),
    displayName: "Demo Editor",
    status: "active",
  };

  const viewer: UserRecord = {
    id: createId(),
    email: env.DEMO_VIEWER_EMAIL.toLowerCase(),
    passwordHash: demoHash(env.DEMO_VIEWER_PASSWORD),
    displayName: "Demo Viewer",
    status: "active",
  };

  const preferences = new Map<string, UserPreferenceRecord>();
  for (const user of [editor, viewer]) {
    preferences.set(user.id, {
      userId: user.id,
      locale: "en",
      theme: "system",
      timezone: "UTC",
      defaultOrganizationId: organization.id,
    });
  }

  const roles = new Map<string, RoleRecord>();
  const roleIdsByName = new Map<string, string>();
  for (const [name, permissions] of Object.entries(SYSTEM_ROLES)) {
    const role: RoleRecord = {
      id: createId(),
      organizationId: organization.id,
      name,
      isSystem: true,
      permissions: [...permissions],
    };
    roles.set(role.id, role);
    roleIdsByName.set(name, role.id);
  }

  const createdAt = new Date().toISOString();
  const memberships: MembershipRecord[] = [
    {
      id: createId(),
      organizationId: organization.id,
      userId: editor.id,
      status: "active",
      createdAt,
    },
    {
      id: createId(),
      organizationId: organization.id,
      userId: viewer.id,
      status: "active",
      createdAt,
    },
  ];

  const membershipRoles = new Map<string, string[]>();
  membershipRoles.set(memberships[0]!.id, [roleIdsByName.get("editor")!]);
  membershipRoles.set(memberships[1]!.id, [roleIdsByName.get("viewer")!]);

  return {
    users: new Map([
      [editor.id, editor],
      [viewer.id, viewer],
    ]),
    preferences,
    organizations: new Map([[organization.id, organization]]),
    memberships,
    roles,
    sessions: new Map(),
    dashboards: new Map(),
    versions: [],
    shares: [],
    embedTokens: [],
    dataSources: new Map(),
    credentials: new Map(),
    audit: [],
    membershipRoles,
  };
}

type MemoryStateWithRoles = MemoryState;

function roleIdsFor(state: MemoryStateWithRoles, membershipId: string): string[] {
  return state.membershipRoles.get(membershipId) ?? [];
}

function permissionsFor(state: MemoryStateWithRoles, membershipId: string): string[] {
  const names = new Set<string>();
  for (const roleId of roleIdsFor(state, membershipId)) {
    const role = state.roles.get(roleId);
    for (const permission of role?.permissions ?? []) names.add(permission);
  }
  return [...names].sort();
}

function toAuthMembership(
  state: MemoryStateWithRoles,
  membership: MembershipRecord,
): AuthMembership {
  const roleIds = roleIdsFor(state, membership.id);
  return {
    membership,
    roleNames: roleIds
      .map((roleId) => state.roles.get(roleId)?.name)
      .filter((name): name is string => Boolean(name)),
    permissions: permissionsFor(state, membership.id),
  };
}

function toMember(
  state: MemoryStateWithRoles,
  membership: MembershipRecord,
): MemberWithUser | null {
  const user = state.users.get(membership.userId);
  if (!user) return null;
  const roleIds = roleIdsFor(state, membership.id);
  return {
    membership,
    user,
    roleIds,
    roleNames: roleIds
      .map((roleId) => state.roles.get(roleId)?.name)
      .filter((name): name is string => Boolean(name)),
  };
}

function cloneConfig<T>(value: T): T {
  return structuredClone(value);
}

export function createMemoryPersistence(env: Env): Persistence {
  const state = seedState(env) as MemoryStateWithRoles;

  const users = {
    async findByEmail(email: string): Promise<UserRecord | null> {
      const normalized = email.trim().toLowerCase();
      return [...state.users.values()].find((user) => user.email === normalized) ?? null;
    },
    async findById(id: string): Promise<UserRecord | null> {
      return state.users.get(id) ?? null;
    },
    async getPreferences(userId: string): Promise<UserPreferenceRecord | null> {
      return state.preferences.get(userId) ?? null;
    },
    async updatePreferences(
      userId: string,
      patch: Partial<Omit<UserPreferenceRecord, "userId">>,
    ): Promise<UserPreferenceRecord> {
      const current = state.preferences.get(userId) ?? {
        userId,
        locale: "en" as const,
        theme: "system" as const,
        timezone: "UTC",
        defaultOrganizationId: null,
      };
      const next = { ...current, ...patch, userId };
      state.preferences.set(userId, next);
      return next;
    },
  };

  const sessions = {
    async create(session: SessionRecord): Promise<void> {
      state.sessions.set(session.tokenHash, session);
    },
    async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
      return state.sessions.get(tokenHash) ?? null;
    },
    async deleteByTokenHash(tokenHash: string): Promise<void> {
      state.sessions.delete(tokenHash);
    },
    async deleteExpired(now: Date): Promise<void> {
      for (const [hash, session] of state.sessions) {
        if (Date.parse(session.expiresAt) <= now.getTime()) state.sessions.delete(hash);
      }
    },
  };

  const organizations = {
    async findById(id: string): Promise<OrganizationRecord | null> {
      return state.organizations.get(id) ?? null;
    },
    async create(record: OrganizationRecord): Promise<void> {
      state.organizations.set(record.id, record);
    },
  };

  const memberships = {
    async findActive(
      userId: string,
      organizationId: string,
    ): Promise<AuthMembership | null> {
      const membership = state.memberships.find(
        (candidate) =>
          candidate.userId === userId &&
          candidate.organizationId === organizationId &&
          candidate.status === "active",
      );
      if (!membership) return null;
      return toAuthMembership(state, membership);
    },
    async findFirstActive(userId: string): Promise<AuthMembership | null> {
      const membership = state.memberships
        .filter(
          (candidate) => candidate.userId === userId && candidate.status === "active",
        )
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
      return membership ? toAuthMembership(state, membership) : null;
    },
    async list(organizationId: string, page: PageRequest) {
      const all = state.memberships.filter(
        (membership) => membership.organizationId === organizationId,
      );
      const items = all
        .slice(page.offset, page.offset + page.limit)
        .map((membership) => toMember(state, membership))
        .filter((member): member is MemberWithUser => member !== null);
      return { items, total: all.length };
    },
    async find(organizationId: string, membershipId: string) {
      const membership = state.memberships.find(
        (candidate) =>
          candidate.id === membershipId && candidate.organizationId === organizationId,
      );
      return membership ? toMember(state, membership) : null;
    },
    async create(input: {
      organizationId: string;
      user: { id: string; email: string; passwordHash: string; displayName: string };
      roleIds: string[];
      status: "invited" | "active";
      createdAt: string;
    }) {
      const user: UserRecord = {
        id: input.user.id,
        email: input.user.email.toLowerCase(),
        passwordHash: input.user.passwordHash,
        displayName: input.user.displayName,
        status: "active",
      };
      state.users.set(user.id, user);
      const membership: MembershipRecord = {
        id: createId(),
        organizationId: input.organizationId,
        userId: user.id,
        status: input.status,
        createdAt: input.createdAt,
      };
      state.memberships.push(membership);
      state.membershipRoles.set(membership.id, [...input.roleIds]);
      state.preferences.set(user.id, {
        userId: user.id,
        locale: "en",
        theme: "system",
        timezone: "UTC",
        defaultOrganizationId: input.organizationId,
      });
      return toMember(state, membership)!;
    },
    async update(input: {
      organizationId: string;
      membershipId: string;
      status?: "active" | "suspended";
      roleIds?: string[];
    }) {
      const membership = state.memberships.find(
        (candidate) =>
          candidate.id === input.membershipId &&
          candidate.organizationId === input.organizationId,
      );
      if (!membership) return null;
      if (input.status) membership.status = input.status;
      if (input.roleIds) state.membershipRoles.set(membership.id, [...input.roleIds]);
      return toMember(state, membership);
    },
    async remove(organizationId: string, membershipId: string): Promise<boolean> {
      const index = state.memberships.findIndex(
        (candidate) =>
          candidate.id === membershipId && candidate.organizationId === organizationId,
      );
      if (index < 0) return false;
      state.memberships.splice(index, 1);
      state.membershipRoles.delete(membershipId);
      return true;
    },
  };

  const roles = {
    async list(organizationId: string): Promise<RoleRecord[]> {
      return [...state.roles.values()]
        .filter((role) => role.organizationId === organizationId)
        .sort((left, right) => left.name.localeCompare(right.name));
    },
    async find(organizationId: string, roleId: string): Promise<RoleRecord | null> {
      const role = state.roles.get(roleId);
      return role && role.organizationId === organizationId ? role : null;
    },
    async create(input: { organizationId: string; name: string; permissions: string[] }) {
      const role: RoleRecord = {
        id: createId(),
        organizationId: input.organizationId,
        name: input.name,
        isSystem: false,
        permissions: [...new Set(input.permissions)].sort(),
      };
      state.roles.set(role.id, role);
      return role;
    },
    async update(input: {
      organizationId: string;
      roleId: string;
      name?: string;
      permissions?: string[];
    }) {
      const role = state.roles.get(input.roleId);
      if (!role || role.organizationId !== input.organizationId || role.isSystem) {
        return null;
      }
      if (input.name) role.name = input.name;
      if (input.permissions) role.permissions = [...new Set(input.permissions)].sort();
      return role;
    },
    async remove(organizationId: string, roleId: string) {
      const role = state.roles.get(roleId);
      if (!role || role.organizationId !== organizationId) return "missing" as const;
      if (role.isSystem) return "in-use" as const;
      const assigned = [...state.membershipRoles.values()].some((ids) =>
        ids.includes(roleId),
      );
      if (assigned) return "in-use" as const;
      state.roles.delete(roleId);
      return "deleted" as const;
    },
    async resolvePermissions(organizationId: string, roleIds: string[]) {
      const names = new Set<string>();
      for (const roleId of roleIds) {
        const role = state.roles.get(roleId);
        if (role?.organizationId !== organizationId) continue;
        for (const permission of role.permissions) names.add(permission);
      }
      return [...names].sort();
    },
  };

  const dashboards = {
    async list(organizationId: string, page: PageRequest) {
      const all = [...state.dashboards.values()]
        .filter((record) => record.organizationId === organizationId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      return {
        items: all.slice(page.offset, page.offset + page.limit),
        total: all.length,
      };
    },
    async find(organizationId: string, id: string): Promise<DashboardRecord | null> {
      const record = state.dashboards.get(id);
      return record && record.organizationId === organizationId ? record : null;
    },
    async create(record: DashboardRecord): Promise<void> {
      state.dashboards.set(record.id, record);
    },
    async saveDraft(input: {
      organizationId: string;
      id: string;
      expectedRevision: number;
      config: DashboardRecord["draftConfig"];
      now: string;
    }) {
      const record = await this.find(input.organizationId, input.id);
      if (!record) return { status: "missing" as const };
      if (record.revision !== input.expectedRevision) {
        return { status: "conflict" as const, currentRevision: record.revision };
      }
      record.draftConfig = cloneConfig(input.config);
      record.name = input.config.metadata.title;
      record.revision += 1;
      record.updatedAt = input.now;
      return { status: "ok" as const, record };
    },
    async publish(input: {
      organizationId: string;
      id: string;
      expectedRevision: number;
      actorId: string;
      now: string;
      versionId: string;
      keepVersions: number;
    }) {
      const record = await this.find(input.organizationId, input.id);
      if (!record) return { status: "missing" as const };
      if (record.revision !== input.expectedRevision) {
        return { status: "conflict" as const, currentRevision: record.revision };
      }
      record.publishedConfig = cloneConfig(record.draftConfig);
      record.publishedAt = input.now;
      record.revision += 1;
      record.publishedRevision = record.revision;
      record.updatedAt = input.now;
      state.versions.push({
        id: input.versionId,
        dashboardId: record.id,
        organizationId: record.organizationId,
        revision: record.revision,
        config: cloneConfig(record.draftConfig),
        createdBy: input.actorId,
        createdAt: input.now,
      });
      const versions = state.versions
        .filter((version) => version.dashboardId === record.id)
        .sort((left, right) => right.revision - left.revision);
      const excess = new Set(
        versions.slice(input.keepVersions).map((version) => version.id),
      );
      state.versions = state.versions.filter((version) => !excess.has(version.id));
      return { status: "ok" as const, record };
    },
    async restoreDraft(input: {
      organizationId: string;
      id: string;
      expectedRevision: number;
      versionId: string;
      now: string;
    }) {
      const record = await this.find(input.organizationId, input.id);
      if (!record) return { status: "missing" as const };
      if (record.revision !== input.expectedRevision) {
        return { status: "conflict" as const, currentRevision: record.revision };
      }
      const version = state.versions.find(
        (entry) =>
          entry.id === input.versionId &&
          entry.dashboardId === record.id &&
          entry.organizationId === input.organizationId,
      );
      if (!version) return { status: "missing" as const };
      record.draftConfig = cloneConfig(version.config);
      record.name = version.config.metadata.title;
      record.revision += 1;
      record.updatedAt = input.now;
      return { status: "ok" as const, record };
    },
    async rename(organizationId: string, id: string, name: string) {
      const record = await this.find(organizationId, id);
      if (!record) return null;
      record.name = name;
      record.updatedAt = new Date().toISOString();
      return record;
    },
    async remove(organizationId: string, id: string): Promise<boolean> {
      const record = await this.find(organizationId, id);
      if (!record) return false;
      state.dashboards.delete(id);
      state.versions = state.versions.filter((version) => version.dashboardId !== id);
      state.shares = state.shares.filter((share) => share.dashboardId !== id);
      state.embedTokens = state.embedTokens.filter((token) => token.dashboardId !== id);
      return true;
    },
    async listVersions(organizationId: string, dashboardId: string, page: PageRequest) {
      const all = state.versions
        .filter(
          (version) =>
            version.dashboardId === dashboardId &&
            version.organizationId === organizationId,
        )
        .sort((left, right) => right.revision - left.revision);
      return {
        items: all.slice(page.offset, page.offset + page.limit),
        total: all.length,
      };
    },
  };

  const shares = {
    async list(organizationId: string, dashboardId: string) {
      return state.shares.filter(
        (share) =>
          share.organizationId === organizationId && share.dashboardId === dashboardId,
      );
    },
    async replace(
      organizationId: string,
      dashboardId: string,
      incoming: Array<{
        id?: string;
        subjectType: "user" | "role" | "organization";
        subjectId: string;
        permission: "view" | "edit";
      }>,
      now: string,
    ) {
      state.shares = state.shares.filter(
        (share) =>
          !(share.organizationId === organizationId && share.dashboardId === dashboardId),
      );
      for (const item of incoming) {
        state.shares.push({
          id: createId(),
          organizationId,
          dashboardId,
          subjectType: item.subjectType,
          subjectId: item.subjectId,
          permission: item.permission,
          createdAt: now,
        });
      }
      return shares.list(organizationId, dashboardId);
    },
  };

  const embedTokens = {
    async create(record: EmbedTokenRecord) {
      state.embedTokens.push(record);
      return record;
    },
    async list(organizationId: string, dashboardId: string) {
      return state.embedTokens.filter(
        (token) =>
          token.organizationId === organizationId && token.dashboardId === dashboardId,
      );
    },
    async revoke(
      organizationId: string,
      dashboardId: string,
      tokenId: string,
      now: string,
    ) {
      const token = state.embedTokens.find(
        (candidate) =>
          candidate.id === tokenId &&
          candidate.dashboardId === dashboardId &&
          candidate.organizationId === organizationId &&
          candidate.revokedAt === null,
      );
      if (!token) return false;
      token.revokedAt = now;
      return true;
    },
    async findByHash(tokenHash: Buffer) {
      return state.embedTokens.find((token) => token.tokenHash.equals(tokenHash)) ?? null;
    },
  };

  const dataSources = {
    async list(organizationId: string, page: PageRequest) {
      const all = [...state.dataSources.values()]
        .filter((source) => source.organizationId === organizationId)
        .sort((left, right) => left.name.localeCompare(right.name));
      return {
        items: all.slice(page.offset, page.offset + page.limit),
        total: all.length,
      };
    },
    async find(organizationId: string, id: string) {
      const source = state.dataSources.get(id);
      return source && source.organizationId === organizationId ? source : null;
    },
    async create(record: DataSourceRecord) {
      state.dataSources.set(record.id, record);
      return record;
    },
    async update(
      organizationId: string,
      id: string,
      patch: Partial<
        Pick<DataSourceRecord, "name" | "config" | "allowRawSql" | "status">
      >,
    ) {
      const source = await this.find(organizationId, id);
      if (!source) return null;
      Object.assign(source, patch, { updatedAt: new Date().toISOString() });
      return source;
    },
    async remove(organizationId: string, id: string) {
      const source = await this.find(organizationId, id);
      if (!source) return false;
      state.dataSources.delete(id);
      state.credentials.delete(id);
      return true;
    },
    async saveCredential(record: {
      dataSourceId: string;
      organizationId: string;
      ciphertext: Buffer;
      keyVersion: number;
      createdAt: string;
      rotatedAt: string | null;
    }) {
      state.credentials.set(record.dataSourceId, {
        ciphertext: record.ciphertext,
        keyVersion: record.keyVersion,
        createdAt: record.createdAt,
        rotatedAt: record.rotatedAt,
      });
    },
    async getCredential(organizationId: string, dataSourceId: string) {
      const source = await this.find(organizationId, dataSourceId);
      const credential = state.credentials.get(dataSourceId);
      if (!source || !credential) return null;
      return { dataSourceId, organizationId, ...credential };
    },
  };

  const audit = {
    async record(): Promise<void> {
      // Auditing is a Postgres concern; the in-memory adapter keeps no trail.
    },
  };

  return {
    kind: "memory",
    users,
    sessions,
    organizations,
    memberships,
    roles,
    dashboards,
    shares,
    embedTokens,
    dataSources,
    audit,
    async permissions() {
      return PERMISSIONS.map((permission) => ({
        id: createId(),
        name: permission.name,
        description: permission.description,
      }));
    },
    async withTenant<T>(
      _scope: { organizationId: string; userId: string | null },
      fn: () => Promise<T>,
    ): Promise<T> {
      return fn();
    },
    async close() {},
  } satisfies Persistence;
}
