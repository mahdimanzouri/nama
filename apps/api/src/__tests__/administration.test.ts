import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createId } from "@nama/dashboard-types";

import { buildApp } from "../app.ts";
import {
  createTestPersistence,
  demoConfig,
  login,
  mutationHeaders,
  readHeaders,
  testEnv,
  type LoginResult,
} from "./helpers.ts";
import { ALL_PERMISSIONS } from "../infrastructure/rbac.ts";
import type { Persistence } from "../infrastructure/persistence/types.ts";
import { issueSession } from "../infrastructure/sessions.ts";

interface PrivilegedMember {
  cookie: string;
  csrfToken: string;
  userId: string;
  membershipId: string;
}

async function addPrivilegedMember(
  persistence: Persistence,
  organizationId: string,
  permissions: readonly string[],
): Promise<PrivilegedMember> {
  const role = await persistence.roles.create({
    organizationId,
    name: `test-admin-${createId()}`,
    permissions: [...permissions],
  });
  const member = await persistence.memberships.create({
    organizationId,
    user: {
      id: createId(),
      email: `admin-${createId()}@nama.local`,
      passwordHash: "",
      displayName: "Test Admin",
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
    membershipId: member.membership.id,
  };
}

function privilegedHeaders(member: PrivilegedMember, revision?: number) {
  return {
    cookie: member.cookie,
    "x-csrf-token": member.csrfToken,
    ...(revision === undefined ? {} : { "if-match": `"${revision}"` }),
  };
}

describe("administration routes", () => {
  let app: FastifyInstance;
  let persistence: Persistence;
  let editor: LoginResult;
  let viewer: LoginResult;
  let admin: PrivilegedMember;
  let organizationId: string;

  beforeAll(async () => {
    const env = testEnv({
      CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    });
    persistence = createTestPersistence(env);
    app = buildApp(env, { persistence });
    editor = await login(app);
    viewer = await login(app, "viewer@nama.local", "nama-viewer-123");
    organizationId = editor.body.organization.id;
    admin = await addPrivilegedMember(persistence, organizationId, ALL_PERMISSIONS);
  });

  afterAll(async () => {
    await app.close();
    await persistence.close();
  });

  async function createDashboard(name: string) {
    const response = await app.inject({
      method: "POST",
      url: "/v1/dashboards",
      headers: mutationHeaders(editor),
      payload: { name },
    });
    expect(response.statusCode).toBe(201);
    return response.json() as { id: string; revision: number };
  }

  it("denies organization and data-source administration to an editor", async () => {
    const dataSource = await app.inject({
      method: "POST",
      url: "/v1/data-sources",
      headers: mutationHeaders(editor),
      payload: { name: "blocked", kind: "postgres", config: {} },
    });
    expect(dataSource.statusCode).toBe(403);

    const members = await app.inject({
      method: "GET",
      url: `/v1/organizations/${organizationId}/members`,
      headers: readHeaders(editor),
    });
    expect(members.statusCode).toBe(403);
  });

  it("creates a data source without ever returning its credentials", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/v1/data-sources",
      headers: privilegedHeaders(admin),
      payload: {
        name: "Warehouse",
        kind: "postgres",
        config: { host: "db.internal", database: "metrics" },
        credentials: { username: "svc", password: "super-secret" },
      },
    });

    expect(created.statusCode).toBe(201);
    const body = created.json() as Record<string, unknown>;
    expect(body).not.toHaveProperty("credentials");
    expect(JSON.stringify(body)).not.toContain("super-secret");

    const fetched = await app.inject({
      method: "GET",
      url: `/v1/data-sources/${String(body.id)}`,
      headers: privilegedHeaders(admin),
    });
    expect(fetched.statusCode).toBe(200);
    expect(JSON.stringify(fetched.json())).not.toContain("super-secret");

    const updated = await app.inject({
      method: "PATCH",
      url: `/v1/data-sources/${String(body.id)}`,
      headers: privilegedHeaders(admin),
      payload: { name: "Warehouse v2" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().name).toBe("Warehouse v2");

    const connectivity = await app.inject({
      method: "POST",
      url: `/v1/data-sources/${String(body.id)}/test`,
      headers: privilegedHeaders(admin),
    });
    expect(connectivity.statusCode).toBe(501);
    expect(connectivity.json().error.code).toBe("NOT_IMPLEMENTED");
  });

  it("requires datasource.admin for raw SQL", async () => {
    const editorRoleAdmin = await addPrivilegedMember(persistence, organizationId, [
      "datasource.create",
    ]);
    const response = await app.inject({
      method: "POST",
      url: "/v1/data-sources",
      headers: privilegedHeaders(editorRoleAdmin),
      payload: {
        name: "raw sql",
        kind: "postgres",
        config: {},
        allowRawSql: true,
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it("replaces shares with If-Match and validates subjects", async () => {
    const created = await createDashboard("Shared dashboard");

    const replaced = await app.inject({
      method: "PUT",
      url: `/v1/dashboards/${created.id}/shares`,
      headers: mutationHeaders(editor, created.revision),
      payload: {
        shares: [
          {
            subjectType: "user",
            subjectId: viewer.body.user.id,
            permission: "view",
          },
        ],
      },
    });
    expect(replaced.statusCode).toBe(200);
    expect(replaced.json().items).toHaveLength(1);

    const listed = await app.inject({
      method: "GET",
      url: `/v1/dashboards/${created.id}/shares`,
      headers: readHeaders(editor),
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().items[0]).toMatchObject({
      subjectType: "user",
      subjectId: viewer.body.user.id,
      permission: "view",
    });

    const stale = await app.inject({
      method: "PUT",
      url: `/v1/dashboards/${created.id}/shares`,
      headers: mutationHeaders(editor, 0),
      payload: { shares: [] },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.currentRevision).toBe(created.revision);

    const unknownSubject = await app.inject({
      method: "PUT",
      url: `/v1/dashboards/${created.id}/shares`,
      headers: mutationHeaders(editor, created.revision),
      payload: {
        shares: [
          {
            subjectType: "user",
            subjectId: createId(),
            permission: "view",
          },
        ],
      },
    });
    expect(unknownSubject.statusCode).toBe(422);
  });

  it("issues a scoped embed token only for published dashboards", async () => {
    const created = await createDashboard("Embedded dashboard");

    const unpublished = await app.inject({
      method: "POST",
      url: `/v1/dashboards/${created.id}/embed-tokens`,
      headers: mutationHeaders(editor),
      payload: { expiresInSeconds: 3600 },
    });
    expect(unpublished.statusCode).toBe(422);

    const saved = await app.inject({
      method: "PUT",
      url: `/v1/dashboards/${created.id}/draft`,
      headers: mutationHeaders(editor, created.revision),
      payload: { config: demoConfig("Embedded dashboard") },
    });
    expect(saved.statusCode).toBe(200);

    const published = await app.inject({
      method: "POST",
      url: `/v1/dashboards/${created.id}/publish`,
      headers: mutationHeaders(editor, saved.json().revision),
    });
    expect(published.statusCode).toBe(200);

    const issued = await app.inject({
      method: "POST",
      url: `/v1/dashboards/${created.id}/embed-tokens`,
      headers: mutationHeaders(editor),
      payload: {
        expiresInSeconds: 3600,
        scope: { filters: { region: "eu" } },
      },
    });
    expect(issued.statusCode).toBe(201);
    const token = issued.json() as { id: string; token: string; expiresAt: string };
    expect(token.token.length).toBeGreaterThanOrEqual(43);
    expect(new Date(token.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const shortExpiry = await app.inject({
      method: "POST",
      url: `/v1/dashboards/${created.id}/embed-tokens`,
      headers: mutationHeaders(editor),
      payload: { expiresInSeconds: 5 },
    });
    expect(shortExpiry.statusCode).toBe(422);

    const viewerIssue = await app.inject({
      method: "POST",
      url: `/v1/dashboards/${created.id}/embed-tokens`,
      headers: mutationHeaders(viewer),
      payload: { expiresInSeconds: 3600 },
    });
    expect(viewerIssue.statusCode).toBe(403);

    const revoked = await app.inject({
      method: "DELETE",
      url: `/v1/dashboards/${created.id}/embed-tokens/${token.id}`,
      headers: mutationHeaders(editor),
    });
    expect(revoked.statusCode).toBe(204);

    const revokedAgain = await app.inject({
      method: "DELETE",
      url: `/v1/dashboards/${created.id}/embed-tokens/${token.id}`,
      headers: mutationHeaders(editor),
    });
    expect(revokedAgain.statusCode).toBe(404);
  });

  it("manages members and roles with system-role protection", async () => {
    const members = await app.inject({
      method: "GET",
      url: `/v1/organizations/${organizationId}/members`,
      headers: privilegedHeaders(admin),
    });
    expect(members.statusCode).toBe(200);
    expect(members.json().pagination.total).toBeGreaterThanOrEqual(2);

    const roles = await app.inject({
      method: "GET",
      url: `/v1/organizations/${organizationId}/roles`,
      headers: privilegedHeaders(admin),
    });
    expect(roles.statusCode).toBe(200);
    const owner = (roles.json().items as Array<{ id: string; name: string }>).find(
      (role) => role.name === "owner",
    );
    expect(owner).toBeDefined();

    const immutable = await app.inject({
      method: "PATCH",
      url: `/v1/organizations/${organizationId}/roles/${String(owner?.id)}`,
      headers: privilegedHeaders(admin),
      payload: { permissions: ["dashboard.read"] },
    });
    expect(immutable.statusCode).toBe(404);

    const unknownPermission = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/roles`,
      headers: privilegedHeaders(admin),
      payload: { name: "bad-role", permissions: ["dashboard.teleport"] },
    });
    expect(unknownPermission.statusCode).toBe(422);

    const customRole = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/roles`,
      headers: privilegedHeaders(admin),
      payload: {
        name: "custom-analyst",
        permissions: ["dashboard.read", "datasource.execute"],
      },
    });
    expect(customRole.statusCode).toBe(201);

    const duplicateEmail = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/members`,
      headers: privilegedHeaders(admin),
      payload: { email: viewer.body.user.email, roleIds: [customRole.json().id] },
    });
    expect(duplicateEmail.statusCode).toBe(409);

    const invite = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/members`,
      headers: privilegedHeaders(admin),
      payload: {
        email: `invite-${createId()}@nama.local`,
        roleIds: [customRole.json().id],
      },
    });
    expect(invite.statusCode).toBe(201);
    expect(invite.json().status).toBe("invited");

    const memberId = invite.json().id as string;
    const updatedMember = await app.inject({
      method: "PATCH",
      url: `/v1/organizations/${organizationId}/members/${memberId}`,
      headers: privilegedHeaders(admin),
      payload: { status: "active" },
    });
    expect(updatedMember.statusCode).toBe(200);
    expect(updatedMember.json().status).toBe("active");

    const removeSelf = await app.inject({
      method: "DELETE",
      url: `/v1/organizations/${organizationId}/members/${admin.membershipId}`,
      headers: privilegedHeaders(admin),
    });
    expect(removeSelf.statusCode).toBe(409);

    const removed = await app.inject({
      method: "DELETE",
      url: `/v1/organizations/${organizationId}/members/${memberId}`,
      headers: privilegedHeaders(admin),
    });
    expect(removed.statusCode).toBe(204);

    const deletedRole = await app.inject({
      method: "DELETE",
      url: `/v1/organizations/${organizationId}/roles/${String(customRole.json().id)}`,
      headers: privilegedHeaders(admin),
    });
    expect(deletedRole.statusCode).toBe(204);

    const permissions = await app.inject({
      method: "GET",
      url: `/v1/organizations/${organizationId}/permissions`,
      headers: privilegedHeaders(admin),
    });
    expect(permissions.statusCode).toBe(200);
    expect(permissions.json().items.length).toBeGreaterThan(0);
  });

  it("reads and updates preferences with validation", async () => {
    const initial = await app.inject({
      method: "GET",
      url: "/v1/me/preferences",
      headers: readHeaders(editor),
    });
    expect(initial.statusCode).toBe(200);
    expect(initial.json()).toMatchObject({ locale: "en", theme: "system" });

    const updated = await app.inject({
      method: "PATCH",
      url: "/v1/me/preferences",
      headers: mutationHeaders(editor),
      payload: { locale: "fa", theme: "dark", timezone: "Asia/Tehran" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ locale: "fa", theme: "dark" });

    const badLocale = await app.inject({
      method: "PATCH",
      url: "/v1/me/preferences",
      headers: mutationHeaders(editor),
      payload: { locale: "de" },
    });
    expect(badLocale.statusCode).toBe(422);

    const badTimezone = await app.inject({
      method: "PATCH",
      url: "/v1/me/preferences",
      headers: mutationHeaders(editor),
      payload: { timezone: "Mars/Olympus" },
    });
    expect(badTimezone.statusCode).toBe(422);

    const foreignOrganization = await app.inject({
      method: "PATCH",
      url: "/v1/me/preferences",
      headers: mutationHeaders(editor),
      payload: { defaultOrganizationId: createId() },
    });
    expect(foreignOrganization.statusCode).toBe(404);
  });
});
