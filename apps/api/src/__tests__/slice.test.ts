import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import {
  createApp,
  demoConfig,
  login,
  mutationHeaders,
  readHeaders,
  type LoginResult,
} from "./helpers.ts";

/**
 * The M3.5 acceptance slice over real HTTP: an editor creates a monitoring
 * dashboard, saves and publishes it; a second viewer only ever sees the
 * published configuration.
 */
describe("walking skeleton slice", () => {
  let app: FastifyInstance;
  let editor: LoginResult;
  let viewer: LoginResult;
  let dashboardId: string;

  beforeAll(async () => {
    app = await createApp();
    editor = await login(app);
    viewer = await login(app, "viewer@nama.local", "nama-viewer-123");
  });

  afterAll(async () => {
    await app.close();
  });

  it("lets an editor create, save and publish a dashboard", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/v1/dashboards",
      headers: mutationHeaders(editor),
      payload: { name: "Monitoring" },
    });
    expect(created.statusCode).toBe(201);
    dashboardId = created.json().id;

    const saved = await app.inject({
      method: "PUT",
      url: `/v1/dashboards/${dashboardId}/draft`,
      headers: mutationHeaders(editor, 1),
      payload: { config: demoConfig("Monitoring") },
    });
    expect(saved.statusCode).toBe(200);

    const published = await app.inject({
      method: "POST",
      url: `/v1/dashboards/${dashboardId}/publish`,
      headers: mutationHeaders(editor, 2),
    });
    expect(published.statusCode).toBe(200);
    expect(published.json().publishedConfig.widgets).toHaveLength(2);
  });

  it("shows the published configuration to a second viewer", async () => {
    const list = await app.inject({
      method: "GET",
      url: "/v1/dashboards",
      headers: readHeaders(viewer),
    });
    expect(list.json().items.map((item: { id: string }) => item.id)).toContain(
      dashboardId,
    );

    const view = await app.inject({
      method: "GET",
      url: `/v1/dashboards/${dashboardId}`,
      headers: readHeaders(viewer),
    });
    expect(view.statusCode).toBe(200);
    expect(view.json().publishedConfig.metadata.title).toBe("Monitoring");
    expect(view.json().publishedConfig.widgets).toHaveLength(2);
    expect(view.json().publishedRevision).toBe(3);
    expect(view.json().draftConfig).toBeUndefined();
  });

  it("keeps draft edits away from the viewer until the next publish", async () => {
    const nextDraft = demoConfig("Monitoring v2");
    nextDraft.widgets = [nextDraft.widgets[0]!];
    nextDraft.layouts.desktop.items = [nextDraft.layouts.desktop.items[0]!];

    const saved = await app.inject({
      method: "PUT",
      url: `/v1/dashboards/${dashboardId}/draft`,
      headers: mutationHeaders(editor, 3),
      payload: { config: nextDraft },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().revision).toBe(4);

    const viewerView = await app.inject({
      method: "GET",
      url: `/v1/dashboards/${dashboardId}`,
      headers: readHeaders(viewer),
    });
    expect(viewerView.json().publishedConfig.metadata.title).toBe("Monitoring");
    expect(viewerView.json().publishedConfig.widgets).toHaveLength(2);
    // Draft activity advances `revision` but must not move `publishedRevision`.
    expect(viewerView.json().revision).toBe(4);
    expect(viewerView.json().publishedRevision).toBe(3);

    const viewerDraft = await app.inject({
      method: "GET",
      url: `/v1/dashboards/${dashboardId}/draft`,
      headers: readHeaders(viewer),
    });
    expect(viewerDraft.statusCode).toBe(403);

    const published = await app.inject({
      method: "POST",
      url: `/v1/dashboards/${dashboardId}/publish`,
      headers: mutationHeaders(editor, 4),
    });
    expect(published.statusCode).toBe(200);

    const afterPublish = await app.inject({
      method: "GET",
      url: `/v1/dashboards/${dashboardId}`,
      headers: readHeaders(viewer),
    });
    expect(afterPublish.json().publishedConfig.metadata.title).toBe("Monitoring v2");
    expect(afterPublish.json().publishedConfig.widgets).toHaveLength(1);
    expect(afterPublish.json().revision).toBe(5);
    expect(afterPublish.json().publishedRevision).toBe(5);
  });
});
