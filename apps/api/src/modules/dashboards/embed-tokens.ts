import type { FastifyInstance, FastifyRequest } from "fastify";
import { createHash, randomBytes } from "node:crypto";
import { createId } from "@nama/dashboard-types";
import { issuesFromZod } from "@nama/dashboard-types";
import { z } from "zod";

import { notFound, unauthorized, validationFailed } from "../../infrastructure/errors.ts";
import type { Persistence, TenantScope } from "../../infrastructure/persistence/types.ts";
import type { AuthContext, AuthHooks } from "../../http/auth.ts";

const issueSchema = z
  .object({
    expiresInSeconds: z.coerce.number().int().min(60).max(31_536_000),
    viewerIdentity: z.string().trim().max(200).optional(),
    scope: z
      .object({
        variables: z.record(z.string(), z.unknown()).optional(),
        filters: z.record(z.string(), z.unknown()).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export interface EmbedTokenRouteDeps {
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

export function registerEmbedTokenRoutes(
  app: FastifyInstance,
  { persistence, now, hooks }: EmbedTokenRouteDeps,
): void {
  app.post(
    "/v1/dashboards/:id/embed-tokens",
    {
      preHandler: [
        hooks.authenticate,
        hooks.requireCsrf,
        hooks.requirePermission("dashboard.share"),
      ],
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = request.params as { id: string };
      const parsed = issueSchema.safeParse(request.body);
      if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));

      return persistence.withTenant(scopeOf(auth), async () => {
        const dashboard = await persistence.dashboards.find(auth.organization.id, id);
        if (!dashboard) throw notFound("Dashboard not found");
        if (!dashboard.publishedConfig) {
          throw validationFailed([
            {
              code: "invalid_value",
              path: ["dashboard"],
              message: "Only published dashboards can be embedded",
            },
          ]);
        }

        const token = randomBytes(32).toString("base64url");
        const tokenHash = createHash("sha256").update(token).digest();
        const timestamp = now();
        const expiresAt = new Date(
          timestamp.getTime() + parsed.data.expiresInSeconds * 1000,
        ).toISOString();

        const record = {
          id: createId(),
          dashboardId: id,
          organizationId: auth.organization.id,
          tokenHash,
          issuedBy: auth.user.id,
          viewerIdentity: parsed.data.viewerIdentity ?? null,
          scope: {
            dashboardIds: [id],
            ...(parsed.data.scope?.variables
              ? { variables: parsed.data.scope.variables }
              : {}),
            ...(parsed.data.scope?.filters ? { filters: parsed.data.scope.filters } : {}),
          },
          expiresAt,
          revokedAt: null,
          createdAt: timestamp.toISOString(),
        };

        await persistence.embedTokens.create(record);
        await persistence.audit.record({
          organizationId: auth.organization.id,
          actorType: "user",
          actorId: auth.user.id,
          action: "embed_token.issue",
          resourceType: "dashboard",
          resourceId: id,
          metadata: { tokenId: record.id, expiresAt },
          requestId: request.id,
        });

        return reply.code(201).send({
          id: record.id,
          token,
          expiresAt,
        });
      });
    },
  );

  app.delete(
    "/v1/dashboards/:id/embed-tokens/:tokenId",
    {
      preHandler: [
        hooks.authenticate,
        hooks.requireCsrf,
        hooks.requirePermission("dashboard.share"),
      ],
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id, tokenId } = request.params as { id: string; tokenId: string };

      await persistence.withTenant(scopeOf(auth), async () => {
        const dashboard = await persistence.dashboards.find(auth.organization.id, id);
        if (!dashboard) throw notFound("Dashboard not found");
        const revoked = await persistence.embedTokens.revoke(
          auth.organization.id,
          id,
          tokenId,
          now().toISOString(),
        );
        if (!revoked) throw notFound("Embed token not found");
        await persistence.audit.record({
          organizationId: auth.organization.id,
          actorType: "user",
          actorId: auth.user.id,
          action: "embed_token.revoke",
          resourceType: "dashboard",
          resourceId: id,
          metadata: { tokenId },
          requestId: request.id,
        });
      });

      return reply.code(204).send();
    },
  );
}
