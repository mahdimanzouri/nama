import type { FastifyInstance } from "fastify";
import {
  ISSUE_CODES,
  createId,
  issuesFromZod,
  parseDashboardConfig,
  type ValidationIssue,
} from "@nama/dashboard-types";
import { z } from "zod";

import { createEmptyDashboardConfig } from "../../infrastructure/config.ts";
import {
  HttpError,
  notFound,
  revisionConflict,
  unauthorized,
  validationFailed,
} from "../../infrastructure/errors.ts";
import type { DashboardRecord, Store } from "../../infrastructure/store.ts";
import type { AuthHooks } from "../../http/auth.ts";
import {
  findDashboard,
  parseIfMatch,
  toDraft,
  toSummary,
  toVersionSummary,
  toView,
} from "./service.ts";

const createSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(2000).optional(),
  })
  .strict();

const saveDraftSchema = z
  .object({
    config: z.unknown(),
  })
  .strict();

const listQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

const restoreSchema = z.object({ versionId: z.uuid() }).strict();

export interface DashboardRouteDeps {
  store: Store;
  now: () => Date;
  hooks: AuthHooks;
}

function requireAuth(request: Parameters<AuthHooks["authenticate"]>[0]) {
  if (!request.auth) throw unauthorized();
  return request.auth;
}

function validationFailure(issues: ValidationIssue[]): HttpError {
  if (issues.some((issue) => issue.code === ISSUE_CODES.configTooLarge)) {
    return new HttpError(413, {
      code: ISSUE_CODES.configTooLarge,
      message: "The dashboard configuration exceeds the 1 MiB limit",
      issues,
    });
  }

  return validationFailed(issues);
}

export function registerDashboardRoutes(
  app: FastifyInstance,
  { store, now, hooks }: DashboardRouteDeps,
): void {
  app.get(
    "/v1/dashboards",
    {
      preHandler: [hooks.authenticate, hooks.requirePermission("dashboard.read")],
    },
    async (request) => {
      const auth = requireAuth(request);
      const query = listQuerySchema.safeParse(request.query);
      if (!query.success) throw validationFailed(issuesFromZod(query.error));

      const { page, pageSize } = query.data;
      const records = [...store.dashboards.values()]
        .filter((record) => record.organizationId === auth.session.organizationId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

      const start = (page - 1) * pageSize;
      return {
        items: records.slice(start, start + pageSize).map(toSummary),
        pagination: { page, pageSize, total: records.length },
      };
    },
  );

  app.post(
    "/v1/dashboards",
    {
      preHandler: [
        hooks.authenticate,
        hooks.requireCsrf,
        hooks.requirePermission("dashboard.create"),
      ],
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));

      const timestamp = now().toISOString();
      const config = createEmptyDashboardConfig(parsed.data.name);
      if (parsed.data.description) {
        config.metadata.description = parsed.data.description;
      }

      const record: DashboardRecord = {
        id: createId(),
        organizationId: auth.session.organizationId,
        name: parsed.data.name,
        draftConfig: config,
        revision: 1,
        createdBy: auth.user.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      store.dashboards.set(record.id, record);
      return reply.code(201).send(toView(record, auth.permissions));
    },
  );

  app.get(
    "/v1/dashboards/:id",
    {
      preHandler: [hooks.authenticate, hooks.requirePermission("dashboard.read")],
    },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = request.params as { id: string };
      const record = findDashboard(store, auth.session, id);
      if (!record) throw notFound("Dashboard not found");

      return toView(record, auth.permissions);
    },
  );

  app.get(
    "/v1/dashboards/:id/draft",
    {
      preHandler: [hooks.authenticate, hooks.requirePermission("dashboard.update")],
    },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = request.params as { id: string };
      const record = findDashboard(store, auth.session, id);
      if (!record) throw notFound("Dashboard not found");

      return toDraft(record);
    },
  );

  app.put(
    "/v1/dashboards/:id/draft",
    {
      preHandler: [
        hooks.authenticate,
        hooks.requireCsrf,
        hooks.requirePermission("dashboard.update"),
      ],
    },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = request.params as { id: string };
      const record = findDashboard(store, auth.session, id);
      if (!record) throw notFound("Dashboard not found");

      const expectedRevision = parseIfMatch(request.headers["if-match"]);
      if (record.revision !== expectedRevision) {
        throw revisionConflict(record.revision);
      }

      const parsed = saveDraftSchema.safeParse(request.body);
      if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));
      if (parsed.data.config === undefined) {
        throw validationFailed([
          { code: "invalid_type", path: ["config"], message: "config is required" },
        ]);
      }

      const result = parseDashboardConfig(parsed.data.config);
      if (!result.ok) throw validationFailure(result.issues);

      const timestamp = now().toISOString();
      record.draftConfig = result.value;
      record.name = result.value.metadata.title;
      record.revision += 1;
      record.updatedAt = timestamp;

      return { revision: record.revision, updatedAt: timestamp };
    },
  );

  app.post(
    "/v1/dashboards/:id/publish",
    {
      preHandler: [
        hooks.authenticate,
        hooks.requireCsrf,
        hooks.requirePermission("dashboard.publish"),
      ],
    },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = request.params as { id: string };
      const record = findDashboard(store, auth.session, id);
      if (!record) throw notFound("Dashboard not found");

      const expectedRevision = parseIfMatch(request.headers["if-match"]);
      if (record.revision !== expectedRevision) {
        throw revisionConflict(record.revision);
      }

      const timestamp = now().toISOString();
      record.publishedConfig = record.draftConfig;
      record.publishedAt = timestamp;
      record.revision += 1;
      record.publishedRevision = record.revision;
      record.updatedAt = timestamp;

      store.versions.push({
        id: createId(),
        dashboardId: record.id,
        organizationId: record.organizationId,
        revision: record.revision,
        config: record.publishedConfig,
        createdBy: auth.user.id,
        createdAt: timestamp,
      });

      const versions = store.versions.filter(
        (version) => version.dashboardId === record.id,
      );
      const excess = versions.length - 50;
      if (excess > 0) {
        const removed = new Set(versions.slice(0, excess).map((version) => version.id));
        store.versions = store.versions.filter((version) => !removed.has(version.id));
      }

      return toView(record, auth.permissions);
    },
  );

  app.get(
    "/v1/dashboards/:id/versions",
    {
      preHandler: [hooks.authenticate, hooks.requirePermission("dashboard.read")],
    },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = request.params as { id: string };
      const record = findDashboard(store, auth.session, id);
      if (!record) throw notFound("Dashboard not found");

      const query = listQuerySchema.safeParse(request.query);
      if (!query.success) throw validationFailed(issuesFromZod(query.error));

      const { page, pageSize } = query.data;
      const versions = store.versions
        .filter((version) => version.dashboardId === record.id)
        .sort((left, right) => right.revision - left.revision);
      const start = (page - 1) * pageSize;

      return {
        items: versions.slice(start, start + pageSize).map(toVersionSummary),
        pagination: { page, pageSize, total: versions.length },
      };
    },
  );

  app.post(
    "/v1/dashboards/:id/restore",
    {
      preHandler: [
        hooks.authenticate,
        hooks.requireCsrf,
        hooks.requirePermission("dashboard.update"),
      ],
    },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = request.params as { id: string };
      const record = findDashboard(store, auth.session, id);
      if (!record) throw notFound("Dashboard not found");

      const expectedRevision = parseIfMatch(request.headers["if-match"]);
      if (record.revision !== expectedRevision) {
        throw revisionConflict(record.revision);
      }

      const parsed = restoreSchema.safeParse(request.body);
      if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));

      const version = store.versions.find(
        (entry) => entry.id === parsed.data.versionId && entry.dashboardId === record.id,
      );
      if (!version) throw notFound("Version not found");

      const timestamp = now().toISOString();
      record.draftConfig = version.config;
      record.name = version.config.metadata.title;
      record.revision += 1;
      record.updatedAt = timestamp;

      return toDraft(record);
    },
  );
}
