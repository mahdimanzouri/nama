import { createHash } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createId } from "@nama/dashboard-types";
import { Client } from "pg";

import { buildApp } from "../app.ts";
import { loadEnv } from "../env.ts";
import { createPostgresPersistence } from "../infrastructure/persistence/postgres.ts";
import type {
  MembershipRecord,
  Persistence,
  UserRecord,
} from "../infrastructure/persistence/types.ts";
import { ALL_PERMISSIONS } from "../infrastructure/rbac.ts";
import { issueSession } from "../infrastructure/sessions.ts";
import { demoConfig, login, type LoginResult } from "./helpers.ts";

const DATABASE_URL = process.env.NAMA_TEST_DATABASE_URL;

interface Tenant {
  organizationId: string;
  userId: string;
  membershipId: string;
  cookie: string;
  csrfToken: string;
}

interface TenantState extends Tenant {
  user: UserRecord;
  membership: MembershipRecord;
}

const PLAINTEXT = "pg-secret-value";

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

describe.skipIf(!DATABASE_URL)("postgres persistence", () => {
  let app: FastifyInstance;
  let persistence: Persistence;
  let sql: Client;
  let editor: LoginResult;
  let viewer: LoginResult;
  let adminTenant: TenantState;
  let readerTenant: TenantState;
  let otherTenant: TenantState;
  const createdUserIds: string[] = [];
  const createdOrganizationIds: string[] = [];

  async function addMember(
    organizationId: string,
    displayName: string,
    permissions: readonly string[],
  ): Promise<TenantState> {
    const role = await persistence.roles.create({
      organizationId,
      name: `pg-role-${createId()}`,
      permissions: [...permissions],
    });
    const user: UserRecord = {
      id: createId(),
      email: `pg-${createId()}@nama.local`,
      passwordHash: "",
      displayName,
      status: "active",
    };
    const member = await persistence.memberships.create({
      organizationId,
      user,
      roleIds: [role.id],
      status: "active",
      createdAt: new Date().toISOString(),
    });
    const { token, session } = await issueSession(
      persistence,
      user.id,
      organizationId,
      3_600_000,
      new Date(),
    );
    createdUserIds.push(user.id);

    return {
      organizationId,
      userId: user.id,
      membershipId: member.membership.id,
      user,
      membership: member.membership,
      cookie: `nama_session=${token}`,
      csrfToken: session.csrfToken,
    };
  }

  async function createTenant(
    name: string,
    permissions: readonly string[],
  ): Promise<TenantState> {
    const organization = {
      id: createId(),
      name,
      slug: `pg-${name}-${createId()}`,
    };
    await persistence.organizations.create(organization);
    createdOrganizationIds.push(organization.id);
    return addMember(organization.id, name, permissions);
  }

  function asTenant(tenant: Tenant) {
    return {
      cookie: tenant.cookie,
      "x-csrf-token": tenant.csrfToken,
    };
  }

  async function inTenant<T>(organizationId: string, run: () => Promise<T>): Promise<T> {
    await sql.query("BEGIN");
    try {
      await sql.query("SELECT set_config('app.organization_id', $1, true)", [
        organizationId,
      ]);
      return await run();
    } finally {
      await sql.query("COMMIT");
    }
  }

  beforeAll(async () => {
    sql = new Client({ connectionString: DATABASE_URL });
    await sql.connect();

    persistence = createPostgresPersistence(DATABASE_URL as string);
    app = buildApp(
      loadEnv({
        NODE_ENV: "test",
        LOG_LEVEL: "silent",
        CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
      }),
      { persistence },
    );

    editor = await login(app);
    viewer = await login(app, "viewer@nama.local", "nama-viewer-123");

    adminTenant = await createTenant("postgres-admin", ALL_PERMISSIONS);
    readerTenant = await addMember(adminTenant.organizationId, "postgres-reader", [
      "dashboard.read",
      "datasource.execute",
    ]);
    otherTenant = await createTenant("postgres-other", ALL_PERMISSIONS);
  });

  afterAll(async () => {
    if (!persistence) return;

    for (const organizationId of createdOrganizationIds) {
      await inTenant(organizationId, async () => {
        await sql.query("DELETE FROM embed_tokens WHERE organization_id = $1", [
          organizationId,
        ]);
        await sql.query(
          "DELETE FROM data_source_credentials WHERE organization_id = $1",
          [organizationId],
        );
        await sql.query("DELETE FROM data_sources WHERE organization_id = $1", [
          organizationId,
        ]);
        await sql.query("DELETE FROM dashboard_shares WHERE organization_id = $1", [
          organizationId,
        ]);
        await sql.query("DELETE FROM dashboard_versions WHERE organization_id = $1", [
          organizationId,
        ]);
        await sql.query("DELETE FROM dashboards WHERE organization_id = $1", [
          organizationId,
        ]);
        await sql.query("DELETE FROM audit_logs WHERE organization_id = $1", [
          organizationId,
        ]);
        await sql.query("DELETE FROM idempotency_keys WHERE organization_id = $1", [
          organizationId,
        ]);
        await sql.query(
          "DELETE FROM membership_roles WHERE membership_id IN (SELECT id FROM memberships WHERE organization_id = $1)",
          [organizationId],
        );
        await sql.query("DELETE FROM memberships WHERE organization_id = $1", [
          organizationId,
        ]);
        await sql.query(
          "DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE organization_id = $1)",
          [organizationId],
        );
        await sql.query("DELETE FROM roles WHERE organization_id = $1", [organizationId]);
        await sql.query("DELETE FROM organizations WHERE id = $1", [organizationId]);
      });
    }

    if (createdUserIds.length > 0) {
      await sql.query("DELETE FROM user_preferences WHERE user_id = ANY($1)", [
        createdUserIds,
      ]);
      await sql.query("DELETE FROM sessions WHERE user_id = ANY($1)", [createdUserIds]);
      await sql.query("DELETE FROM users WHERE id = ANY($1)", [createdUserIds]);
    }

    await app.close();
    await persistence.close();
    await sql.end();
  });

  it("logs in with the seeded demo accounts", () => {
    expect(editor.body.role).toBe("editor");
    expect(editor.body.permissions).toContain("dashboard.publish");
    expect(viewer.body.role).toBe("viewer");
    expect(viewer.body.permissions).not.toContain("dashboard.publish");
  });

  it("runs the publish lifecycle, rejects stale writes and hides drafts from viewers", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/v1/dashboards",
      headers: asTenant(adminTenant),
      payload: { name: "Postgres lifecycle" },
    });
    expect(created.statusCode).toBe(201);
    const dashboardId = created.json().id as string;
    expect(created.json().revision).toBe(1);

    const saved = await app.inject({
      method: "PUT",
      url: `/v1/dashboards/${dashboardId}/draft`,
      headers: { ...asTenant(adminTenant), "if-match": '"1"' },
      payload: { config: demoConfig("Postgres lifecycle") },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().revision).toBe(2);

    const stale = await app.inject({
      method: "PUT",
      url: `/v1/dashboards/${dashboardId}/draft`,
      headers: { ...asTenant(adminTenant), "if-match": '"1"' },
      payload: { config: demoConfig("Stale") },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.currentRevision).toBe(2);

    const published = await app.inject({
      method: "POST",
      url: `/v1/dashboards/${dashboardId}/publish`,
      headers: { ...asTenant(adminTenant), "if-match": '"2"' },
    });
    expect(published.statusCode).toBe(200);
    expect(published.json().publishedRevision).toBe(3);

    const viewerRead = await app.inject({
      method: "GET",
      url: `/v1/dashboards/${dashboardId}`,
      headers: asTenant(readerTenant),
    });
    expect(viewerRead.statusCode).toBe(200);
    expect(viewerRead.json().publishedConfig).not.toBeNull();
    expect(viewerRead.json()).not.toHaveProperty("draftConfig");

    const viewerDraft = await app.inject({
      method: "GET",
      url: `/v1/dashboards/${dashboardId}/draft`,
      headers: asTenant(readerTenant),
    });
    expect(viewerDraft.statusCode).toBe(403);

    const crossTenantRead = await app.inject({
      method: "GET",
      url: `/v1/dashboards/${dashboardId}`,
      headers: asTenant(otherTenant),
    });
    expect(crossTenantRead.statusCode).toBe(404);

    const crossTenantList = await app.inject({
      method: "GET",
      url: "/v1/dashboards",
      headers: asTenant(otherTenant),
    });
    expect(crossTenantList.json().items).toHaveLength(0);

    const crossTenantSave = await app.inject({
      method: "PUT",
      url: `/v1/dashboards/${dashboardId}/draft`,
      headers: { ...asTenant(otherTenant), "if-match": '"3"' },
      payload: { config: demoConfig("Cross tenant") },
    });
    expect(crossTenantSave.statusCode).toBe(404);
  });

  it("scopes embed tokens to the dashboard and refuses cross-tenant issuance", async () => {
    const dashboard = await app.inject({
      method: "POST",
      url: "/v1/dashboards",
      headers: asTenant(adminTenant),
      payload: { name: "Embedded in postgres" },
    });
    const dashboardId = dashboard.json().id as string;
    const saved = await app.inject({
      method: "PUT",
      url: `/v1/dashboards/${dashboardId}/draft`,
      headers: { ...asTenant(adminTenant), "if-match": '"1"' },
      payload: { config: demoConfig("Embedded in postgres") },
    });
    await app.inject({
      method: "POST",
      url: `/v1/dashboards/${dashboardId}/publish`,
      headers: { ...asTenant(adminTenant), "if-match": `"${saved.json().revision}"` },
    });

    const issued = await app.inject({
      method: "POST",
      url: `/v1/dashboards/${dashboardId}/embed-tokens`,
      headers: asTenant(adminTenant),
      payload: { expiresInSeconds: 3600, scope: { variables: { region: "eu" } } },
    });
    expect(issued.statusCode).toBe(201);
    const { id: tokenId, token } = issued.json() as { id: string; token: string };

    const stored = await inTenant(adminTenant.organizationId, () =>
      sql.query(
        "SELECT encode(token_hash,'hex') AS hash, scope FROM embed_tokens WHERE id = $1",
        [tokenId],
      ),
    );
    expect(stored.rows[0].hash).toBe(sha256Hex(token));
    expect(stored.rows[0].scope.dashboardIds).toEqual([dashboardId]);
    expect(stored.rows[0].scope.variables).toEqual({ region: "eu" });

    const readerIssue = await app.inject({
      method: "POST",
      url: `/v1/dashboards/${dashboardId}/embed-tokens`,
      headers: asTenant(readerTenant),
      payload: { expiresInSeconds: 3600 },
    });
    expect(readerIssue.statusCode).toBe(403);

    const crossTenantRevoke = await app.inject({
      method: "DELETE",
      url: `/v1/dashboards/${dashboardId}/embed-tokens/${tokenId}`,
      headers: asTenant(otherTenant),
    });
    expect(crossTenantRevoke.statusCode).toBe(404);

    const revoked = await app.inject({
      method: "DELETE",
      url: `/v1/dashboards/${dashboardId}/embed-tokens/${tokenId}`,
      headers: asTenant(adminTenant),
    });
    expect(revoked.statusCode).toBe(204);
  });

  it("encrypts data-source credentials and never returns them", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/v1/data-sources",
      headers: asTenant(adminTenant),
      payload: {
        name: "Postgres warehouse",
        kind: "postgres",
        config: { host: "db.internal", database: "metrics" },
        credentials: { username: "svc", password: PLAINTEXT },
      },
    });
    expect(created.statusCode).toBe(201);
    expect(JSON.stringify(created.json())).not.toContain(PLAINTEXT);
    const dataSourceId = created.json().id as string;

    const fetched = await app.inject({
      method: "GET",
      url: `/v1/data-sources/${dataSourceId}`,
      headers: asTenant(adminTenant),
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json()).not.toHaveProperty("credentials");

    const stored = await inTenant(adminTenant.organizationId, () =>
      sql.query(
        "SELECT encode(ciphertext,'hex') AS cipher FROM data_source_credentials WHERE data_source_id = $1",
        [dataSourceId],
      ),
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0].cipher).not.toContain(
      Buffer.from(PLAINTEXT, "utf8").toString("hex"),
    );

    const readerCreate = await app.inject({
      method: "POST",
      url: "/v1/data-sources",
      headers: asTenant(readerTenant),
      payload: { name: "denied", kind: "postgres", config: {} },
    });
    expect(readerCreate.statusCode).toBe(403);
  });

  it("enforces row-level security for unset and foreign tenant contexts", async () => {
    const withoutContext = await sql.query(
      "SELECT count(*)::int AS count FROM dashboards",
    );
    expect(withoutContext.rows[0].count).toBe(0);

    const foreign = await inTenant(otherTenant.organizationId, () =>
      sql.query("SELECT count(*)::int AS count FROM dashboards"),
    );
    expect(foreign.rows[0].count).toBe(0);

    const own = await inTenant(adminTenant.organizationId, () =>
      sql.query("SELECT count(*)::int AS count FROM dashboards"),
    );
    expect(own.rows[0].count).toBeGreaterThanOrEqual(2);
  });

  it("records audit events inside the tenant", async () => {
    const result = await inTenant(adminTenant.organizationId, () =>
      sql.query(
        "SELECT action, count(*)::int AS count FROM audit_logs WHERE organization_id = $1 GROUP BY action",
        [adminTenant.organizationId],
      ),
    );
    const actions = new Map(
      (result.rows as Array<{ action: string; count: number }>).map((row) => [
        row.action,
        row.count,
      ]),
    );
    expect(actions.get("dashboard.create")).toBeGreaterThanOrEqual(2);
    expect(actions.get("dashboard.publish")).toBeGreaterThanOrEqual(2);
    expect(actions.get("embed_token.issue")).toBeGreaterThanOrEqual(1);
    expect(actions.get("datasource.create")).toBeGreaterThanOrEqual(1);
  });

  it("persists idempotent creates and serves the audit trail", async () => {
    const key = `pg-idempotent-${createId()}`;
    const request = () =>
      app.inject({
        method: "POST",
        url: "/v1/dashboards",
        headers: { ...asTenant(adminTenant), "idempotency-key": key },
        payload: { name: "Postgres idempotent" },
      });

    const first = await request();
    expect(first.statusCode).toBe(201);

    const replay = await request();
    expect(replay.statusCode).toBe(201);
    expect(replay.headers["idempotent-replayed"]).toBe("true");
    expect(replay.json().id).toBe(first.json().id);

    const stored = await inTenant(adminTenant.organizationId, () =>
      sql.query(
        "SELECT status, status_code FROM idempotency_keys WHERE organization_id = $1 AND key = $2",
        [adminTenant.organizationId, key],
      ),
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]).toMatchObject({ status: "completed", status_code: 201 });

    const listed = await app.inject({
      method: "GET",
      url: `/v1/organizations/${adminTenant.organizationId}/audit-events?action=dashboard.create&pageSize=1`,
      headers: asTenant(adminTenant),
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().pagination.total).toBeGreaterThanOrEqual(3);

    const exported = await app.inject({
      method: "GET",
      url: `/v1/organizations/${adminTenant.organizationId}/audit-events/export`,
      headers: asTenant(adminTenant),
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.headers["content-type"]).toContain("text/csv");
    expect(exported.body).toContain("dashboard.create");

    const crossTenant = await app.inject({
      method: "GET",
      url: `/v1/organizations/${otherTenant.organizationId}/audit-events`,
      headers: asTenant(adminTenant),
    });
    expect(crossTenant.statusCode).toBe(404);
  });

  it("keeps idempotency keys behind row-level security", async () => {
    const withoutContext = await sql.query(
      "SELECT count(*)::int AS count FROM idempotency_keys",
    );
    expect(withoutContext.rows[0].count).toBe(0);

    const foreign = await inTenant(otherTenant.organizationId, () =>
      sql.query("SELECT count(*)::int AS count FROM idempotency_keys"),
    );
    expect(foreign.rows[0].count).toBe(0);

    const own = await inTenant(adminTenant.organizationId, () =>
      sql.query("SELECT count(*)::int AS count FROM idempotency_keys"),
    );
    expect(own.rows[0].count).toBeGreaterThanOrEqual(1);
  });
});
