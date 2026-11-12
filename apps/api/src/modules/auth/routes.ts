import type { FastifyInstance } from "fastify";
import { issuesFromZod } from "@nama/dashboard-types";
import { z } from "zod";

import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  csrfCookieOptions,
  hashSessionToken,
  issueSession,
  sessionCookieOptions,
} from "../../infrastructure/sessions.ts";
import {
  HttpError,
  forbidden,
  unauthorized,
  validationFailed,
} from "../../infrastructure/errors.ts";
import { findUserByEmail, permissionsFor } from "../../infrastructure/store.ts";
import type { AuthDeps, AuthHooks } from "../../http/auth.ts";
import { verifyPassword } from "../../infrastructure/passwords.ts";
import { toSessionPayload } from "./service.ts";

const loginSchema = z
  .object({
    email: z.email().max(320),
    password: z.string().min(1).max(1024),
  })
  .strict();

export interface AuthRouteDeps extends AuthDeps {
  hooks: AuthHooks;
  sessionTtlMs: number;
  isProduction: boolean;
}

export function registerAuthRoutes(
  app: FastifyInstance,
  { store, now, hooks, sessionTtlMs, isProduction }: AuthRouteDeps,
): void {
  app.post("/v1/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));

    const user = findUserByEmail(store, parsed.data.email);
    const passwordMatches = user
      ? await verifyPassword(user.passwordHash, parsed.data.password)
      : false;

    if (!user || user.status !== "active" || !passwordMatches) {
      throw new HttpError(401, {
        code: "INVALID_CREDENTIALS",
        message: "Email or password is incorrect",
      });
    }

    const membership = store.memberships.find(
      (candidate) => candidate.userId === user.id && candidate.status === "active",
    );
    const organization = membership
      ? store.organizations.get(membership.organizationId)
      : undefined;

    if (!membership || !organization) {
      throw forbidden("No active organization membership");
    }

    const { token, session } = issueSession(
      store,
      user.id,
      organization.id,
      sessionTtlMs,
      now(),
    );

    reply.setCookie(
      SESSION_COOKIE,
      token,
      sessionCookieOptions(isProduction, sessionTtlMs),
    );
    reply.setCookie(
      CSRF_COOKIE,
      session.csrfToken,
      csrfCookieOptions(isProduction, sessionTtlMs),
    );

    return toSessionPayload({
      user,
      organization,
      membership,
      session,
      permissions: permissionsFor(membership.role),
    });
  });

  app.get("/v1/auth/session", { preHandler: [hooks.authenticate] }, async (request) => {
    const auth = request.auth;
    if (!auth) throw unauthorized();

    return toSessionPayload({
      user: auth.user,
      organization: auth.organization,
      membership: auth.membership,
      session: auth.session,
      permissions: auth.permissions,
    });
  });

  app.post(
    "/v1/auth/logout",
    { preHandler: [hooks.authenticate, hooks.requireCsrf] },
    async (request, reply) => {
      const token = request.cookies?.[SESSION_COOKIE];
      if (token) store.sessions.delete(hashSessionToken(token));

      reply.clearCookie(SESSION_COOKIE, { path: "/" });
      reply.clearCookie(CSRF_COOKIE, { path: "/" });
      return reply.code(204).send();
    },
  );
}
