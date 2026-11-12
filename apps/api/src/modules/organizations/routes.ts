import type { FastifyInstance, FastifyRequest } from "fastify";
import { createId, issuesFromZod } from "@nama/dashboard-types";
import { z } from "zod";

import {
  HttpError,
  notFound,
  unauthorized,
  validationFailed,
} from "../../infrastructure/errors.ts";
import { isKnownPermission } from "../../infrastructure/rbac.ts";
import type {
  MemberWithUser,
  Persistence,
  TenantScope,
} from "../../infrastructure/persistence/types.ts";
import type { AuthContext, AuthHooks } from "../../http/auth.ts";
import type { IdempotencyHooks } from "../../http/idempotency.ts";

const listQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

const inviteSchema = z
  .object({
    email: z.email().max(320),
    roleIds: z.array(z.uuid()).min(1).max(10),
  })
  .strict();

const updateMemberSchema = z
  .object({
    roleIds: z.array(z.uuid()).max(10).optional(),
    status: z.enum(["active", "suspended"]).optional(),
  })
  .strict();

const roleSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    permissions: z.array(z.string()).max(50),
  })
  .strict();

const roleUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    permissions: z.array(z.string()).max(50).optional(),
  })
  .strict();

export interface OrganizationRouteDeps {
  persistence: Persistence;
  now: () => Date;
  hooks: AuthHooks;
  idempotency?: IdempotencyHooks;
}

function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw unauthorized();
  return request.auth;
}

function scopeOf(auth: AuthContext): TenantScope {
  return { organizationId: auth.organization.id, userId: auth.user.id };
}

function assertOrganization(auth: AuthContext, id: string): void {
  if (id !== auth.organization.id) throw notFound("Organization not found");
}

function toMember(member: MemberWithUser) {
  return {
    id: member.membership.id,
    userId: member.user.id,
    email: member.user.email,
    displayName: member.user.displayName,
    status: member.membership.status,
    roles: member.roleIds,
  };
}

function validatePermissionNames(names: string[]): void {
  const unknown = names.filter((name) => !isKnownPermission(name));
  if (unknown.length > 0) {
    throw validationFailed([
      {
        code: "invalid_value",
        path: ["permissions"],
        message: `Unknown permission(s): ${unknown.join(", ")}`,
      },
    ]);
  }
}

export function registerOrganizationRoutes(
  app: FastifyInstance,
  { persistence, now, hooks, idempotency }: OrganizationRouteDeps,
): void {
  app.get(
    "/v1/organizations/:id/members",
    {
      preHandler: [
        hooks.authenticate,
        hooks.requirePermission("organization.members.manage"),
      ],
    },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = request.params as { id: string };
      assertOrganization(auth, id);

      const query = listQuerySchema.safeParse(request.query);
      if (!query.success) throw validationFailed(issuesFromZod(query.error));
      const { page, pageSize } = query.data;

      const result = await persistence.withTenant(scopeOf(auth), () =>
        persistence.memberships.list(id, {
          offset: (page - 1) * pageSize,
          limit: pageSize,
        }),
      );

      return {
        items: result.items.map(toMember),
        pagination: { page, pageSize, total: result.total },
      };
    },
  );

  app.post(
    "/v1/organizations/:id/members",
    {
      preHandler: [
        hooks.authenticate,
        hooks.requireCsrf,
        hooks.requirePermission("organization.members.manage"),
        ...(idempotency ? [idempotency.enforce] : []),
      ],
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = request.params as { id: string };
      assertOrganization(auth, id);

      const parsed = inviteSchema.safeParse(request.body);
      if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));

      const existingUser = await persistence.users.findByEmail(parsed.data.email);
      if (existingUser) {
        const existingMember = await persistence.memberships.findActive(
          existingUser.id,
          id,
        );
        if (existingMember) {
          throw new HttpError(409, {
            code: "MEMBER_EXISTS",
            message: "That user already belongs to this organization",
          });
        }
      }

      const created = await persistence.withTenant(scopeOf(auth), async () => {
        const rolePermissions = await persistence.roles.resolvePermissions(
          id,
          parsed.data.roleIds,
        );
        if (rolePermissions.length === 0 && parsed.data.roleIds.length > 0) {
          const roles = await persistence.roles.list(id);
          const found = parsed.data.roleIds.every((roleId) =>
            roles.some((role) => role.id === roleId),
          );
          if (!found) {
            throw validationFailed([
              {
                code: "invalid_value",
                path: ["roleIds"],
                message: "Every role must belong to this organization",
              },
            ]);
          }
        }

        const member = await persistence.memberships.create({
          organizationId: id,
          user: {
            id: existingUser?.id ?? createId(),
            email: parsed.data.email,
            passwordHash: existingUser?.passwordHash ?? "",
            displayName:
              existingUser?.displayName ?? parsed.data.email.split("@")[0] ?? "Member",
          },
          roleIds: parsed.data.roleIds,
          status: existingUser ? "active" : "invited",
          createdAt: now().toISOString(),
        });

        await persistence.audit.record({
          organizationId: id,
          actorType: "user",
          actorId: auth.user.id,
          action: "organization.member.invite",
          resourceType: "membership",
          resourceId: member.membership.id,
          metadata: { email: parsed.data.email },
          requestId: request.id,
        });

        return member;
      });

      return reply.code(201).send(toMember(created));
    },
  );

  app.patch(
    "/v1/organizations/:id/members/:memberId",
    {
      preHandler: [
        hooks.authenticate,
        hooks.requireCsrf,
        hooks.requirePermission("organization.members.manage"),
      ],
    },
    async (request) => {
      const auth = requireAuth(request);
      const { id, memberId } = request.params as { id: string; memberId: string };
      assertOrganization(auth, id);

      const parsed = updateMemberSchema.safeParse(request.body);
      if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));

      return persistence.withTenant(scopeOf(auth), async () => {
        const updated = await persistence.memberships.update({
          organizationId: id,
          membershipId: memberId,
          ...(parsed.data.status === undefined ? {} : { status: parsed.data.status }),
          ...(parsed.data.roleIds === undefined ? {} : { roleIds: parsed.data.roleIds }),
        });
        if (!updated) throw notFound("Member not found");

        await persistence.audit.record({
          organizationId: id,
          actorType: "user",
          actorId: auth.user.id,
          action: "organization.member.update",
          resourceType: "membership",
          resourceId: memberId,
          requestId: request.id,
        });

        return toMember(updated);
      });
    },
  );

  app.delete(
    "/v1/organizations/:id/members/:memberId",
    {
      preHandler: [
        hooks.authenticate,
        hooks.requireCsrf,
        hooks.requirePermission("organization.members.manage"),
      ],
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id, memberId } = request.params as { id: string; memberId: string };
      assertOrganization(auth, id);

      if (memberId === auth.membership.id) {
        throw new HttpError(409, {
          code: "CANNOT_REMOVE_SELF",
          message: "You cannot remove your own membership",
        });
      }

      await persistence.withTenant(scopeOf(auth), async () => {
        const removed = await persistence.memberships.remove(id, memberId);
        if (!removed) throw notFound("Member not found");
        await persistence.audit.record({
          organizationId: id,
          actorType: "user",
          actorId: auth.user.id,
          action: "organization.member.remove",
          resourceType: "membership",
          resourceId: memberId,
          requestId: request.id,
        });
      });

      return reply.code(204).send();
    },
  );

  app.get(
    "/v1/organizations/:id/roles",
    {
      preHandler: [
        hooks.authenticate,
        hooks.requirePermission("organization.roles.manage"),
      ],
    },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = request.params as { id: string };
      assertOrganization(auth, id);

      const roles = await persistence.withTenant(scopeOf(auth), () =>
        persistence.roles.list(id),
      );
      return { items: roles };
    },
  );

  app.post(
    "/v1/organizations/:id/roles",
    {
      preHandler: [
        hooks.authenticate,
        hooks.requireCsrf,
        hooks.requirePermission("organization.roles.manage"),
        ...(idempotency ? [idempotency.enforce] : []),
      ],
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = request.params as { id: string };
      assertOrganization(auth, id);

      const parsed = roleSchema.safeParse(request.body);
      if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));
      validatePermissionNames(parsed.data.permissions);

      const role = await persistence.withTenant(scopeOf(auth), async () => {
        const existing = await persistence.roles.list(id);
        if (existing.some((entry) => entry.name === parsed.data.name)) {
          throw new HttpError(409, {
            code: "ROLE_EXISTS",
            message: "A role with that name already exists",
          });
        }
        const created = await persistence.roles.create({
          organizationId: id,
          name: parsed.data.name,
          permissions: parsed.data.permissions,
        });
        await persistence.audit.record({
          organizationId: id,
          actorType: "user",
          actorId: auth.user.id,
          action: "organization.role.create",
          resourceType: "role",
          resourceId: created.id,
          requestId: request.id,
        });
        return created;
      });

      return reply.code(201).send(role);
    },
  );

  app.patch(
    "/v1/organizations/:id/roles/:roleId",
    {
      preHandler: [
        hooks.authenticate,
        hooks.requireCsrf,
        hooks.requirePermission("organization.roles.manage"),
      ],
    },
    async (request) => {
      const auth = requireAuth(request);
      const { id, roleId } = request.params as { id: string; roleId: string };
      assertOrganization(auth, id);

      const parsed = roleUpdateSchema.safeParse(request.body);
      if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));
      if (parsed.data.permissions) validatePermissionNames(parsed.data.permissions);

      return persistence.withTenant(scopeOf(auth), async () => {
        const updated = await persistence.roles.update({
          organizationId: id,
          roleId,
          ...(parsed.data.name === undefined ? {} : { name: parsed.data.name }),
          ...(parsed.data.permissions === undefined
            ? {}
            : { permissions: parsed.data.permissions }),
        });
        if (!updated) throw notFound("Role not found or is a system role");

        await persistence.audit.record({
          organizationId: id,
          actorType: "user",
          actorId: auth.user.id,
          action: "organization.role.update",
          resourceType: "role",
          resourceId: roleId,
          requestId: request.id,
        });

        return updated;
      });
    },
  );

  app.delete(
    "/v1/organizations/:id/roles/:roleId",
    {
      preHandler: [
        hooks.authenticate,
        hooks.requireCsrf,
        hooks.requirePermission("organization.roles.manage"),
      ],
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id, roleId } = request.params as { id: string; roleId: string };
      assertOrganization(auth, id);

      await persistence.withTenant(scopeOf(auth), async () => {
        const result = await persistence.roles.remove(id, roleId);
        if (result === "missing") throw notFound("Role not found");
        if (result === "in-use") {
          throw new HttpError(409, {
            code: "ROLE_IN_USE",
            message: "System or assigned roles cannot be deleted",
          });
        }
        await persistence.audit.record({
          organizationId: id,
          actorType: "user",
          actorId: auth.user.id,
          action: "organization.role.delete",
          resourceType: "role",
          resourceId: roleId,
          requestId: request.id,
        });
      });

      return reply.code(204).send();
    },
  );

  app.get(
    "/v1/organizations/:id/permissions",
    { preHandler: [hooks.authenticate] },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = request.params as { id: string };
      assertOrganization(auth, id);

      return {
        items: auth.permissions.map((key) => ({ key })),
      };
    },
  );
}
