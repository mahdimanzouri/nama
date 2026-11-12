import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import { PLATFORM_LIMITS, createId } from "@nama/dashboard-types";

import type { Env } from "./env.ts";
import { HttpError } from "./infrastructure/errors.ts";
import { createSeededStore, type Store } from "./infrastructure/store.ts";
import { createAuthHooks } from "./http/auth.ts";
import { registerAuthRoutes } from "./modules/auth/routes.ts";
import { registerDashboardRoutes } from "./modules/dashboards/routes.ts";
import { registerQueryRoutes } from "./modules/queries/routes.ts";

export const API_VERSION = "0.1.0";

export interface BuildAppOptions {
  /** Injected store so tests can seed extra organizations or freeze time. */
  store?: Store;
  now?: () => Date;
}

export function buildApp(env: Env, options: BuildAppOptions = {}): FastifyInstance {
  const store = options.store ?? createSeededStore(env);
  const now = options.now ?? (() => new Date());

  const app = Fastify({
    logger: env.LOG_LEVEL === "silent" ? false : { level: env.LOG_LEVEL },
    genReqId: () => createId(),
    bodyLimit: PLATFORM_LIMITS.configBytes * 2,
  });

  void app.register(cookie);

  const hooks = createAuthHooks({ store, now });

  registerAuthRoutes(app, {
    store,
    now,
    hooks,
    sessionTtlMs: env.SESSION_TTL_HOURS * 3_600_000,
    isProduction: env.NODE_ENV === "production",
  });
  registerDashboardRoutes(app, { store, now, hooks });
  registerQueryRoutes(app, { now, hooks });

  app.get("/healthz", async () => ({
    status: "ok",
    version: API_VERSION,
  }));

  app.setErrorHandler((error: unknown, request, reply) => {
    if (error instanceof HttpError) {
      void reply.code(error.status).send({
        error: {
          code: error.code,
          message: error.message,
          requestId: request.id,
          ...(error.fieldPaths ? { fieldPaths: error.fieldPaths } : {}),
          ...(error.issues ? { issues: error.issues } : {}),
          ...(error.currentRevision === undefined
            ? {}
            : { currentRevision: error.currentRevision }),
          ...(error.retryAfterMs === undefined
            ? {}
            : { retryAfterMs: error.retryAfterMs }),
        },
      });
      return;
    }

    const failure = error as { statusCode?: number; code?: string; message?: string };
    const status =
      typeof failure.statusCode === "number" &&
      failure.statusCode >= 400 &&
      failure.statusCode < 500
        ? failure.statusCode
        : 500;

    if (status >= 500) request.log.error({ err: error }, "request failed");

    void reply.code(status).send({
      error: {
        code: status >= 500 ? "INTERNAL" : (failure.code ?? "BAD_REQUEST"),
        message: status >= 500 ? "Unexpected error" : (failure.message ?? "Bad request"),
        requestId: request.id,
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    void reply.code(404).send({
      error: {
        code: "NOT_FOUND",
        message: "Route not found",
        requestId: request.id,
      },
    });
  });

  return app;
}
