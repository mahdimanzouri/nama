import { AsyncLocalStorage } from "node:async_hooks";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../../generated/prisma/client.js";
import { createId, type DashboardConfig } from "@nama/dashboard-types";

import { PERMISSIONS } from "../rbac.ts";
import type {
  DashboardRecord,
  DashboardShareRecord,
  DashboardVersionRecord,
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

type Db = Prisma.TransactionClient;

const transactionStore = new AsyncLocalStorage<Db>();

function iso(value: Date): string {
  return value.toISOString();
}

function isoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toBytes(value: Buffer): Uint8Array<ArrayBuffer> {
  return new Uint8Array(value);
}

function toUser(row: {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  status: "active" | "disabled";
}): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    displayName: row.displayName,
    status: row.status,
  };
}

function toPreference(row: {
  userId: string;
  locale: string;
  theme: string;
  timezone: string;
  defaultOrganizationId: string | null;
}): UserPreferenceRecord {
  return {
    userId: row.userId,
    locale: row.locale as UserPreferenceRecord["locale"],
    theme: row.theme as UserPreferenceRecord["theme"],
    timezone: row.timezone,
    defaultOrganizationId: row.defaultOrganizationId,
  };
}

function toOrganization(row: {
  id: string;
  name: string;
  slug: string;
}): OrganizationRecord {
  return { id: row.id, name: row.name, slug: row.slug };
}

function toMembership(row: {
  id: string;
  organizationId: string;
  userId: string;
  status: "invited" | "active" | "suspended";
  createdAt: Date;
}): MembershipRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    status: row.status,
    createdAt: iso(row.createdAt),
  };
}

function toDashboard(row: {
  id: string;
  organizationId: string;
  name: string;
  draftConfig: Prisma.JsonValue;
  publishedConfig: Prisma.JsonValue | null;
  revision: number;
  publishedRevision: number | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
}): DashboardRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    draftConfig: row.draftConfig as unknown as DashboardConfig,
    publishedConfig: row.publishedConfig as unknown as DashboardConfig | null,
    revision: row.revision,
    publishedRevision: row.publishedRevision,
    createdBy: row.createdBy,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    publishedAt: isoOrNull(row.publishedAt),
  };
}

function toVersion(row: {
  id: string;
  dashboardId: string;
  organizationId: string;
  revision: number;
  config: Prisma.JsonValue;
  createdBy: string;
  createdAt: Date;
}): DashboardVersionRecord {
  return {
    id: row.id,
    dashboardId: row.dashboardId,
    organizationId: row.organizationId,
    revision: row.revision,
    config: row.config as unknown as DashboardConfig,
    createdBy: row.createdBy,
    createdAt: iso(row.createdAt),
  };
}

function toShare(row: {
  id: string;
  organizationId: string;
  dashboardId: string;
  subjectType: "user" | "role" | "organization";
  subjectId: string;
  permission: "view" | "edit";
  createdAt: Date;
}): DashboardShareRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    dashboardId: row.dashboardId,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    permission: row.permission,
    createdAt: iso(row.createdAt),
  };
}

function toDataSource(row: {
  id: string;
  organizationId: string;
  name: string;
  kind: string;
  config: Prisma.JsonValue;
  allowRawSql: boolean;
  limits: Prisma.JsonValue;
  status: "active" | "disabled" | "error";
  createdAt: Date;
  updatedAt: Date;
}): DataSourceRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    kind: row.kind as DataSourceRecord["kind"],
    config: (row.config ?? {}) as Record<string, unknown>,
    allowRawSql: row.allowRawSql,
    limits: (row.limits ?? {}) as Record<string, unknown>,
    status: row.status,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toEmbedToken(row: {
  id: string;
  dashboardId: string;
  organizationId: string;
  tokenHash: Uint8Array;
  issuedBy: string;
  viewerIdentity: string | null;
  scope: Prisma.JsonValue;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}): EmbedTokenRecord {
  return {
    id: row.id,
    dashboardId: row.dashboardId,
    organizationId: row.organizationId,
    tokenHash: Buffer.from(row.tokenHash),
    issuedBy: row.issuedBy,
    viewerIdentity: row.viewerIdentity,
    scope: (row.scope ?? {}) as Record<string, unknown>,
    expiresAt: iso(row.expiresAt),
    revokedAt: isoOrNull(row.revokedAt),
    createdAt: iso(row.createdAt),
  };
}

export function createPostgresPersistence(connectionString: string): Persistence {
  const adapter = new PrismaPg({ connectionString });
  const client = new PrismaClient({ adapter });

  const db = (): Db => transactionStore.getStore() ?? (client as unknown as Db);

  async function inTransaction<T>(fn: () => Promise<T>): Promise<T> {
    if (transactionStore.getStore()) return fn();
    return client.$transaction(async (tx) => transactionStore.run(tx, fn), {
      maxWait: 5_000,
      timeout: 20_000,
    });
  }

  async function rolesForMembership(membershipId: string): Promise<RoleRecord[]> {
    const links = await db().membershipRole.findMany({ where: { membershipId } });
    if (links.length === 0) return [];
    const roles = await db().role.findMany({
      where: { id: { in: links.map((link) => link.roleId) } },
    });
    const roleIds = roles.map((role) => role.id);
    const permissions =
      roleIds.length === 0
        ? []
        : await db().rolePermission.findMany({
            where: { roleId: { in: roleIds } },
            include: { permission: true },
          });
    return roles.map((role) => ({
      id: role.id,
      organizationId: role.organizationId,
      name: role.name,
      isSystem: role.isSystem,
      permissions: permissions
        .filter((link) => link.roleId === role.id)
        .map((link) => link.permission.name)
        .sort(),
    }));
  }

  function toMember(
    membership: MembershipRecord,
    user: UserRecord,
    roles: RoleRecord[],
  ): MemberWithUser {
    return {
      membership,
      user,
      roleIds: roles.map((role) => role.id),
      roleNames: roles.map((role) => role.name),
    };
  }

  const users = {
    async findByEmail(email: string): Promise<UserRecord | null> {
      const row = await db().user.findUnique({
        where: { email: email.trim().toLowerCase() },
      });
      return row ? toUser(row) : null;
    },
    async findById(id: string): Promise<UserRecord | null> {
      const row = await db().user.findUnique({ where: { id } });
      return row ? toUser(row) : null;
    },
    async getPreferences(userId: string): Promise<UserPreferenceRecord | null> {
      const row = await db().userPreference.findUnique({ where: { userId } });
      return row ? toPreference(row) : null;
    },
    async updatePreferences(
      userId: string,
      patch: Partial<Omit<UserPreferenceRecord, "userId">>,
    ): Promise<UserPreferenceRecord> {
      const existing = await db().userPreference.findUnique({ where: { userId } });
      const base: UserPreferenceRecord = existing
        ? toPreference(existing)
        : {
            userId,
            locale: "en",
            theme: "system",
            timezone: "UTC",
            defaultOrganizationId: null,
          };
      const next = { ...base, ...patch, userId };
      const row = await db().userPreference.upsert({
        where: { userId },
        create: next,
        update: {
          locale: next.locale,
          theme: next.theme,
          timezone: next.timezone,
          defaultOrganizationId: next.defaultOrganizationId,
        },
      });
      return toPreference(row);
    },
  };

  const sessions = {
    async create(session: SessionRecord): Promise<void> {
      await db().session.create({
        data: {
          id: session.id,
          tokenHash: session.tokenHash,
          csrfToken: session.csrfToken,
          userId: session.userId,
          organizationId: session.organizationId,
          createdAt: new Date(session.createdAt),
          expiresAt: new Date(session.expiresAt),
        },
      });
    },
    async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
      const row = await db().session.findUnique({ where: { tokenHash } });
      if (!row) return null;
      return {
        id: row.id,
        tokenHash: row.tokenHash,
        csrfToken: row.csrfToken,
        userId: row.userId,
        organizationId: row.organizationId,
        createdAt: iso(row.createdAt),
        expiresAt: iso(row.expiresAt),
      };
    },
    async deleteByTokenHash(tokenHash: string): Promise<void> {
      await db().session.deleteMany({ where: { tokenHash } });
    },
    async deleteExpired(now: Date): Promise<void> {
      await db().session.deleteMany({ where: { expiresAt: { lte: now } } });
    },
  };

  const organizations = {
    async findById(id: string): Promise<OrganizationRecord | null> {
      const row = await db().organization.findUnique({ where: { id } });
      return row ? toOrganization(row) : null;
    },
    async create(record: OrganizationRecord): Promise<void> {
      await db().organization.create({ data: record });
    },
  };

  const memberships = {
    async findActive(userId: string, organizationId: string) {
      const row = await db().membership.findFirst({
        where: { userId, organizationId, status: "active" },
      });
      if (!row) return null;
      const roles = await rolesForMembership(row.id);
      return {
        membership: toMembership(row),
        roleNames: roles.map((role) => role.name),
        permissions: [...new Set(roles.flatMap((role) => role.permissions))].sort(),
      };
    },
    async findFirstActive(userId: string) {
      const row = await db().membership.findFirst({
        where: { userId, status: "active" },
        orderBy: { createdAt: "asc" },
      });
      if (!row) return null;
      const roles = await rolesForMembership(row.id);
      return {
        membership: toMembership(row),
        roleNames: roles.map((role) => role.name),
        permissions: [...new Set(roles.flatMap((role) => role.permissions))].sort(),
      };
    },
    async list(organizationId: string, page: PageRequest) {
      const where = { organizationId };
      const [rows, total] = await Promise.all([
        db().membership.findMany({
          where,
          orderBy: { createdAt: "asc" },
          skip: page.offset,
          take: page.limit,
        }),
        db().membership.count({ where }),
      ]);
      const links =
        rows.length === 0
          ? []
          : await db().membershipRole.findMany({
              where: { membershipId: { in: rows.map((row) => row.id) } },
              include: { role: true },
            });
      const usersById = new Map(
        (
          await db().user.findMany({
            where: { id: { in: rows.map((row) => row.userId) } },
          })
        ).map((row) => [row.id, toUser(row)]),
      );
      const items = rows.flatMap((row) => {
        const user = usersById.get(row.userId);
        if (!user) return [];
        const roles = links
          .filter((link) => link.membershipId === row.id)
          .map((link) => link.role);
        return [
          toMember(
            toMembership(row),
            user,
            roles.map((role) => ({
              id: role.id,
              organizationId: role.organizationId,
              name: role.name,
              isSystem: role.isSystem,
              permissions: [],
            })),
          ),
        ];
      });
      return { items, total };
    },
    async find(organizationId: string, membershipId: string) {
      const row = await db().membership.findFirst({
        where: { id: membershipId, organizationId },
      });
      if (!row) return null;
      const user = await db().user.findUnique({ where: { id: row.userId } });
      if (!user) return null;
      return toMember(toMembership(row), toUser(user), await rolesForMembership(row.id));
    },
    async create(input: {
      organizationId: string;
      user: { id: string; email: string; passwordHash: string; displayName: string };
      roleIds: string[];
      status: "invited" | "active";
      createdAt: string;
    }) {
      return inTransaction(async () => {
        await db().user.upsert({
          where: { id: input.user.id },
          create: {
            id: input.user.id,
            email: input.user.email.toLowerCase(),
            passwordHash: input.user.passwordHash,
            displayName: input.user.displayName,
            status: "active",
          },
          update: {},
        });
        const membership = await db().membership.create({
          data: {
            id: createId(),
            organizationId: input.organizationId,
            userId: input.user.id,
            status: input.status,
            createdAt: new Date(input.createdAt),
          },
        });
        await db().membershipRole.createMany({
          data: input.roleIds.map((roleId) => ({
            membershipId: membership.id,
            roleId,
          })),
        });
        const created = await memberships.find(input.organizationId, membership.id);
        if (!created) throw new Error("Membership creation failed");
        return created;
      });
    },
    async update(input: {
      organizationId: string;
      membershipId: string;
      status?: "active" | "suspended";
      roleIds?: string[];
    }) {
      return inTransaction(async () => {
        const row = await db().membership.findFirst({
          where: { id: input.membershipId, organizationId: input.organizationId },
        });
        if (!row) return null;
        if (input.status) {
          await db().membership.update({
            where: { id: row.id },
            data: { status: input.status },
          });
        }
        if (input.roleIds) {
          await db().membershipRole.deleteMany({ where: { membershipId: row.id } });
          if (input.roleIds.length > 0) {
            await db().membershipRole.createMany({
              data: input.roleIds.map((roleId) => ({
                membershipId: row.id,
                roleId,
              })),
            });
          }
        }
        return memberships.find(input.organizationId, row.id);
      });
    },
    async remove(organizationId: string, membershipId: string): Promise<boolean> {
      return inTransaction(async () => {
        const row = await db().membership.findFirst({
          where: { id: membershipId, organizationId },
        });
        if (!row) return false;
        await db().membershipRole.deleteMany({ where: { membershipId: row.id } });
        await db().membership.delete({ where: { id: row.id } });
        return true;
      });
    },
  };

  const roles = {
    async list(organizationId: string): Promise<RoleRecord[]> {
      const rows = await db().role.findMany({
        where: { organizationId },
        orderBy: { name: "asc" },
      });
      const permissions = await db().rolePermission.findMany({
        where: { roleId: { in: rows.map((row) => row.id) } },
        include: { permission: true },
      });
      return rows.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        name: row.name,
        isSystem: row.isSystem,
        permissions: permissions
          .filter((link) => link.roleId === row.id)
          .map((link) => link.permission.name)
          .sort(),
      }));
    },
    async find(organizationId: string, roleId: string) {
      const row = await db().role.findFirst({ where: { id: roleId, organizationId } });
      if (!row) return null;
      const permissions = await db().rolePermission.findMany({
        where: { roleId: row.id },
        include: { permission: true },
      });
      return {
        id: row.id,
        organizationId: row.organizationId,
        name: row.name,
        isSystem: row.isSystem,
        permissions: permissions.map((link) => link.permission.name).sort(),
      };
    },
    async create(input: { organizationId: string; name: string; permissions: string[] }) {
      return inTransaction(async () => {
        const row = await db().role.create({
          data: {
            id: crypto.randomUUID(),
            organizationId: input.organizationId,
            name: input.name,
            isSystem: false,
          },
        });
        await setRolePermissions(row.id, input.permissions);
        const created = await roles.find(input.organizationId, row.id);
        if (!created) throw new Error("Role creation failed");
        return created;
      });
    },
    async update(input: {
      organizationId: string;
      roleId: string;
      name?: string;
      permissions?: string[];
    }) {
      return inTransaction(async () => {
        const row = await db().role.findFirst({
          where: { id: input.roleId, organizationId: input.organizationId },
        });
        if (!row || row.isSystem) return null;
        if (input.name) {
          await db().role.update({ where: { id: row.id }, data: { name: input.name } });
        }
        if (input.permissions) await setRolePermissions(row.id, input.permissions);
        return roles.find(input.organizationId, row.id);
      });
    },
    async remove(organizationId: string, roleId: string) {
      return inTransaction(async () => {
        const row = await db().role.findFirst({
          where: { id: roleId, organizationId },
        });
        if (!row) return "missing" as const;
        if (row.isSystem) return "in-use" as const;
        const assigned = await db().membershipRole.count({ where: { roleId } });
        if (assigned > 0) return "in-use" as const;
        await db().rolePermission.deleteMany({ where: { roleId } });
        await db().role.delete({ where: { id: roleId } });
        return "deleted" as const;
      });
    },
    async resolvePermissions(organizationId: string, roleIds: string[]) {
      if (roleIds.length === 0) return [];
      const rows = await db().rolePermission.findMany({
        where: {
          roleId: { in: roleIds },
          role: { organizationId },
        },
        include: { permission: true },
      });
      return [...new Set(rows.map((row) => row.permission.name))].sort();
    },
  };

  async function setRolePermissions(roleId: string, names: string[]): Promise<void> {
    await db().rolePermission.deleteMany({ where: { roleId } });
    if (names.length === 0) return;
    const permissions = await db().permission.findMany({
      where: { name: { in: [...new Set(names)] } },
    });
    if (permissions.length > 0) {
      await db().rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId,
          permissionId: permission.id,
        })),
      });
    }
  }

  const dashboards = {
    async list(organizationId: string, page: PageRequest) {
      const where = { organizationId };
      const [rows, total] = await Promise.all([
        db().dashboard.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          skip: page.offset,
          take: page.limit,
        }),
        db().dashboard.count({ where }),
      ]);
      return { items: rows.map(toDashboard), total };
    },
    async find(organizationId: string, id: string) {
      const row = await db().dashboard.findFirst({ where: { id, organizationId } });
      return row ? toDashboard(row) : null;
    },
    async create(record: DashboardRecord): Promise<void> {
      await db().dashboard.create({
        data: {
          id: record.id,
          organizationId: record.organizationId,
          name: record.name,
          draftConfig: toJson(record.draftConfig),
          publishedConfig: record.publishedConfig
            ? toJson(record.publishedConfig)
            : Prisma.DbNull,
          revision: record.revision,
          publishedRevision: record.publishedRevision,
          createdBy: record.createdBy,
          createdAt: new Date(record.createdAt),
          updatedAt: new Date(record.updatedAt),
          publishedAt: record.publishedAt ? new Date(record.publishedAt) : null,
        },
      });
    },
    async saveDraft(input: {
      organizationId: string;
      id: string;
      expectedRevision: number;
      config: DashboardConfig;
      now: string;
    }) {
      return inTransaction(async () => {
        const result = await db().dashboard.updateMany({
          where: {
            id: input.id,
            organizationId: input.organizationId,
            revision: input.expectedRevision,
          },
          data: {
            draftConfig: toJson(input.config),
            name: input.config.metadata.title,
            revision: { increment: 1 },
            updatedAt: new Date(input.now),
          },
        });
        if (result.count === 0) {
          const current = await dashboards.find(input.organizationId, input.id);
          return current
            ? { status: "conflict" as const, currentRevision: current.revision }
            : { status: "missing" as const };
        }
        const record = await dashboards.find(input.organizationId, input.id);
        if (!record) return { status: "missing" as const };
        return { status: "ok" as const, record };
      });
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
      return inTransaction(async () => {
        const current = await dashboards.find(input.organizationId, input.id);
        if (!current) return { status: "missing" as const };
        if (current.revision !== input.expectedRevision) {
          return { status: "conflict" as const, currentRevision: current.revision };
        }
        const result = await db().dashboard.updateMany({
          where: {
            id: input.id,
            organizationId: input.organizationId,
            revision: input.expectedRevision,
          },
          data: {
            publishedConfig: toJson(current.draftConfig),
            publishedAt: new Date(input.now),
            revision: { increment: 1 },
            publishedRevision: input.expectedRevision + 1,
            updatedAt: new Date(input.now),
          },
        });
        if (result.count === 0) {
          const latest = await dashboards.find(input.organizationId, input.id);
          return latest
            ? { status: "conflict" as const, currentRevision: latest.revision }
            : { status: "missing" as const };
        }
        await db().dashboardVersion.create({
          data: {
            id: input.versionId,
            dashboardId: input.id,
            organizationId: input.organizationId,
            revision: input.expectedRevision + 1,
            config: toJson(current.draftConfig),
            createdBy: input.actorId,
            createdAt: new Date(input.now),
          },
        });
        const stale = await db().dashboardVersion.findMany({
          where: { dashboardId: input.id, organizationId: input.organizationId },
          orderBy: { revision: "desc" },
          skip: input.keepVersions,
          select: { id: true },
        });
        if (stale.length > 0) {
          await db().dashboardVersion.deleteMany({
            where: { id: { in: stale.map((version) => version.id) } },
          });
        }
        const record = await dashboards.find(input.organizationId, input.id);
        if (!record) return { status: "missing" as const };
        return { status: "ok" as const, record };
      });
    },
    async restoreDraft(input: {
      organizationId: string;
      id: string;
      expectedRevision: number;
      versionId: string;
      now: string;
    }) {
      return inTransaction(async () => {
        const current = await dashboards.find(input.organizationId, input.id);
        if (!current) return { status: "missing" as const };
        if (current.revision !== input.expectedRevision) {
          return { status: "conflict" as const, currentRevision: current.revision };
        }
        const version = await db().dashboardVersion.findFirst({
          where: {
            id: input.versionId,
            dashboardId: input.id,
            organizationId: input.organizationId,
          },
        });
        if (!version) return { status: "missing" as const };
        const config = version.config as unknown as DashboardConfig;
        const result = await db().dashboard.updateMany({
          where: {
            id: input.id,
            organizationId: input.organizationId,
            revision: input.expectedRevision,
          },
          data: {
            draftConfig: toJson(config),
            name: config.metadata.title,
            revision: { increment: 1 },
            updatedAt: new Date(input.now),
          },
        });
        if (result.count === 0) {
          const latest = await dashboards.find(input.organizationId, input.id);
          return latest
            ? { status: "conflict" as const, currentRevision: latest.revision }
            : { status: "missing" as const };
        }
        const record = await dashboards.find(input.organizationId, input.id);
        if (!record) return { status: "missing" as const };
        return { status: "ok" as const, record };
      });
    },
    async rename(organizationId: string, id: string, name: string) {
      const result = await db().dashboard.updateMany({
        where: { id, organizationId },
        data: { name, updatedAt: new Date() },
      });
      if (result.count === 0) return null;
      return dashboards.find(organizationId, id);
    },
    async remove(organizationId: string, id: string): Promise<boolean> {
      return inTransaction(async () => {
        const row = await db().dashboard.findFirst({ where: { id, organizationId } });
        if (!row) return false;
        await db().dashboardVersion.deleteMany({ where: { dashboardId: id } });
        await db().dashboardShare.deleteMany({ where: { dashboardId: id } });
        await db().embedToken.deleteMany({ where: { dashboardId: id } });
        await db().dashboard.delete({ where: { id } });
        return true;
      });
    },
    async listVersions(organizationId: string, dashboardId: string, page: PageRequest) {
      const where = { dashboardId, organizationId };
      const [rows, total] = await Promise.all([
        db().dashboardVersion.findMany({
          where,
          orderBy: { revision: "desc" },
          skip: page.offset,
          take: page.limit,
        }),
        db().dashboardVersion.count({ where }),
      ]);
      return { items: rows.map(toVersion), total };
    },
  };

  const shares = {
    async list(organizationId: string, dashboardId: string) {
      const rows = await db().dashboardShare.findMany({
        where: { organizationId, dashboardId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toShare);
    },
    async replace(
      organizationId: string,
      dashboardId: string,
      incoming: Array<{
        id?: string;
        subjectType: DashboardShareRecord["subjectType"];
        subjectId: string;
        permission: DashboardShareRecord["permission"];
      }>,
      now: string,
    ) {
      return inTransaction(async () => {
        await db().dashboardShare.deleteMany({ where: { organizationId, dashboardId } });
        if (incoming.length > 0) {
          await db().dashboardShare.createMany({
            data: incoming.map((share) => ({
              id: share.id ?? crypto.randomUUID(),
              organizationId,
              dashboardId,
              subjectType: share.subjectType,
              subjectId: share.subjectId,
              permission: share.permission,
              createdAt: new Date(now),
            })),
          });
        }
        return shares.list(organizationId, dashboardId);
      });
    },
  };

  const embedTokens = {
    async create(record: EmbedTokenRecord) {
      await db().embedToken.create({
        data: {
          id: record.id,
          dashboardId: record.dashboardId,
          organizationId: record.organizationId,
          tokenHash: toBytes(record.tokenHash),
          issuedBy: record.issuedBy,
          viewerIdentity: record.viewerIdentity,
          scope: toJson(record.scope),
          expiresAt: new Date(record.expiresAt),
          createdAt: new Date(record.createdAt),
        },
      });
      return record;
    },
    async list(organizationId: string, dashboardId: string) {
      const rows = await db().embedToken.findMany({
        where: { organizationId, dashboardId },
        orderBy: { createdAt: "desc" },
      });
      return rows.map(toEmbedToken);
    },
    async revoke(
      organizationId: string,
      dashboardId: string,
      tokenId: string,
      now: string,
    ) {
      const result = await db().embedToken.updateMany({
        where: { id: tokenId, dashboardId, organizationId, revokedAt: null },
        data: { revokedAt: new Date(now) },
      });
      return result.count > 0;
    },
    async findByHash(tokenHash: Buffer) {
      const row = await db().embedToken.findUnique({
        where: { tokenHash: toBytes(tokenHash) },
      });
      return row ? toEmbedToken(row) : null;
    },
  };

  const dataSources = {
    async list(organizationId: string, page: PageRequest) {
      const where = { organizationId };
      const [rows, total] = await Promise.all([
        db().dataSource.findMany({
          where,
          orderBy: { name: "asc" },
          skip: page.offset,
          take: page.limit,
        }),
        db().dataSource.count({ where }),
      ]);
      return { items: rows.map(toDataSource), total };
    },
    async find(organizationId: string, id: string) {
      const row = await db().dataSource.findFirst({ where: { id, organizationId } });
      return row ? toDataSource(row) : null;
    },
    async create(record: DataSourceRecord) {
      const row = await db().dataSource.create({
        data: {
          id: record.id,
          organizationId: record.organizationId,
          name: record.name,
          kind: record.kind,
          config: toJson(record.config),
          allowRawSql: record.allowRawSql,
          limits: toJson(record.limits),
          status: record.status,
          createdAt: new Date(record.createdAt),
          updatedAt: new Date(record.updatedAt),
        },
      });
      return toDataSource(row);
    },
    async update(
      organizationId: string,
      id: string,
      patch: Partial<
        Pick<DataSourceRecord, "name" | "config" | "allowRawSql" | "status">
      >,
    ) {
      const result = await db().dataSource.updateMany({
        where: { id, organizationId },
        data: {
          ...(patch.name === undefined ? {} : { name: patch.name }),
          ...(patch.config === undefined ? {} : { config: toJson(patch.config) }),
          ...(patch.allowRawSql === undefined ? {} : { allowRawSql: patch.allowRawSql }),
          ...(patch.status === undefined ? {} : { status: patch.status }),
          updatedAt: new Date(),
        },
      });
      if (result.count === 0) return null;
      return dataSources.find(organizationId, id);
    },
    async remove(organizationId: string, id: string): Promise<boolean> {
      return inTransaction(async () => {
        const row = await db().dataSource.findFirst({ where: { id, organizationId } });
        if (!row) return false;
        await db().dataSourceCredential.deleteMany({ where: { dataSourceId: id } });
        await db().dataSource.delete({ where: { id } });
        return true;
      });
    },
    async saveCredential(record: {
      dataSourceId: string;
      organizationId: string;
      ciphertext: Buffer;
      keyVersion: number;
      createdAt: string;
      rotatedAt: string | null;
    }) {
      await db().dataSourceCredential.upsert({
        where: { dataSourceId: record.dataSourceId },
        create: {
          id: crypto.randomUUID(),
          dataSourceId: record.dataSourceId,
          organizationId: record.organizationId,
          ciphertext: toBytes(record.ciphertext),
          keyVersion: record.keyVersion,
          createdAt: new Date(record.createdAt),
          rotatedAt: record.rotatedAt ? new Date(record.rotatedAt) : null,
        },
        update: {
          ciphertext: toBytes(record.ciphertext),
          keyVersion: record.keyVersion,
          rotatedAt: record.rotatedAt ? new Date(record.rotatedAt) : null,
        },
      });
    },
    async getCredential(organizationId: string, dataSourceId: string) {
      const row = await db().dataSourceCredential.findFirst({
        where: { dataSourceId, organizationId },
      });
      if (!row) return null;
      return {
        dataSourceId: row.dataSourceId,
        organizationId: row.organizationId,
        ciphertext: Buffer.from(row.ciphertext),
        keyVersion: row.keyVersion,
        createdAt: iso(row.createdAt),
        rotatedAt: isoOrNull(row.rotatedAt),
      };
    },
  };

  const audit = {
    async record(event: {
      organizationId: string;
      actorType: "user" | "embed" | "system";
      actorId: string;
      action: string;
      resourceType: string;
      resourceId?: string | null;
      metadata?: Record<string, unknown>;
      requestId: string;
    }): Promise<void> {
      await db().auditLog.create({
        data: {
          id: crypto.randomUUID(),
          organizationId: event.organizationId,
          actorType: event.actorType,
          actorId: event.actorId,
          action: event.action,
          resourceType: event.resourceType,
          resourceId: event.resourceId ?? null,
          metadata: toJson(event.metadata ?? {}),
          requestId: event.requestId,
          createdAt: new Date(),
        },
      });
    },
  };

  return {
    kind: "postgres",
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
      const rows = await db().permission.findMany({ orderBy: { name: "asc" } });
      if (rows.length > 0) {
        return rows.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description,
        }));
      }
      return PERMISSIONS.map((permission) => ({
        id: crypto.randomUUID(),
        ...permission,
      }));
    },
    async withTenant<T>(
      scope: { organizationId: string; userId: string | null },
      fn: () => Promise<T>,
    ): Promise<T> {
      if (transactionStore.getStore()) return fn();
      return client.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.organization_id', ${scope.organizationId}, true)`;
          await tx.$executeRaw`SELECT set_config('app.user_id', ${scope.userId ?? ""}, true)`;
          return transactionStore.run(tx, fn);
        },
        { maxWait: 5_000, timeout: 20_000 },
      );
    },
    async close() {
      await client.$disconnect();
    },
  } satisfies Persistence;
}
