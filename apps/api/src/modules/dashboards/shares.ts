import type { FastifyInstance, FastifyRequest } from "fastify";
import { issuesFromZod } from "@nama/dashboard-types";
import { z } from "zod";

import {
  notFound,
  revisionConflict,
  unauthorized,
  validationFailed,
} from "../../infrastructure/errors.ts";
import type {
  DashboardShareRecord,
  Persistence,
  TenantScope,
} from "../../infrastructure/persistence/types.ts";
import type { AuthContext, AuthHooks } from "../../http/auth.ts";
import { parseIfMatch } from "./service.ts";

const shareSchema = z
  .object({
    id: z.uuid().optional(),
    subjectType: z.enum(["user", "role", "organization"]),
    subjectId: z.uuid(),
    permission: z.enum(["view", "edit"]),
  })
  .strict();

const replaceSchema = z.object({ shares: z.array(shareSchema).max(200) }).strict();

export interface ShareRouteDeps {
  persistence: Persistence;
  now: () => Date;
  hooks: AuthHooks;
}

function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw unauthorized();
  return request.auth;
}

function scopeOf(auth: AuthContext): TenantScope {
  return { organizationId: auth.organization.id, userId: auth.user.id };
}

function toShare(record: DashboardShareRecord) {
  return {
    id: record.id,
    subjectType: record.subjectType,
    subjectId: record.subjectId,
    permission: record.permission,
  };
}

export function registerShareRoutes(
  app: FastifyInstance,
  { persistence, now, hooks }: ShareRouteDeps,
): void {
  app.get(
    "/v1/dashboards/:id/shares",
    {
      preHandler: [hooks.authenticate, hooks.requirePermission("dashboard.read")],
    },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = request.params as { id: string };

      return persistence.withTenant(scopeOf(auth), async () => {
        const dashboard = await persistence.dashboards.find(auth.organization.id, id);
        if (!dashboard) throw notFound("Dashboard not found");
        const shares = await persistence.shares.list(auth.organization.id, id);
        return { items: shares.map(toShare) };
      });
    },
  );

  app.put(
    "/v1/dashboards/:id/shares",
    {
      preHandler: [
        hooks.authenticate,
        hooks.requireCsrf,
        hooks.requirePermission("dashboard.share"),
      ],
    },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = request.params as { id: string };
      const expectedRevision = parseIfMatch(request.headers["if-match"]);

      const parsed = replaceSchema.safeParse(request.body);
      if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));

      return persistence.withTenant(scopeOf(auth), async () => {
        const dashboard = await persistence.dashboards.find(auth.organization.id, id);
        if (!dashboard) throw notFound("Dashboard not found");
        if (dashboard.revision !== expectedRevision) {
          throw revisionConflict(dashboard.revision);
        }

        for (const share of parsed.data.shares) {
          if (share.subjectType === "organization") {
            if (share.subjectId !== auth.organization.id) {
              throw validationFailed([
                {
                  code: "invalid_value",
                  path: ["shares", share.subjectId],
                  message: "Only the current organization can be shared with",
                },
              ]);
            }
            continue;
          }
          const scope =
            share.subjectType === "role"
              ? await persistence.roles.find(auth.organization.id, share.subjectId)
              : await persistence.memberships
                  .list(auth.organization.id, {
                    offset: 0,
                    limit: 1000,
                  })
                  .then(
                    (result) =>
                      result.items.find((member) => member.user.id === share.subjectId) ??
                      null,
                  );
          if (!scope) {
            throw validationFailed([
              {
                code: "invalid_value",
                path: ["shares", share.subjectId],
                message: `Unknown ${share.subjectType} in this organization`,
              },
            ]);
          }
        }

        const shares = await persistence.shares.replace(
          auth.organization.id,
          id,
          parsed.data.shares,
          now().toISOString(),
        );
        await persistence.audit.record({
          organizationId: auth.organization.id,
          actorType: "user",
          actorId: auth.user.id,
          action: "dashboard.share",
          resourceType: "dashboard",
          resourceId: id,
          metadata: { count: shares.length },
          requestId: request.id,
        });

        return { items: shares.map(toShare) };
      });
    },
  );
}
