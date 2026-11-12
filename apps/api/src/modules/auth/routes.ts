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
  rateLimited,
  unauthorized,
  validationFailed,
} from "../../infrastructure/errors.ts";
import type { AuthDeps, AuthHooks } from "../../http/auth.ts";
import type { Metrics } from "../../infrastructure/metrics.ts";
import { verifyPassword } from "../../infrastructure/passwords.ts";
import type { RateLimiter } from "../../infrastructure/rate-limit.ts";
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
  loginLimiter: RateLimiter;
  metrics: Metrics;
}

export function registerAuthRoutes(
  app: FastifyInstance,
  {
    persistence,
    now,
    hooks,
    sessionTtlMs,
    isProduction,
    loginLimiter,
    metrics,
  }: AuthRouteDeps,
): void {
  app.post("/v1/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));

    const decision = loginLimiter.consume(
      `${request.ip}|${parsed.data.email.trim().toLowerCase()}`,
      now().getTime(),
    );
    if (!decision.allowed) {
      metrics.recordRateLimited("login");
      reply.header("retry-after", Math.ceil(decision.retryAfterMs / 1000));
      throw rateLimited(decision.retryAfterMs);
    }

    const user = await persistence.users.findByEmail(parsed.data.email);
    const passwordMatches =
      user && user.passwordHash
        ? await verifyPassword(user.passwordHash, parsed.data.password)
        : false;

    if (!user || user.status !== "active" || !passwordMatches) {
      throw new HttpError(401, {
        code: "INVALID_CREDENTIALS",
        message: "Email or password is incorrect",
      });
    }

    const active = await persistence.memberships.findFirstActive(user.id);
    if (!active) throw forbidden("No active organization membership");

    const organization = await persistence.organizations.findById(
      active.membership.organizationId,
    );
    if (!organization) throw forbidden("Organization is not available");

    await persistence.sessions.deleteExpired(now());
    const { token, session } = await issueSession(
      persistence,
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

    const preferences = await persistence.users.getPreferences(user.id);

    return toSessionPayload({
      user,
      organization,
      roleNames: active.roleNames,
      session,
      permissions: active.permissions,
      preferences,
    });
  });

  app.get("/v1/auth/session", { preHandler: [hooks.authenticate] }, async (request) => {
    const auth = request.auth;
    if (!auth) throw unauthorized();
    const preferences = await persistence.users.getPreferences(auth.user.id);

    return toSessionPayload({
      user: auth.user,
      organization: auth.organization,
      roleNames: auth.roleNames,
      session: auth.session,
      permissions: auth.permissions,
      preferences,
    });
  });

  app.post(
    "/v1/auth/logout",
    { preHandler: [hooks.authenticate, hooks.requireCsrf] },
    async (request, reply) => {
      const token = request.cookies?.[SESSION_COOKIE];
      if (token) await persistence.sessions.deleteByTokenHash(hashSessionToken(token));

      reply.clearCookie(SESSION_COOKIE, { path: "/" });
      reply.clearCookie(CSRF_COOKIE, { path: "/" });
      return reply.code(204).send();
    },
  );
}
