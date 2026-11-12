import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import { PLATFORM_LIMITS, createId } from "@nama/dashboard-types";

import type { Env } from "./env.ts";
import { createCredentialCipher } from "./infrastructure/credentials.ts";
import { HttpError, unauthorized } from "./infrastructure/errors.ts";
import { Metrics } from "./infrastructure/metrics.ts";
import {
  createPersistence,
  type Persistence,
} from "./infrastructure/persistence/index.ts";
import { RateLimiter, type RateLimitConfig } from "./infrastructure/rate-limit.ts";
import { createAuthHooks } from "./http/auth.ts";
import { registerAuthRoutes } from "./modules/auth/routes.ts";
import { registerDashboardRoutes } from "./modules/dashboards/routes.ts";
import { registerEmbedTokenRoutes } from "./modules/dashboards/embed-tokens.ts";
import { registerShareRoutes } from "./modules/dashboards/shares.ts";
import { registerDataSourceRoutes } from "./modules/data-sources/routes.ts";
import { registerOrganizationRoutes } from "./modules/organizations/routes.ts";
import { registerPreferenceRoutes } from "./modules/preferences/routes.ts";
import { registerQueryRoutes } from "./modules/queries/routes.ts";
import { createPluginRegistry } from "./modules/queries/plugins/registry.ts";
import { QueryService } from "./modules/queries/service.ts";
import { RealtimeAuthorizer } from "./modules/realtime/authorizer.ts";
import { registerRealtimeGateway } from "./modules/realtime/gateway.ts";
import { RealtimeHub } from "./modules/realtime/hub.ts";
import {
  REALTIME_OPTION_DEFAULTS,
  type RealtimeOptions,
} from "./modules/realtime/options.ts";

export const API_VERSION = "0.1.0";

export interface BuildAppOptions {
  /** Injected persistence so tests can seed extra organizations or freeze time. */
  persistence?: Persistence;
  now?: () => Date;
  /** Injected transport so connector tests reach loopback fixtures. */
  fetch?: typeof globalThis.fetch;
  /** Tightens realtime timings for tests. */
  realtime?: Partial<RealtimeOptions>;
  /** Tightens the in-process rate limits for tests. */
  rateLimits?: { login?: RateLimitConfig; query?: RateLimitConfig };
  /** Observes every registered route; used by the OpenAPI drift check. */
  onRoute?: (route: { method: string | string[]; url: string }) => void;
}

export function buildApp(env: Env, options: BuildAppOptions = {}): FastifyInstance {
  const persistence = options.persistence ?? createPersistence(env);
  const ownsPersistence = options.persistence === undefined;
  const now = options.now ?? (() => new Date());
  const credentialCipher = createCredentialCipher(env.CREDENTIAL_ENCRYPTION_KEY);
  const metrics = new Metrics();
  const queryService = new QueryService({
    persistence,
    plugins: createPluginRegistry(),
    cipher: credentialCipher,
    allowPrivateNetwork: env.ALLOW_PRIVATE_DATA_SOURCES,
    fetch: options.fetch ?? globalThis.fetch,
    metrics,
  });

  const loginLimiter = new RateLimiter(
    options.rateLimits?.login ?? {
      limit: env.LOGIN_RATE_LIMIT,
      windowMs: 5 * 60_000,
    },
  );
  const queryLimiter = new RateLimiter(
    options.rateLimits?.query ?? {
      limit: env.QUERY_RATE_LIMIT,
      windowMs: 60_000,
    },
  );

  const app = Fastify({
    logger:
      env.LOG_LEVEL === "silent"
        ? false
        : {
            level: env.LOG_LEVEL,
            redact: {
              paths: [
                "req.headers.cookie",
                "req.headers.authorization",
                "req.headers.x-csrf-token",
                "res.headers.set-cookie",
              ],
              censor: "[redacted]",
            },
          },
    genReqId: () => createId(),
    bodyLimit: PLATFORM_LIMITS.configBytes * 2,
  });

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", request.id);
    return payload;
  });

  app.addHook("onResponse", async (request, reply) => {
    metrics.observeHttp(
      request.method,
      request.routeOptions.url ?? "unmatched",
      reply.statusCode,
      reply.elapsedTime,
    );
  });

  void app.register(cookie);

  if (options.onRoute) {
    const onRoute = options.onRoute;
    app.addHook("onRoute", (route) => {
      onRoute({ method: route.method, url: route.url });
    });
  }

  if (ownsPersistence) {
    app.addHook("onClose", async () => {
      await persistence.close();
    });
  }

  const hooks = createAuthHooks({ persistence, now });

  registerAuthRoutes(app, {
    persistence,
    now,
    hooks,
    sessionTtlMs: env.SESSION_TTL_HOURS * 3_600_000,
    isProduction: env.NODE_ENV === "production",
    loginLimiter,
    metrics,
  });
  registerDashboardRoutes(app, { persistence, now, hooks });
  registerShareRoutes(app, { persistence, now, hooks });
  registerEmbedTokenRoutes(app, { persistence, now, hooks });
  registerDataSourceRoutes(app, {
    persistence,
    now,
    hooks,
    credentialCipher,
    service: queryService,
  });
  registerOrganizationRoutes(app, { persistence, now, hooks });
  registerPreferenceRoutes(app, { persistence, hooks });
  registerQueryRoutes(app, {
    service: queryService,
    hooks,
    limiter: queryLimiter,
    metrics,
    now,
  });

  const realtimeOptions: RealtimeOptions = {
    ...REALTIME_OPTION_DEFAULTS,
    pollIntervalMs: env.REALTIME_POLL_INTERVAL_MS,
    maxConnections: env.REALTIME_MAX_CONNECTIONS,
    ...options.realtime,
  };
  const realtimeHub = new RealtimeHub({
    service: queryService,
    options: realtimeOptions,
    now: () => now().getTime(),
    logger: app.log,
  });
  registerRealtimeGateway(app, {
    authorizer: new RealtimeAuthorizer({ persistence, now }),
    hub: realtimeHub,
    options: realtimeOptions,
    now: () => now().getTime(),
    metrics,
  });

  app.get("/healthz", async () => ({
    status: "ok",
    version: API_VERSION,
    persistence: persistence.kind,
  }));

  app.get("/readyz", async (request, reply) => {
    try {
      await persistence.ready();
      return { status: "ready", persistence: persistence.kind };
    } catch (error) {
      request.log.error({ err: error }, "readiness probe failed");
      return reply.code(503).send({
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "The persistence layer is not ready",
        },
      });
    }
  });

  app.get("/metrics", async (request, reply) => {
    if (env.METRICS_TOKEN) {
      const header = request.headers.authorization;
      if (header !== `Bearer ${env.METRICS_TOKEN}`) throw unauthorized();
    }
    return reply
      .code(200)
      .header("content-type", "text/plain; version=0.0.4; charset=utf-8")
      .send(metrics.render());
  });

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
