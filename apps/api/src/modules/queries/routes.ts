import type { FastifyInstance } from "fastify";
import { issuesFromZod, queryRequestSchema } from "@nama/dashboard-types";

import { HttpError } from "../../infrastructure/errors.ts";
import type { AuthHooks } from "../../http/auth.ts";
import { DEMO_DATA_SOURCE_ID, executeDemoQuery } from "./service.ts";

export interface QueryRouteDeps {
  now: () => Date;
  hooks: AuthHooks;
}

export function registerQueryRoutes(
  app: FastifyInstance,
  { now, hooks }: QueryRouteDeps,
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

      if (parsed.data.dataSourceId !== DEMO_DATA_SOURCE_ID) {
        throw new HttpError(422, {
          code: "QUERY_INVALID",
          message: `Unknown data source "${parsed.data.dataSourceId}"`,
        });
      }

      return executeDemoQuery(parsed.data, now());
    },
  );
}
