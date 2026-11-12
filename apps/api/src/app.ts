import Fastify, { type FastifyInstance } from "fastify";

import type { Env } from "./env.ts";

export const API_VERSION = "0.1.0";

export function buildApp(env: Pick<Env, "LOG_LEVEL">): FastifyInstance {
  const app = Fastify({
    logger: env.LOG_LEVEL === "silent" ? false : { level: env.LOG_LEVEL },
  });

  app.get("/healthz", async () => ({
    status: "ok",
    version: API_VERSION,
  }));

  return app;
}
