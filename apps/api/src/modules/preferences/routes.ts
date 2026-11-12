import type { FastifyInstance, FastifyRequest } from "fastify";
import { issuesFromZod, timeZoneSchema } from "@nama/dashboard-types";
import { z } from "zod";

import { notFound, unauthorized, validationFailed } from "../../infrastructure/errors.ts";
import type { Persistence } from "../../infrastructure/persistence/types.ts";
import type { AuthContext, AuthHooks } from "../../http/auth.ts";

const updateSchema = z
  .object({
    locale: z.enum(["en", "fa"]).optional(),
    theme: z.enum(["light", "dark", "system"]).optional(),
    timezone: timeZoneSchema.optional(),
    defaultOrganizationId: z.uuid().optional(),
  })
  .strict();

export interface PreferenceRouteDeps {
  persistence: Persistence;
  hooks: AuthHooks;
}

function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw unauthorized();
  return request.auth;
}

function toPayload(preferences: {
  locale: string;
  theme: string;
  timezone: string;
  defaultOrganizationId: string | null;
}) {
  return {
    locale: preferences.locale,
    theme: preferences.theme,
    timezone: preferences.timezone,
    defaultOrganizationId: preferences.defaultOrganizationId,
  };
}

export function registerPreferenceRoutes(
  app: FastifyInstance,
  { persistence, hooks }: PreferenceRouteDeps,
): void {
  app.get("/v1/me/preferences", { preHandler: [hooks.authenticate] }, async (request) => {
    const auth = requireAuth(request);
    const preferences = (await persistence.users.getPreferences(auth.user.id)) ?? {
      userId: auth.user.id,
      locale: "en" as const,
      theme: "system" as const,
      timezone: "UTC",
      defaultOrganizationId: auth.organization.id,
    };
    return toPayload(preferences);
  });

  app.patch(
    "/v1/me/preferences",
    { preHandler: [hooks.authenticate, hooks.requireCsrf] },
    async (request) => {
      const auth = requireAuth(request);
      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));

      if (parsed.data.defaultOrganizationId) {
        const membership = await persistence.memberships.findActive(
          auth.user.id,
          parsed.data.defaultOrganizationId,
        );
        if (!membership) throw notFound("Organization is not available");
      }

      const updated = await persistence.users.updatePreferences(
        auth.user.id,
        parsed.data,
      );
      return toPayload(updated);
    },
  );
}
