import type { FastifyInstance, FastifyRequest } from "fastify";
import { issuesFromZod } from "@nama/dashboard-types";
import { z } from "zod";

import { notFound, unauthorized, validationFailed } from "../../infrastructure/errors.ts";
import type {
  AuditFilter,
  AuditLogRecord,
  Persistence,
  TenantScope,
} from "../../infrastructure/persistence/types.ts";
import type { AuthContext, AuthHooks } from "../../http/auth.ts";

const EXPORT_LIMIT = 10_000;

const listQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    action: z.string().min(1).max(100).optional(),
    resourceType: z.string().min(1).max(100).optional(),
    resourceId: z.string().min(1).max(200).optional(),
    actorId: z.string().min(1).max(200).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  })
  .strict();

const exportQuerySchema = listQuerySchema
  .omit({ page: true, pageSize: true })
  .extend({ format: z.enum(["csv"]).default("csv") });

export interface AuditRouteDeps {
  persistence: Persistence;
  hooks: AuthHooks;
}

function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw unauthorized();
  return request.auth;
}

function scopeOf(auth: AuthContext): TenantScope {
  return { organizationId: auth.organization.id, userId: auth.user.id };
}

function requireOrganization(request: FastifyRequest, auth: AuthContext): void {
  const { id } = request.params as { id: string };
  if (id !== auth.organization.id) throw notFound("Organization not found");
}

function filterOf(query: {
  action?: string;
  resourceType?: string;
  resourceId?: string;
  actorId?: string;
  from?: string;
  to?: string;
}): AuditFilter {
  return {
    ...(query.action === undefined ? {} : { action: query.action }),
    ...(query.resourceType === undefined ? {} : { resourceType: query.resourceType }),
    ...(query.resourceId === undefined ? {} : { resourceId: query.resourceId }),
    ...(query.actorId === undefined ? {} : { actorId: query.actorId }),
    ...(query.from === undefined ? {} : { from: query.from }),
    ...(query.to === undefined ? {} : { to: query.to }),
  };
}

function toAuditEvent(record: AuditLogRecord) {
  return {
    id: record.id,
    actorType: record.actorType,
    actorId: record.actorId,
    action: record.action,
    resourceType: record.resourceType,
    resourceId: record.resourceId,
    metadata: record.metadata,
    requestId: record.requestId,
    createdAt: record.createdAt,
  };
}

function csvCell(value: unknown): string {
  const text =
    value === null || value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function toCsv(records: AuditLogRecord[]): string {
  const header = [
    "id",
    "createdAt",
    "actorType",
    "actorId",
    "action",
    "resourceType",
    "resourceId",
    "requestId",
    "metadata",
  ].join(",");
  const lines = records.map((record) =>
    [
      record.id,
      record.createdAt,
      record.actorType,
      record.actorId,
      record.action,
      record.resourceType,
      record.resourceId,
      record.requestId,
      record.metadata,
    ]
      .map(csvCell)
      .join(","),
  );
  return [header, ...lines].join("\n");
}

export function registerAuditRoutes(
  app: FastifyInstance,
  { persistence, hooks }: AuditRouteDeps,
): void {
  app.get(
    "/v1/organizations/:id/audit-events",
    {
      preHandler: [
        hooks.authenticate,
        hooks.requirePermission("organization.audit.read"),
      ],
    },
    async (request) => {
      const auth = requireAuth(request);
      requireOrganization(request, auth);

      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));

      const { page, pageSize } = parsed.data;
      const result = await persistence.withTenant(scopeOf(auth), () =>
        persistence.audit.list(auth.organization.id, filterOf(parsed.data), {
          offset: (page - 1) * pageSize,
          limit: pageSize,
        }),
      );

      return {
        items: result.items.map(toAuditEvent),
        pagination: { page, pageSize, total: result.total },
      };
    },
  );

  app.get(
    "/v1/organizations/:id/audit-events/export",
    {
      preHandler: [
        hooks.authenticate,
        hooks.requirePermission("organization.audit.read"),
      ],
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      requireOrganization(request, auth);

      const parsed = exportQuerySchema.safeParse(request.query);
      if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));

      const records = await persistence.withTenant(scopeOf(auth), async () => {
        const result = await persistence.audit.list(
          auth.organization.id,
          filterOf(parsed.data),
          { offset: 0, limit: EXPORT_LIMIT },
        );
        await persistence.audit.record({
          organizationId: auth.organization.id,
          actorType: "user",
          actorId: auth.user.id,
          action: "audit.export",
          resourceType: "audit",
          metadata: {
            format: parsed.data.format,
            exported: result.items.length,
            total: result.total,
          },
          requestId: request.id,
        });
        return { items: result.items, total: result.total };
      });

      const filename = `audit-events-${auth.organization.id}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;

      return reply
        .code(200)
        .header("content-type", "text/csv; charset=utf-8")
        .header("content-disposition", `attachment; filename="${filename}"`)
        .header(
          "x-audit-export-truncated",
          records.total > records.items.length ? "true" : "false",
        )
        .send(toCsv(records.items));
    },
  );
}
