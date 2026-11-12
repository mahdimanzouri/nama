import { describe, expect, it } from "vitest";

import { createApiClient } from "../client.ts";
import { ApiError, RevisionConflictError } from "../errors.ts";

interface Call {
  url: string;
  init: RequestInit;
}

function stubFetch(
  reply: { status?: number; body?: unknown } | ((call: Call) => Response),
) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    if (typeof reply === "function") return reply(call);
    if ((reply.status ?? 200) === 204) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(reply.body ?? {}), {
      status: reply.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof globalThis.fetch;

  return { calls, fetchImpl };
}

const SESSION = {
  user: {
    id: "u1",
    email: "demo@nama.local",
    displayName: "Demo",
    locale: "en",
    theme: "system",
    timezone: "UTC",
  },
  organization: { id: "o1", name: "Nama Demo", slug: "nama-demo" },
  role: "editor",
  permissions: ["dashboard.read"],
  csrfToken: "csrf-from-session",
  expiresAt: "2026-11-12T18:00:00.000Z",
};

describe("api client", () => {
  it("logs in with credentials included and JSON body", async () => {
    const { calls, fetchImpl } = stubFetch({ body: SESSION });
    const client = createApiClient({ fetch: fetchImpl });

    const session = await client.login({
      email: "demo@nama.local",
      password: "nama-demo-123",
    });

    expect(session.user.email).toBe("demo@nama.local");
    expect(calls[0]?.url).toBe("/api/v1/auth/login");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.credentials).toBe("include");
    expect(calls[0]?.init.body).toBe(
      JSON.stringify({ email: "demo@nama.local", password: "nama-demo-123" }),
    );
  });

  it("sends CSRF and If-Match on draft saves", async () => {
    const { calls, fetchImpl } = stubFetch({
      body: { revision: 8, updatedAt: "2026-11-12T10:00:00.000Z" },
    });
    const client = createApiClient({
      fetch: fetchImpl,
      csrfToken: () => "csrf-token",
    });

    const result = await client.saveDashboardDraft(
      "db/1",
      { schemaVersion: 1 } as never,
      7,
    );

    expect(result.revision).toBe(8);
    expect(calls[0]?.url).toBe("/api/v1/dashboards/db%2F1/draft");
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers["x-csrf-token"]).toBe("csrf-token");
    expect(headers["if-match"]).toBe('"7"');
    expect(calls[0]?.init.method).toBe("PUT");
  });

  it("does not send mutation headers on reads", async () => {
    const { calls, fetchImpl } = stubFetch({
      body: { id: "d1", publishedConfig: null },
    });
    const client = createApiClient({
      fetch: fetchImpl,
      csrfToken: () => "csrf-token",
    });

    await client.getDashboard("d1");

    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers["x-csrf-token"]).toBeUndefined();
    expect(headers["if-match"]).toBeUndefined();
  });

  it("maps a stale revision to RevisionConflictError", async () => {
    const { fetchImpl } = stubFetch({
      status: 409,
      body: {
        error: {
          code: "REVISION_CONFLICT",
          message: "stale",
          requestId: "r1",
          currentRevision: 4,
        },
      },
    });
    const client = createApiClient({ fetch: fetchImpl, csrfToken: () => "token" });

    const error = await client
      .saveDashboardDraft("d1", {} as never, 3)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(RevisionConflictError);
    expect((error as RevisionConflictError).currentRevision).toBe(4);
    expect((error as RevisionConflictError).status).toBe(409);
  });

  it("maps validation failures with field paths and issues", async () => {
    const { fetchImpl } = stubFetch({
      status: 422,
      body: {
        error: {
          code: "VALIDATION_FAILED",
          message: "invalid",
          requestId: "r2",
          fieldPaths: ["widgets.0.id"],
          issues: [{ code: "custom", path: ["widgets", 0, "id"], message: "bad" }],
        },
      },
    });
    const client = createApiClient({ fetch: fetchImpl, csrfToken: () => "token" });

    const error = (await client
      .saveDashboardDraft("d1", {} as never, 1)
      .catch((reason: unknown) => reason)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(error.fieldPaths).toEqual(["widgets.0.id"]);
    expect(error.issues).toHaveLength(1);
  });

  it("handles 204 responses without parsing a body", async () => {
    const { fetchImpl } = stubFetch({ status: 204 });
    const client = createApiClient({ fetch: fetchImpl, csrfToken: () => "token" });

    await expect(client.logout()).resolves.toBeUndefined();
  });

  it("builds pagination query parameters and honours a custom base URL", async () => {
    const { calls, fetchImpl } = stubFetch({
      body: { items: [], pagination: { page: 2, pageSize: 5, total: 0 } },
    });
    const client = createApiClient({
      fetch: fetchImpl,
      baseUrl: "https://api.example.test/",
    });

    await client.listDashboards({ page: 2, pageSize: 5 });

    expect(calls[0]?.url).toBe(
      "https://api.example.test/v1/dashboards?page=2&pageSize=5",
    );
  });

  it("posts query requests through the typed surface", async () => {
    const { calls, fetchImpl } = stubFetch({
      body: {
        queryId: "q",
        columns: [],
        rows: [],
        timestamp: "2026-11-12T10:00:00.000Z",
        meta: { rowCount: 0, truncated: false, executionTimeMs: 1, cached: false },
      },
    });
    const client = createApiClient({ fetch: fetchImpl, csrfToken: () => "token" });

    const result = await client.executeQuery({
      queryId: "q",
      dataSourceId: "demo-source",
      query: { queryId: "q", fields: ["value"] },
    });

    expect(result.meta.rowCount).toBe(0);
    expect(calls[0]?.url).toBe("/api/v1/queries/execute");
    expect(calls[0]?.init.method).toBe("POST");
  });

  it("lists versions and restores one with If-Match", async () => {
    const { calls, fetchImpl } = stubFetch((call) =>
      call.url.includes("/versions")
        ? Response.json({
            items: [{ id: "v1", revision: 3, title: "Ops", createdAt: "now" }],
            pagination: { page: 1, pageSize: 25, total: 1 },
          })
        : Response.json({ config: {}, revision: 5, updatedAt: "later" }),
    );
    const client = createApiClient({ fetch: fetchImpl, csrfToken: () => "token" });

    const versions = await client.listDashboardVersions("d1");
    expect(versions.items[0]?.revision).toBe(3);
    expect(calls[0]?.url).toBe("/api/v1/dashboards/d1/versions");

    const draft = await client.restoreDashboardVersion("d1", "v1", 4);
    expect(draft.revision).toBe(5);
    expect(calls[1]?.url).toBe("/api/v1/dashboards/d1/restore");
    expect(calls[1]?.init.method).toBe("POST");
    expect(calls[1]?.init.body).toBe(JSON.stringify({ versionId: "v1" }));
    const headers = calls[1]?.init.headers as Record<string, string>;
    expect(headers["if-match"]).toBe('"4"');
    expect(headers["x-csrf-token"]).toBe("token");
  });

  it("falls back to a generic error when the body is not JSON", async () => {
    const { fetchImpl } = stubFetch(() => new Response("gateway error", { status: 502 }));
    const client = createApiClient({ fetch: fetchImpl });

    const error = (await client
      .getSession()
      .catch((reason: unknown) => reason)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(502);
    expect(error.code).toBe("INTERNAL");
  });
});
