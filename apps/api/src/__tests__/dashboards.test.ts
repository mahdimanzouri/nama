import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import {
  addSecondTenant,
  createApp,
  demoConfig,
  login,
  mutationHeaders,
  readHeaders,
  createTestPersistence,
  testEnv,
  type LoginResult,
} from "./helpers.ts";

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

  it("creates a dashboard from a supplied configuration", async () => {
    const config = demoConfig("Templated monitoring");
    const response = await app.inject({
      method: "POST",
      url: "/v1/dashboards",
      headers: mutationHeaders(editor),
      payload: { config },
    });

    expect(response.statusCode).toBe(201);
    const created = response.json() as { id: string; name: string };
    expect(created.name).toBe("Templated monitoring");

    const draft = await app.inject({
      method: "GET",
      url: `/v1/dashboards/${created.id}/draft`,
      headers: readHeaders(editor),
    });
    expect(draft.statusCode).toBe(200);
    expect(draft.json().config.widgets).toHaveLength(config.widgets.length);
    expect(draft.json().config.metadata.title).toBe("Templated monitoring");
  });

  it("renames a supplied configuration when a name is given", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/dashboards",
      headers: mutationHeaders(editor),
      payload: { name: "Imported copy", config: demoConfig("Original") },
    });

    expect(response.statusCode).toBe(201);
    const created = response.json() as { id: string; name: string };
    expect(created.name).toBe("Imported copy");

    const draft = await app.inject({
      method: "GET",
      url: `/v1/dashboards/${created.id}/draft`,
      headers: readHeaders(editor),
    });
    expect(draft.json().config.metadata.title).toBe("Imported copy");
  });

  it("rejects a starting configuration that fails schema validation", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/dashboards",
      headers: mutationHeaders(editor),
      payload: { config: { schemaVersion: 1, metadata: { title: "Broken" } } },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("VALIDATION_FAILED");
  });

  it("requires a name or a configuration when creating", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/dashboards",
      headers: mutationHeaders(editor),
      payload: {},
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("VALIDATION_FAILED");
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

  it("lists published versions and restores one into the draft", async () => {
    const created = await createDashboard(app, editor, "Version one");
    await saveDraft(app, editor, created.id, 1, demoConfig("Version one"));
    const first = await app.inject({
      method: "POST",
      url: `/v1/dashboards/${created.id}/publish`,
      headers: mutationHeaders(editor, 2),
    });
    expect(first.statusCode).toBe(200);

    await saveDraft(app, editor, created.id, 3, demoConfig("Version two"));
    const second = await app.inject({
      method: "POST",
      url: `/v1/dashboards/${created.id}/publish`,
      headers: mutationHeaders(editor, 4),
    });
    expect(second.statusCode).toBe(200);

    const versions = await app.inject({
      method: "GET",
      url: `/v1/dashboards/${created.id}/versions`,
      headers: readHeaders(editor),
    });
    expect(versions.statusCode).toBe(200);
    expect(versions.json().items).toHaveLength(2);
    expect(versions.json().items[0].revision).toBe(5);
    expect(versions.json().items[0].title).toBe("Version two");
    expect(versions.json().items[0].config).toBeUndefined();

    const oldest = versions.json().items[1] as { id: string };
    const restored = await app.inject({
      method: "POST",
      url: `/v1/dashboards/${created.id}/restore`,
      headers: mutationHeaders(editor, 5),
      payload: { versionId: oldest.id },
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json().revision).toBe(6);
    expect(restored.json().config.metadata.title).toBe("Version one");

    const staleRestore = await app.inject({
      method: "POST",
      url: `/v1/dashboards/${created.id}/restore`,
      headers: mutationHeaders(editor, 5),
      payload: { versionId: oldest.id },
    });
    expect(staleRestore.statusCode).toBe(409);
    expect(staleRestore.json().error.currentRevision).toBe(6);

    const viewer = await login(app, "viewer@nama.local", "nama-viewer-123");
    const viewerRestore = await app.inject({
      method: "POST",
      url: `/v1/dashboards/${created.id}/restore`,
      headers: mutationHeaders(viewer, 6),
      payload: { versionId: oldest.id },
    });
    expect(viewerRestore.statusCode).toBe(403);

    const missing = await app.inject({
      method: "POST",
      url: `/v1/dashboards/${created.id}/restore`,
      headers: mutationHeaders(editor, 6),
      payload: { versionId: "00000000-0000-7000-8000-000000000000" },
    });
    expect(missing.statusCode).toBe(404);
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
    const persistence = createTestPersistence(testEnv());
    const tenantApp = await createApp({ persistence });
    const tenantEditor = await login(tenantApp);
    const created = await createDashboard(tenantApp, tenantEditor, "Tenant scoped");

    const tenant = await addSecondTenant(persistence);

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
