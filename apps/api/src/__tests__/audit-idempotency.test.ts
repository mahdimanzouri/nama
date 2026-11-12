import { createHash } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createId } from "@nama/dashboard-types";

import { buildApp } from "../app.ts";
import { pruneExpired } from "../modules/audit/retention.ts";
import { ALL_PERMISSIONS } from "../infrastructure/rbac.ts";
import type { Persistence } from "../infrastructure/persistence/types.ts";
import { issueSession } from "../infrastructure/sessions.ts";
import {
  createTestPersistence,
  login,
  mutationHeaders,
  readHeaders,
  testEnv,
  type LoginResult,
} from "./helpers.ts";

interface PrivilegedMember {
  cookie: string;
  csrfToken: string;
  userId: string;
}

async function addAuditor(
  persistence: Persistence,
  organizationId: string,
): Promise<PrivilegedMember> {
  const role = await persistence.roles.create({
    organizationId,
    name: `auditor-${createId()}`,
    permissions: ALL_PERMISSIONS,
  });
  const member = await persistence.memberships.create({
    organizationId,
    user: {
      id: createId(),
      email: `auditor-${createId()}@nama.local`,
      passwordHash: "",
      displayName: "Auditor",
    },
    roleIds: [role.id],
    status: "active",
    createdAt: new Date().toISOString(),
  });
  const { token, session } = await issueSession(
    persistence,
    member.user.id,
    organizationId,
    3_600_000,
    new Date(),
  );

  return {
    cookie: `nama_session=${token}`,
    csrfToken: session.csrfToken,
    userId: member.user.id,
  };
}

function writeHeaders(session: PrivilegedMember): Record<string, string> {
  return { cookie: session.cookie, "x-csrf-token": session.csrfToken };
}

function stableFingerprint(method: string, path: string, body: unknown): string {
  const keys = Object.keys(body as Record<string, unknown>).sort();
  const stable = `{${keys
    .map(
      (key) =>
        `${JSON.stringify(key)}:${JSON.stringify((body as Record<string, unknown>)[key])}`,
    )
    .join(",")}}`;
  return createHash("sha256").update(`${method} ${path}\n${stable}`).digest("hex");
}

describe("idempotency keys", () => {
  let app: FastifyInstance;
  let persistence: Persistence;
  let editor: LoginResult;
  let organizationId: string;

  beforeAll(async () => {
    const env = testEnv();
    persistence = createTestPersistence(env);
    app = buildApp(env, { persistence });
    editor = await login(app);
    organizationId = editor.body.organization.id;
  });

  afterAll(async () => {
    await app.close();
    await persistence.close();
  });

  async function createDashboard(key: string | undefined, payload: { name: string }) {
    return app.inject({
      method: "POST",
      url: "/v1/dashboards",
      headers: {
        ...mutationHeaders(editor),
        ...(key === undefined ? {} : { "idempotency-key": key }),
      },
      payload,
    });
  }

  it("replays the stored response instead of repeating the create", async () => {
    const first = await createDashboard("create-replay", { name: "Replayed" });
    expect(first.statusCode).toBe(201);
    expect(first.headers["idempotent-replayed"]).toBeUndefined();
    const firstId = first.json().id as string;

    const second = await createDashboard("create-replay", { name: "Replayed" });
    expect(second.statusCode).toBe(201);
    expect(second.headers["idempotent-replayed"]).toBe("true");
    expect(second.json().id).toBe(firstId);

    const list = await app.inject({
      method: "GET",
      url: "/v1/dashboards",
      headers: readHeaders(editor),
    });
    const names = (list.json().items as Array<{ name: string }>).map((item) => item.name);
    expect(names.filter((name) => name === "Replayed")).toHaveLength(1);
  });

  it("rejects a reused key with a different payload", async () => {
    await createDashboard("create-mismatch", { name: "Original" });

    const mismatch = await createDashboard("create-mismatch", { name: "Changed" });
    expect(mismatch.statusCode).toBe(409);
    expect(mismatch.json().error.code).toBe("IDEMPOTENCY_MISMATCH");
  });

  it("reports an in-flight key with a retry hint", async () => {
    const body = { name: "In flight" };
    const scoped = { organizationId, userId: editor.body.user.id };
    await persistence.withTenant(scoped, () =>
      persistence.idempotency.begin({
        organizationId,
        principalId: editor.body.user.id,
        key: "create-in-flight",
        fingerprint: stableFingerprint("POST", "/v1/dashboards", body),
        method: "POST",
        path: "/v1/dashboards",
        now: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    );

    const inFlight = await createDashboard("create-in-flight", body);
    expect(inFlight.statusCode).toBe(409);
    expect(inFlight.json().error).toMatchObject({
      code: "IDEMPOTENCY_IN_PROGRESS",
      retryAfterMs: 1_000,
    });
  });

  it("releases the key after a failed request so a retry can succeed", async () => {
    const invalid = await createDashboard("create-retry", { name: "" });
    expect(invalid.statusCode).toBe(422);

    const retry = await createDashboard("create-retry", { name: "After retry" });
    expect(retry.statusCode).toBe(201);
    expect(retry.json().name).toBe("After retry");
  });

  it("rejects an oversized key", async () => {
    const response = await createDashboard("k".repeat(129), { name: "Too long" });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.fieldPaths).toContain("idempotency-key");
  });
});

describe("audit trail", () => {
  let app: FastifyInstance;
  let persistence: Persistence;
  let editor: LoginResult;
  let viewer: LoginResult;
  let auditor: PrivilegedMember;
  let organizationId: string;

  beforeAll(async () => {
    const env = testEnv();
    persistence = createTestPersistence(env);
    app = buildApp(env, { persistence });
    editor = await login(app);
    viewer = await login(app, "viewer@nama.local", "nama-viewer-123");
    organizationId = editor.body.organization.id;
    auditor = await addAuditor(persistence, organizationId);

    const created = await app.inject({
      method: "POST",
      url: "/v1/dashboards",
      headers: mutationHeaders(editor),
      payload: { name: "Audited dashboard" },
    });
    expect(created.statusCode).toBe(201);
  });

  afterAll(async () => {
    await app.close();
    await persistence.close();
  });

  it("lists audit events newest first with filters and pagination", async () => {
    const listed = await app.inject({
      method: "GET",
      url: `/v1/organizations/${organizationId}/audit-events`,
      headers: writeHeaders(auditor),
    });
    expect(listed.statusCode).toBe(200);
    const body = listed.json() as {
      items: Array<{ action: string; actorType: string; requestId: string }>;
      pagination: { page: number; pageSize: number; total: number };
    };
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0]?.requestId).toBeTruthy();
    expect(body.items[0]?.actorType).toBe("user");
    expect(body.pagination).toMatchObject({ page: 1, pageSize: 25 });

    const filtered = await app.inject({
      method: "GET",
      url: `/v1/organizations/${organizationId}/audit-events?action=dashboard.create&pageSize=1`,
      headers: writeHeaders(auditor),
    });
    expect(filtered.statusCode).toBe(200);
    const filteredBody = filtered.json() as {
      items: Array<{ action: string }>;
      pagination: { total: number };
    };
    expect(filteredBody.items).toHaveLength(1);
    expect(filteredBody.items[0]?.action).toBe("dashboard.create");
    expect(filteredBody.pagination.total).toBeGreaterThanOrEqual(1);

    const badDate = await app.inject({
      method: "GET",
      url: `/v1/organizations/${organizationId}/audit-events?from=yesterday`,
      headers: writeHeaders(auditor),
    });
    expect(badDate.statusCode).toBe(422);
  });

  it("requires the audit permission and the caller's own organization", async () => {
    const forbidden = await app.inject({
      method: "GET",
      url: `/v1/organizations/${organizationId}/audit-events`,
      headers: readHeaders(viewer),
    });
    expect(forbidden.statusCode).toBe(403);

    const editorDenied = await app.inject({
      method: "GET",
      url: `/v1/organizations/${organizationId}/audit-events`,
      headers: readHeaders(editor),
    });
    expect(editorDenied.statusCode).toBe(403);

    const foreign = await app.inject({
      method: "GET",
      url: `/v1/organizations/${createId()}/audit-events`,
      headers: writeHeaders(auditor),
    });
    expect(foreign.statusCode).toBe(404);
  });

  it("exports CSV and records the export itself", async () => {
    const exported = await app.inject({
      method: "GET",
      url: `/v1/organizations/${organizationId}/audit-events/export`,
      headers: writeHeaders(auditor),
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.headers["content-type"]).toContain("text/csv");
    expect(String(exported.headers["content-disposition"])).toMatch(/\.csv"$/u);
    expect(exported.headers["x-audit-export-truncated"]).toBe("false");
    expect(exported.body.split("\n")[0]).toBe(
      "id,createdAt,actorType,actorId,action,resourceType,resourceId,requestId,metadata",
    );
    expect(exported.body).toContain("dashboard.create");

    const exports = await app.inject({
      method: "GET",
      url: `/v1/organizations/${organizationId}/audit-events?action=audit.export`,
      headers: writeHeaders(auditor),
    });
    const events = exports.json().items as Array<{
      actorId: string;
      metadata: { format: string; exported: number };
    }>;
    expect(events).toHaveLength(1);
    expect(events[0]?.actorId).toBe(auditor.userId);
    expect(events[0]?.metadata.format).toBe("csv");
    expect(events[0]?.metadata.exported).toBeGreaterThan(0);

    const foreign = await app.inject({
      method: "GET",
      url: `/v1/organizations/${createId()}/audit-events/export`,
      headers: writeHeaders(auditor),
    });
    expect(foreign.statusCode).toBe(404);
  });

  it("prunes expired audit events and idempotency keys per organization", async () => {
    const scoped = { organizationId, userId: auditor.userId };
    await persistence.withTenant(scoped, () =>
      persistence.idempotency.begin({
        organizationId,
        principalId: auditor.userId,
        key: "stale-key",
        fingerprint: "fingerprint",
        method: "POST",
        path: "/v1/dashboards",
        now: new Date(Date.now() - 3_600_000).toISOString(),
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      }),
    );

    const future = new Date(Date.now() + 2 * 365 * 24 * 3_600_000);
    const result = await pruneExpired({
      persistence,
      now: () => future,
      auditRetentionDays: 1,
    });

    expect(result.audit).toBeGreaterThan(0);
    expect(result.idempotency).toBe(1);

    const listed = await app.inject({
      method: "GET",
      url: `/v1/organizations/${organizationId}/audit-events`,
      headers: writeHeaders(auditor),
    });
    expect(listed.json().pagination.total).toBe(0);
  });
});
