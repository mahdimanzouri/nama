import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  ISSUE_CODES,
  PLATFORM_LIMITS,
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
import type {
  DashboardRecord,
  Persistence,
  RevisionWriteResult,
  TenantScope,
} from "../../infrastructure/persistence/types.ts";
import type { AuthContext, AuthHooks } from "../../http/auth.ts";
import { parseIfMatch, toDraft, toSummary, toVersionSummary, toView } from "./service.ts";

const createSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(2000).optional(),
  })
  .strict();

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    metadata: z
      .object({
        title: z.string().trim().min(1).max(200).optional(),
        description: z.string().max(2000).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((value) => value.name || value.metadata?.title, {
    message: "name or metadata.title is required",
    path: ["name"],
  });

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

function unwrapWrite(result: RevisionWriteResult): DashboardRecord {
  if (result.status === "missing") throw notFound("Dashboard not found");
  if (result.status === "conflict") throw revisionConflict(result.currentRevision);
  return result.record;
}

export function registerDashboardRoutes(
  app: FastifyInstance,
  { persistence, now, hooks }: DashboardRouteDeps,
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
      const result = await persistence.withTenant(scopeOf(auth), () =>
        persistence.dashboards.list(auth.organization.id, {
          offset: (page - 1) * pageSize,
          limit: pageSize,
        }),
      );

      return {
        items: result.items.map(toSummary),
        pagination: { page, pageSize, total: result.total },
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
        organizationId: auth.organization.id,
        name: parsed.data.name,
        draftConfig: config,
        publishedConfig: null,
        revision: 1,
        publishedRevision: null,
        createdBy: auth.user.id,
        createdAt: timestamp,
        updatedAt: timestamp,
        publishedAt: null,
      };

      await persistence.withTenant(scopeOf(auth), async () => {
        await persistence.dashboards.create(record);
        await persistence.audit.record({
          organizationId: auth.organization.id,
          actorType: "user",
          actorId: auth.user.id,
          action: "dashboard.create",
          resourceType: "dashboard",
          resourceId: record.id,
          requestId: request.id,
        });
      });

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
      const record = await persistence.withTenant(scopeOf(auth), () =>
        persistence.dashboards.find(auth.organization.id, id),
      );
      if (!record) throw notFound("Dashboard not found");

      return toView(record, auth.permissions);
    },
  );

  app.patch(
    "/v1/dashboards/:id",
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
      const expectedRevision = parseIfMatch(request.headers["if-match"]);

      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));

      const name = parsed.data.name ?? parsed.data.metadata?.title;
      if (!name) throw validationFailed([]);

      return persistence.withTenant(scopeOf(auth), async () => {
        const record = await persistence.dashboards.find(auth.organization.id, id);
        if (!record) throw notFound("Dashboard not found");
        if (record.revision !== expectedRevision) {
          throw revisionConflict(record.revision);
        }
        const updated = await persistence.dashboards.rename(
          auth.organization.id,
          id,
          name,
        );
        if (!updated) throw notFound("Dashboard not found");
        await persistence.audit.record({
          organizationId: auth.organization.id,
          actorType: "user",
          actorId: auth.user.id,
          action: "dashboard.update",
          resourceType: "dashboard",
          resourceId: id,
          metadata: { name },
          requestId: request.id,
        });
        return toSummary(updated);
      });
    },
  );

  app.delete(
    "/v1/dashboards/:id",
    {
      preHandler: [
        hooks.authenticate,
        hooks.requireCsrf,
        hooks.requirePermission("dashboard.delete"),
      ],
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = request.params as { id: string };
      const expectedRevision = parseIfMatch(request.headers["if-match"]);

      await persistence.withTenant(scopeOf(auth), async () => {
        const record = await persistence.dashboards.find(auth.organization.id, id);
        if (!record) throw notFound("Dashboard not found");
        if (record.revision !== expectedRevision) {
          throw revisionConflict(record.revision);
        }
        const removed = await persistence.dashboards.remove(auth.organization.id, id);
        if (!removed) throw notFound("Dashboard not found");
        await persistence.audit.record({
          organizationId: auth.organization.id,
          actorType: "user",
          actorId: auth.user.id,
          action: "dashboard.delete",
          resourceType: "dashboard",
          resourceId: id,
          requestId: request.id,
        });
      });

      return reply.code(204).send();
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
      const record = await persistence.withTenant(scopeOf(auth), () =>
        persistence.dashboards.find(auth.organization.id, id),
      );
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
      const expectedRevision = parseIfMatch(request.headers["if-match"]);

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
      const record = await persistence.withTenant(scopeOf(auth), async () => {
        const written = unwrapWrite(
          await persistence.dashboards.saveDraft({
            organizationId: auth.organization.id,
            id,
            expectedRevision,
            config: result.value,
            now: timestamp,
          }),
        );
        await persistence.audit.record({
          organizationId: auth.organization.id,
          actorType: "user",
          actorId: auth.user.id,
          action: "dashboard.update",
          resourceType: "dashboard",
          resourceId: id,
          metadata: { revision: written.revision },
          requestId: request.id,
        });
        return written;
      });

      return { revision: record.revision, updatedAt: record.updatedAt };
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
      const expectedRevision = parseIfMatch(request.headers["if-match"]);

      const record = await persistence.withTenant(scopeOf(auth), async () => {
        const published = unwrapWrite(
          await persistence.dashboards.publish({
            organizationId: auth.organization.id,
            id,
            expectedRevision,
            actorId: auth.user.id,
            now: now().toISOString(),
            versionId: createId(),
            keepVersions: PLATFORM_LIMITS.maxRetainedVersions,
          }),
        );
        await persistence.audit.record({
          organizationId: auth.organization.id,
          actorType: "user",
          actorId: auth.user.id,
          action: "dashboard.publish",
          resourceType: "dashboard",
          resourceId: id,
          metadata: { revision: published.revision },
          requestId: request.id,
        });
        return published;
      });

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
      const query = listQuerySchema.safeParse(request.query);
      if (!query.success) throw validationFailed(issuesFromZod(query.error));

      const { page, pageSize } = query.data;
      const result = await persistence.withTenant(scopeOf(auth), async () => {
        const record = await persistence.dashboards.find(auth.organization.id, id);
        if (!record) throw notFound("Dashboard not found");
        return persistence.dashboards.listVersions(auth.organization.id, id, {
          offset: (page - 1) * pageSize,
          limit: pageSize,
        });
      });

      return {
        items: result.items.map(toVersionSummary),
        pagination: { page, pageSize, total: result.total },
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
      const expectedRevision = parseIfMatch(request.headers["if-match"]);

      const parsed = restoreSchema.safeParse(request.body);
      if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));

      const record = await persistence.withTenant(scopeOf(auth), async () => {
        const restored = unwrapWrite(
          await persistence.dashboards.restoreDraft({
            organizationId: auth.organization.id,
            id,
            expectedRevision,
            versionId: parsed.data.versionId,
            now: now().toISOString(),
          }),
        );
        await persistence.audit.record({
          organizationId: auth.organization.id,
          actorType: "user",
          actorId: auth.user.id,
          action: "dashboard.restore",
          resourceType: "dashboard",
          resourceId: id,
          metadata: { versionId: parsed.data.versionId },
          requestId: request.id,
        });
        return restored;
      });

      return toDraft(record);
    },
  );
}
