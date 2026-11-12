import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import {
  addSecondTenant,
  createApp,
  demoConfig,
  login,
  mutationHeaders,
  readHeaders,
  testEnv,
  type LoginResult,
} from "./helpers.ts";
import { createSeededStore } from "../infrastructure/store.ts";

async function createDashboard(app: FastifyInstance, session: LoginResult, name: string) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/dashboards",
    headers: mutationHeaders(session),
    payload: { name },
  });

  expect(response.statusCode).toBe(201);
  return response.json() as { id: string; revision: number; name: string };
}

async function saveDraft(
  app: FastifyInstance,
  session: LoginResult,
  id: string,
  revision: number,
  config = demoConfig("Monitoring"),
) {
  return app.inject({
    method: "PUT",
    url: `/v1/dashboards/${id}/draft`,
    headers: mutationHeaders(session, revision),
    payload: { config },
  });
}

describe("dashboard lifecycle", () => {
  let app: FastifyInstance;
  let editor: LoginResult;

  beforeAll(async () => {
    app = await createApp();
    editor = await login(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires CSRF to create a dashboard", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/dashboards",
      headers: readHeaders(editor),
      payload: { name: "No CSRF" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("creates, lists and reads a dashboard without leaking the draft to viewers", async () => {
    const created = await createDashboard(app, editor, "Operations");

    expect(created.name).toBe("Operations");
    expect(created.revision).toBe(1);

    const list = await app.inject({
      method: "GET",
      url: "/v1/dashboards",
      headers: readHeaders(editor),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items.map((item: { id: string }) => item.id)).toContain(
      created.id,
    );

    const view = await app.inject({
      method: "GET",
      url: `/v1/dashboards/${created.id}`,
      headers: readHeaders(editor),
    });
    expect(view.statusCode).toBe(200);
    expect(view.json().publishedConfig).toBeNull();
    expect(view.json().draftConfig).toBeUndefined();
  });

  it("saves a draft with If-Match and rejects stale revisions", async () => {
    const created = await createDashboard(app, editor, "Stale check");

    const saved = await saveDraft(app, editor, created.id, 1);
    expect(saved.statusCode).toBe(200);
    expect(saved.json().revision).toBe(2);

    const draft = await app.inject({
      method: "GET",
      url: `/v1/dashboards/${created.id}/draft`,
      headers: readHeaders(editor),
    });
    expect(draft.statusCode).toBe(200);
    expect(draft.json().config.widgets).toHaveLength(2);
    expect(draft.json().revision).toBe(2);

    const stale = await saveDraft(app, editor, created.id, 1, demoConfig("Conflicting"));
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe("REVISION_CONFLICT");
    expect(stale.json().error.currentRevision).toBe(2);
  });

  it("requires If-Match and validates the configuration", async () => {
    const created = await createDashboard(app, editor, "Validation");

    const missing = await app.inject({
      method: "PUT",
      url: `/v1/dashboards/${created.id}/draft`,
      headers: mutationHeaders(editor),
      payload: { config: demoConfig("Validation") },
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.code).toBe("IF_MATCH_REQUIRED");

    const invalid = await app.inject({
      method: "PUT",
      url: `/v1/dashboards/${created.id}/draft`,
      headers: mutationHeaders(editor, 1),
      payload: {
        config: {
          ...demoConfig("Validation"),
          widgets: [...demoConfig("Validation").widgets, demoConfig("x").widgets[0]],
        },
      },
    });
    expect(invalid.statusCode).toBe(422);
    expect(invalid.json().error.code).toBe("VALIDATION_FAILED");
    expect(invalid.json().error.fieldPaths.length).toBeGreaterThan(0);
  });

  it("publishes a snapshot atomically and rejects a stale publish", async () => {
    const created = await createDashboard(app, editor, "Publish");
    await saveDraft(app, editor, created.id, 1);

    const published = await app.inject({
      method: "POST",
      url: `/v1/dashboards/${created.id}/publish`,
      headers: mutationHeaders(editor, 2),
    });
    expect(published.statusCode).toBe(200);
    expect(published.json().revision).toBe(3);
    expect(published.json().publishedConfig.widgets).toHaveLength(2);
    expect(typeof published.json().publishedAt).toBe("string");

    const stale = await app.inject({
      method: "POST",
      url: `/v1/dashboards/${created.id}/publish`,
      headers: mutationHeaders(editor, 2),
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.currentRevision).toBe(3);
  });

  it("keeps viewers on the published configuration and blocks the draft", async () => {
    const created = await createDashboard(app, editor, "Viewer isolation");
    await saveDraft(app, editor, created.id, 1);
    await app.inject({
      method: "POST",
      url: `/v1/dashboards/${created.id}/publish`,
      headers: mutationHeaders(editor, 2),
    });

    const viewer = await login(app, "viewer@nama.local", "nama-viewer-123");

    const view = await app.inject({
      method: "GET",
      url: `/v1/dashboards/${created.id}`,
      headers: readHeaders(viewer),
    });
    expect(view.statusCode).toBe(200);
    expect(view.json().publishedConfig.widgets).toHaveLength(2);
    expect(view.json().draftConfig).toBeUndefined();

    const draft = await app.inject({
      method: "GET",
      url: `/v1/dashboards/${created.id}/draft`,
      headers: readHeaders(viewer),
    });
    expect(draft.statusCode).toBe(403);

    const save = await saveDraft(app, viewer, created.id, 3);
    expect(save.statusCode).toBe(403);
  });

  it("returns 404 for a dashboard owned by another organization", async () => {
    const store = createSeededStore(testEnv());
    const tenantApp = await createApp({ store });
    const tenantEditor = await login(tenantApp);
    const created = await createDashboard(tenantApp, tenantEditor, "Tenant scoped");

    const tenant = addSecondTenant(store);

    const response = await tenantApp.inject({
      method: "GET",
      url: `/v1/dashboards/${created.id}`,
      headers: { cookie: tenant.cookie },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("NOT_FOUND");

    const list = await tenantApp.inject({
      method: "GET",
      url: "/v1/dashboards",
      headers: { cookie: tenant.cookie },
    });
    expect(list.json().items).toHaveLength(0);

    await tenantApp.close();
  });
});
