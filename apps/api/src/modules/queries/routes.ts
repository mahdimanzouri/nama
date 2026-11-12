import type { FastifyInstance } from "fastify";
import { issuesFromZod, queryRequestSchema } from "@nama/dashboard-types";

import { HttpError } from "../../infrastructure/errors.ts";
import type { AuthContext, AuthHooks } from "../../http/auth.ts";
import { callerFromAuth, type QueryService } from "./service.ts";

export interface QueryRouteDeps {
  service: QueryService;
  hooks: AuthHooks;
}

function requireAuth(request: { auth?: AuthContext }): AuthContext {
  if (!request.auth) {
    throw new HttpError(401, {
      code: "UNAUTHENTICATED",
      message: "Authentication required",
    });
  }
  return request.auth;
}

export function registerQueryRoutes(
  app: FastifyInstance,
  { service, hooks }: QueryRouteDeps,
): void {
  app.post(
    "/v1/queries/execute",
    {
      preHandler: [
        hooks.authenticate,
        hooks.requireCsrf,
        hooks.requirePermission("datasource.execute"),
      ],
    },
    async (request) => {
      const auth = requireAuth(request);
      const parsed = queryRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        const issues = issuesFromZod(parsed.error);
        throw new HttpError(422, {
          code: "QUERY_INVALID",
          message: "The query request failed validation",
          issues,
          fieldPaths: issues.map((issue) => issue.path.join(".")),
        });
      }

      const controller = new AbortController();
      const onAborted = () => controller.abort();
      request.raw.once("aborted", onAborted);

      try {
        return await service.execute(callerFromAuth(auth), parsed.data, {
          requestId: request.id,
          signal: controller.signal,
          logger: request.log,
        });
      } finally {
        request.raw.off("aborted", onAborted);
      }
    },
  );

  app.post(
    "/v1/queries/validate",
    {
      preHandler: [
        hooks.authenticate,
        hooks.requireCsrf,
        hooks.requirePermission("datasource.execute"),
      ],
    },
    async (request) => {
      const auth = requireAuth(request);
      const parsed = queryRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        const issues = issuesFromZod(parsed.error);
        throw new HttpError(422, {
          code: "QUERY_INVALID",
          message: "The query request failed validation",
          issues,
          fieldPaths: issues.map((issue) => issue.path.join(".")),
        });
      }

      return service.validate(callerFromAuth(auth), parsed.data, {
        requestId: request.id,
        logger: request.log,
      });
    },
  );
}
