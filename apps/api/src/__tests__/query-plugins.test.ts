import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createId, type QueryRequest } from "@nama/dashboard-types";

import { buildApp } from "../app.ts";
import { createPluginRegistry } from "../modules/queries/plugins/registry.ts";
import { issueSession } from "../infrastructure/sessions.ts";
import type { Persistence } from "../infrastructure/persistence/types.ts";
import {
  createTestPersistence,
  login,
  mutationHeaders,
  readHeaders,
  testEnv,
  type LoginResult,
} from "./helpers.ts";

interface Fixture {
  server: Server;
  url: string;
  rows: Array<Record<string, unknown>>;
  delayMs: number;
}

function query(
  dataSourceId: string,
  overrides: Partial<QueryRequest["query"]> = {},
): QueryRequest {
  return {
    queryId: "q",
    dataSourceId,
    query: {
      queryId: "q",
      fields: ["timestamp", "value"],
      ...overrides,
    },
  };
}

async function startFixture(): Promise<Fixture> {
  const fixture: Partial<Fixture> = { rows: [], delayMs: 0 };
  const server = createServer((_request, response) => {
    const send = () => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ rows: fixture.rows }));
    };
    if (fixture.delayMs && fixture.delayMs > 0) {
      setTimeout(send, fixture.delayMs);
      return;
    }
    send();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  fixture.server = server;
  fixture.url = `http://127.0.0.1:${port}`;
  return fixture as Fixture;
}

async function addSource(
  persistence: Persistence,
  organizationId: string,
  input: {
    name: string;
    url: string;
    limits?: Record<string, unknown>;
  },
): Promise<string> {
  const id = createId();
  const timestamp = new Date().toISOString();
  await persistence.dataSources.create({
    id,
    organizationId,
    name: input.name,
    kind: "rest",
    config: { url: input.url },
    allowRawSql: false,
    limits: input.limits ?? {},
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  return id;
}

describe("data-source plugins", () => {
  let fixture: Fixture;
  let persistence: Persistence;
  let app: FastifyInstance;
  let editor: LoginResult;
  let organizationId: string;
  let adminCookie: string;
  let adminCsrf: string;

  beforeAll(async () => {
    fixture = await startFixture();
    persistence = createTestPersistence();
    app = buildApp(testEnv({ ALLOW_PRIVATE_DATA_SOURCES: "true" }), { persistence });

    editor = await login(app);
    organizationId = editor.body.organization.id;

    const adminRole = await persistence.roles.create({
      organizationId,
      name: "data-source-administrator",
      permissions: ["datasource.read", "datasource.test", "datasource.execute"],
    });
    const admin = await persistence.memberships.create({
      organizationId,
      user: {
        id: createId(),
        email: `admin-${createId()}@nama.local`,
        passwordHash: "",
        displayName: "Source Admin",
      },
      roleIds: [adminRole.id],
      status: "active",
      createdAt: new Date().toISOString(),
    });
    const session = await issueSession(
      persistence,
      admin.user.id,
      organizationId,
      3_600_000,
      new Date(),
    );
    adminCookie = `nama_session=${session.token}; nama_csrf=${session.session.csrfToken}`;
    adminCsrf = session.session.csrfToken;
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve) => fixture.server.close(() => resolve()));
  });

  async function execute(request: QueryRequest) {
    return app.inject({
      method: "POST",
      url: "/v1/queries/execute",
      headers: mutationHeaders(editor),
      payload: request,
    });
  }

  it("executes a REST source and applies local filters", async () => {
    fixture.rows = [
      { timestamp: "2026-11-10T00:00:00.000Z", value: 1 },
      { timestamp: "2026-11-11T00:00:00.000Z", value: 5 },
      { timestamp: "2026-11-12T00:00:00.000Z", value: 9 },
    ];
    const id = await addSource(persistence, organizationId, {
      name: "fixture",
      url: `${fixture.url}/rows`,
    });

    const response = await execute(
      query(id, { filters: [{ field: "value", operator: "gte", value: 5 }] }),
    );

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.rows).toHaveLength(2);
    expect(body.rows.map((row: { value: number }) => row.value)).toEqual([5, 9]);
    expect(body.columns.map((column: { name: string }) => column.name)).toEqual([
      "timestamp",
      "value",
    ]);
    expect(body.meta.truncated).toBe(false);
  });

  it("truncates to the source row cap and flags it", async () => {
    fixture.rows = Array.from({ length: 5 }, (_, index) => ({
      timestamp: `2026-11-1${index}T00:00:00.000Z`,
      value: index,
    }));
    const id = await addSource(persistence, organizationId, {
      name: "capped",
      url: `${fixture.url}/rows`,
      limits: { maxRows: 2 },
    });

    const response = await execute(query(id));

    expect(response.statusCode).toBe(200);
    expect(response.json().rows).toHaveLength(2);
    expect(response.json().meta.truncated).toBe(true);
    expect(response.json().meta.rowCount).toBe(2);
  });

  it("rejects a private target when the escape hatch is off", async () => {
    const id = await addSource(persistence, organizationId, {
      name: "loopback",
      url: `${fixture.url}/rows`,
    });
    const hardened = buildApp(testEnv(), { persistence });
    try {
      const anonymous = await login(hardened);
      const response = await hardened.inject({
        method: "POST",
        url: "/v1/queries/execute",
        headers: mutationHeaders(anonymous),
        payload: query(id),
      });

      expect(response.statusCode).toBe(502);
      expect(response.json().error.code).toBe("DATASOURCE_UNREACHABLE");
    } finally {
      await hardened.close();
    }
  });

  it("times out a slow source with 504", async () => {
    const id = await addSource(persistence, organizationId, {
      name: "slow",
      url: `${fixture.url}/rows`,
      limits: { timeoutMs: 100 },
    });
    fixture.delayMs = 5_000;

    try {
      const response = await execute(query(id));
      expect(response.statusCode).toBe(504);
      expect(response.json().error.code).toBe("QUERY_TIMEOUT");
    } finally {
      fixture.delayMs = 0;
    }
  });

  it("rejects an oversized response body", async () => {
    fixture.rows = [{ timestamp: "2026-11-12T00:00:00.000Z", value: "x".repeat(500) }];
    const id = await addSource(persistence, organizationId, {
      name: "large",
      url: `${fixture.url}/rows`,
      limits: { maxBytes: 200 },
    });

    const response = await execute(query(id));

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("RESULT_TOO_LARGE");
  });

  it("validates a query without executing it", async () => {
    const valid = await app.inject({
      method: "POST",
      url: "/v1/queries/validate",
      headers: mutationHeaders(editor),
      payload: query("demo-source", { fields: ["value"] }),
    });
    expect(valid.statusCode).toBe(200);
    expect(valid.json()).toEqual({ valid: true, issues: [] });

    const invalid = await app.inject({
      method: "POST",
      url: "/v1/queries/validate",
      headers: mutationHeaders(editor),
      payload: query("demo-source", { dataset: "missing", fields: ["value"] }),
    });
    expect(invalid.statusCode).toBe(200);
    expect(invalid.json().valid).toBe(false);
    expect(invalid.json().issues[0].path).toEqual(["query"]);
  });

  it("discovers datasets for the static source", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/data-sources/demo-source/schema",
      headers: readHeaders(editor),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.kind).toBe("static");
    expect(body.datasets[0].name).toBe("metrics");
    expect(body.datasets[0].fields.map((field: { name: string }) => field.name)).toEqual([
      "timestamp",
      "value",
    ]);
  });

  it("tests connectivity and returns the latency", async () => {
    fixture.rows = [{ timestamp: "2026-11-12T00:00:00.000Z", value: 1 }];
    const id = await addSource(persistence, organizationId, {
      name: "reachable",
      url: `${fixture.url}/rows`,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/data-sources/${id}/test`,
      headers: { cookie: adminCookie, "x-csrf-token": adminCsrf },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().ok).toBe(true);
    expect(typeof response.json().latencyMs).toBe("number");
  });

  it("returns 501 for connectors without schema discovery", async () => {
    const id = await addSource(persistence, organizationId, {
      name: "no-schema",
      url: `${fixture.url}/rows`,
    });

    const response = await app.inject({
      method: "GET",
      url: `/v1/data-sources/${id}/schema`,
      headers: readHeaders(editor),
    });

    expect(response.statusCode).toBe(501);
    expect(response.json().error.code).toBe("NOT_IMPLEMENTED");
  });
});

describe("data-source plugin registry", () => {
  it("registers the built-in static and rest connectors", () => {
    const registry = createPluginRegistry();

    expect(
      registry
        .list()
        .map((manifest) => manifest.kind)
        .sort(),
    ).toEqual(["rest", "static"]);
  });

  it("rejects a duplicate kind unless the host replaces it", () => {
    const registry = createPluginRegistry();
    const staticPlugin = registry.get("static");
    expect(staticPlugin).toBeDefined();

    expect(() => registry.register(staticPlugin!)).toThrow(/already registered/u);
    registry.register(staticPlugin!, { replace: true });
    expect(registry.list()).toHaveLength(2);
  });

  it("rejects a method the capabilities do not declare", () => {
    const registry = createPluginRegistry([]);
    const staticPlugin = createPluginRegistry().get("static")!;
    const broken = {
      ...staticPlugin,
      kind: "broken",
      capabilities: { ...staticPlugin.capabilities, schemaDiscovery: false },
    };

    expect(() => registry.register(broken)).toThrow(/discover\(\) is implemented/u);
  });
});
