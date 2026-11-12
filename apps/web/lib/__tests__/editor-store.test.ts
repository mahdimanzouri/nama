import { describe, expect, it } from "vitest";
import type { DashboardView } from "@nama/api-client";

import { createEmptyConfig } from "../dashboard-config";
import { createEditorStore, isDirty, type EditorBaseline } from "../editor-store";

function baseline(): EditorBaseline {
  return {
    config: createEmptyConfig("Operations"),
    revision: 1,
    updatedAt: "2026-11-12T00:00:00.000Z",
    publishedAt: null,
    publishedConfig: null,
  };
}

describe("editor store", () => {
  it("tracks local edits against the saved baseline", () => {
    const store = createEditorStore(baseline());

    expect(isDirty(store.getState())).toBe(false);

    store.getState().addWidget("kpi");
    expect(isDirty(store.getState())).toBe(true);

    const sent = store.getState().config;
    store.getState().saved(sent, 2, "2026-11-12T00:01:00.000Z");

    expect(isDirty(store.getState())).toBe(false);
    expect(store.getState().revision).toBe(2);
    expect(store.getState().notice).toBe("Draft saved.");
  });

  it("keeps a conflict until the latest draft is reloaded", () => {
    const store = createEditorStore(baseline());

    store.getState().beginWork("saving");
    store.getState().conflicted(4);

    expect(store.getState().phase).toBe("idle");
    expect(store.getState().conflictRevision).toBe(4);

    const latest = createEmptyConfig("Operations");
    store.getState().reloaded({
      config: latest,
      revision: 4,
      updatedAt: "2026-11-12T00:02:00.000Z",
      publishedAt: null,
      publishedConfig: null,
    });

    expect(store.getState().conflictRevision).toBeNull();
    expect(store.getState().revision).toBe(4);
    expect(isDirty(store.getState())).toBe(false);
  });

  it("records a publish result and keeps the published configuration", () => {
    const store = createEditorStore(baseline());
    const publishedConfig = store.getState().config;
    const view: DashboardView = {
      id: "0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b21",
      organizationId: "0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b22",
      name: "Operations",
      revision: 2,
      publishedRevision: 2,
      updatedAt: "2026-11-12T00:03:00.000Z",
      publishedAt: "2026-11-12T00:03:00.000Z",
      publishedConfig,
      permissions: ["dashboard.read"],
    };

    store.getState().published(view);

    expect(store.getState().revision).toBe(2);
    expect(store.getState().publishedConfig).toBe(publishedConfig);
    expect(store.getState().publishedAt).toBe("2026-11-12T00:03:00.000Z");
    expect(isDirty(store.getState())).toBe(false);
  });
});
