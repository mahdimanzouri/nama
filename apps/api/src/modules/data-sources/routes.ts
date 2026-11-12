import type { FastifyInstance, FastifyRequest } from "fastify";
import { createId, issuesFromZod } from "@nama/dashboard-types";
import { z } from "zod";

import {
  requireCredentialCipher,
  type CredentialCipher,
} from "../../infrastructure/credentials.ts";
import {
  HttpError,
  forbidden,
  notFound,
  unauthorized,
  validationFailed,
} from "../../infrastructure/errors.ts";
import type {
  DataSourceRecord,
  Persistence,
  TenantScope,
} from "../../infrastructure/persistence/types.ts";
import type { AuthContext, AuthHooks } from "../../http/auth.ts";

const KIND = z.enum(["postgres", "mysql", "rest", "mqtt", "static"]);

const createSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    kind: KIND,
    config: z.record(z.string(), z.unknown()),
    credentials: z.record(z.string(), z.unknown()).optional(),
    allowRawSql: z.boolean().optional(),
  })
  .strict();

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    credentials: z.record(z.string(), z.unknown()).optional(),
    allowRawSql: z.boolean().optional(),
    status: z.enum(["active", "disabled"]).optional(),
  })
  .strict();

const listQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export interface DataSourceRouteDeps {
  persistence: Persistence;
  now: () => Date;
  hooks: AuthHooks;
  credentialCipher: CredentialCipher | null;
}

function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw unauthorized();
  return request.auth;
}

function scopeOf(auth: AuthContext): TenantScope {
  return { organizationId: auth.organization.id, userId: auth.user.id };
}

function toDataSource(record: DataSourceRecord) {
  return {
    id: record.id,
    name: record.name,
    kind: record.kind,
    status: record.status,
    allowRawSql: record.allowRawSql,
    config: record.config,
    updatedAt: record.updatedAt,
  };
}

function encryptCredentials(
  cipher: CredentialCipher | null,
  credentials: Record<string, unknown> | undefined,
): Buffer | null {
  if (!credentials) return null;
  return requireCredentialCipher(cipher).encrypt(
    Buffer.from(JSON.stringify(credentials), "utf8"),
  );
}

export function registerDataSourceRoutes(
  app: FastifyInstance,
  { persistence, now, hooks, credentialCipher }: DataSourceRouteDeps,
): void {
  app.get(
    "/v1/data-sources",
    {
      preHandler: [hooks.authenticate, hooks.requirePermission("datasource.read")],
    },
    async (request) => {
      const auth = requireAuth(request);
      const query = listQuerySchema.safeParse(request.query);
      if (!query.success) throw validationFailed(issuesFromZod(query.error));
      const { page, pageSize } = query.data;

      const result = await persistence.withTenant(scopeOf(auth), () =>
        persistence.dataSources.list(auth.organization.id, {
          offset: (page - 1) * pageSize,
          limit: pageSize,
        }),
      );

      return {
        items: result.items.map(toDataSource),
        pagination: { page, pageSize, total: result.total },
      };
    },
  );

  app.post(
    "/v1/data-sources",
    {
      preHandler: [
        hooks.authenticate,
        hooks.requireCsrf,
        hooks.requirePermission("datasource.create"),
      ],
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));

      if (parsed.data.allowRawSql && !auth.permissions.includes("datasource.admin")) {
        throw forbidden("Raw SQL requires the datasource.admin permission");
      }

      const timestamp = now().toISOString();
      const record: DataSourceRecord = {
        id: createId(),
        organizationId: auth.organization.id,
        name: parsed.data.name,
        kind: parsed.data.kind,
        config: parsed.data.config,
        allowRawSql: parsed.data.allowRawSql ?? false,
        limits: {},
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      const created = await persistence.withTenant(scopeOf(auth), async () => {
        const source = await persistence.dataSources.create(record);
        const ciphertext = encryptCredentials(credentialCipher, parsed.data.credentials);
        if (ciphertext) {
          await persistence.dataSources.saveCredential({
            dataSourceId: source.id,
            organizationId: auth.organization.id,
            ciphertext,
            keyVersion: requireCredentialCipher(credentialCipher).keyVersion,
            createdAt: timestamp,
            rotatedAt: null,
          });
        }
        await persistence.audit.record({
          organizationId: auth.organization.id,
          actorType: "user",
          actorId: auth.user.id,
          action: "datasource.create",
          resourceType: "data_source",
          resourceId: source.id,
          requestId: request.id,
        });
        return source;
      });

      return reply.code(201).send(toDataSource(created));
    },
  );

  app.get(
    "/v1/data-sources/:id",
    {
      preHandler: [hooks.authenticate, hooks.requirePermission("datasource.read")],
    },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = request.params as { id: string };
      const record = await persistence.withTenant(scopeOf(auth), () =>
        persistence.dataSources.find(auth.organization.id, id),
      );
      if (!record) throw notFound("Data source not found");
      return toDataSource(record);
    },
  );

  app.patch(
    "/v1/data-sources/:id",
    {
      preHandler: [
        hooks.authenticate,
        hooks.requireCsrf,
        hooks.requirePermission("datasource.update"),
      ],
    },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = request.params as { id: string };
      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));

      if (parsed.data.allowRawSql && !auth.permissions.includes("datasource.admin")) {
        throw forbidden("Raw SQL requires the datasource.admin permission");
      }

      return persistence.withTenant(scopeOf(auth), async () => {
        const existing = await persistence.dataSources.find(auth.organization.id, id);
        if (!existing) throw notFound("Data source not found");

        const updated = await persistence.dataSources.update(auth.organization.id, id, {
          ...(parsed.data.name === undefined ? {} : { name: parsed.data.name }),
          ...(parsed.data.config === undefined ? {} : { config: parsed.data.config }),
          ...(parsed.data.allowRawSql === undefined
            ? {}
            : { allowRawSql: parsed.data.allowRawSql }),
          ...(parsed.data.status === undefined ? {} : { status: parsed.data.status }),
        });
        if (!updated) throw notFound("Data source not found");

        const ciphertext = encryptCredentials(credentialCipher, parsed.data.credentials);
        if (ciphertext) {
          await persistence.dataSources.saveCredential({
            dataSourceId: id,
            organizationId: auth.organization.id,
            ciphertext,
            keyVersion: requireCredentialCipher(credentialCipher).keyVersion,
            createdAt: existing.createdAt,
            rotatedAt: now().toISOString(),
          });
        }

        await persistence.audit.record({
          organizationId: auth.organization.id,
          actorType: "user",
          actorId: auth.user.id,
          action: "datasource.update",
          resourceType: "data_source",
          resourceId: id,
          requestId: request.id,
        });

        return toDataSource(updated);
      });
    },
  );

  app.delete(
    "/v1/data-sources/:id",
    {
      preHandler: [
        hooks.authenticate,
        hooks.requireCsrf,
        hooks.requirePermission("datasource.update"),
      ],
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      const { id } = request.params as { id: string };

      await persistence.withTenant(scopeOf(auth), async () => {
        const removed = await persistence.dataSources.remove(auth.organization.id, id);
        if (!removed) throw notFound("Data source not found");
        await persistence.audit.record({
          organizationId: auth.organization.id,
          actorType: "user",
          actorId: auth.user.id,
          action: "datasource.delete",
          resourceType: "data_source",
          resourceId: id,
          requestId: request.id,
        });
      });

      return reply.code(204).send();
    },
  );

  app.post(
    "/v1/data-sources/:id/test",
    {
      preHandler: [
        hooks.authenticate,
        hooks.requireCsrf,
        hooks.requirePermission("datasource.test"),
      ],
    },
    async (request) => {
      const auth = requireAuth(request);
      const { id } = request.params as { id: string };
      const record = await persistence.withTenant(scopeOf(auth), () =>
        persistence.dataSources.find(auth.organization.id, id),
      );
      if (!record) throw notFound("Data source not found");

      throw new HttpError(501, {
        code: "NOT_IMPLEMENTED",
        message: "Connectivity testing arrives with the M7 data adapters",
      });
    },
  );
}
