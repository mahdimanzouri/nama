import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createWidgetRegistry, defineWidget } from "@nama/dashboard-core";

import { createConfig, createKpiWidget } from "../../__tests__/fixtures";
import { createEditorStore, isDirty } from "../store";

const kpiPlugin = defineWidget({
  manifest: { id: "kpi", version: "1.0.0", name: "KPI" },
  configVersion: 1,
  configSchema: z.object({ label: z.string() }),
  defaultConfig: { label: "KPI" },
  defaultSize: { w: 3, h: 4 },
  component: () => null,
});

function createStore() {
  return createEditorStore({
    config: createConfig(),
    revision: 3,
    updatedAt: "2026-11-12T10:00:00.000Z",
    registry: () => createWidgetRegistry([kpiPlugin]),
  });
}

describe("editor store", () => {
  it("adds a registered widget, selects it and marks the draft dirty", () => {
    const store = createStore();
    store.getState().addWidget("kpi");

    const state = store.getState();
    expect(state.config.widgets).toHaveLength(2);
    expect(state.selectedWidgetId).toBe(state.config.widgets[1]!.id);
    expect(isDirty(state)).toBe(true);
    expect(state.history).toHaveLength(1);
  });

  it("applies plugin default query and data source when adding a widget", () => {
    const metricPlugin = defineWidget({
      manifest: { id: "metric", version: "1.0.0", name: "Metric" },
      configVersion: 1,
      configSchema: z.object({ label: z.string() }),
      defaultConfig: { label: "Metric" },
      defaultDataSourceId: "demo-source",
      defaultQuery: {
        queryId: "metric-avg",
        dataset: "metrics",
        fields: ["value"],
        aggregations: [{ field: "value", fn: "avg" }],
        timeRange: { mode: "relative", last: "24h" },
      },
      defaultSize: { w: 3, h: 4 },
      component: () => null,
    });
    const store = createEditorStore({
      config: createConfig([]),
      revision: 1,
      registry: () => createWidgetRegistry([metricPlugin]),
    });

    store.getState().addWidget("metric");

    const widget = store.getState().config.widgets.at(-1)!;
    expect(widget.dataSourceId).toBe("demo-source");
    expect(widget.query?.queryId).toBe("metric-avg");
  });

  it("reports unknown widget types without changing the draft", () => {
    const store = createStore();
    store.getState().addWidget("@acme/missing");

    expect(store.getState().config.widgets).toHaveLength(1);
    expect(store.getState().error).toEqual({
      key: "builder.error.unknownWidget",
      values: { type: "@acme/missing" },
    });
  });

  it("undoes and redoes configuration changes", () => {
    const store = createStore();
    store.getState().addWidget("kpi");
    const added = store.getState().config;

    store.getState().undo();
    expect(store.getState().config.widgets).toHaveLength(1);
    expect(store.getState().future).toHaveLength(1);

    store.getState().redo();
    expect(store.getState().config).toBe(added);
  });

  it("bounds history to 50 entries", () => {
    const store = createStore();
    const widgetId = createKpiWidget().id;

    for (let index = 0; index < 60; index += 1) {
      store.getState().moveWidget(widgetId, 0, 1);
    }

    expect(store.getState().history.length).toBe(50);
  });

  it("commits a drag result as one history entry while materializing the breakpoint", () => {
    const store = createStore();
    store.getState().setBreakpoint("tablet");
    const widgetId = createKpiWidget().id;

    store.getState().commitLayout([{ widgetId, x: 2, y: 1, w: 4, h: 4 }]);

    const state = store.getState();
    expect(state.history).toHaveLength(1);
    expect(state.config.layouts.tablet.items).toEqual([
      { widgetId, x: 2, y: 1, w: 4, h: 4 },
    ]);
  });

  it("notifies the host of every committed configuration", () => {
    const onChange = vi.fn();
    const store = createEditorStore({
      config: createConfig(),
      revision: 1,
      registry: () => createWidgetRegistry([kpiPlugin]),
      onChange,
    });

    store.getState().addWidget("kpi");
    expect(onChange).toHaveBeenCalledTimes(1);

    store.getState().undo();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("clears the dirty flag after a save and advances the revision", () => {
    const store = createStore();
    store.getState().addWidget("kpi");
    const snapshot = store.getState().config;

    store.getState().beginSave();
    expect(store.getState().phase).toBe("saving");

    store.getState().completeSave({
      config: snapshot,
      revision: 4,
      updatedAt: "2026-11-12T11:00:00.000Z",
    });

    const state = store.getState();
    expect(state.phase).toBe("idle");
    expect(state.revision).toBe(4);
    expect(state.notice).toBe("saved");
    expect(isDirty(state)).toBe(false);
  });

  it("clears history and future on publish", () => {
    const store = createStore();
    store.getState().addWidget("kpi");
    store.getState().beginPublish();
    store.getState().completePublish({
      config: store.getState().config,
      revision: 5,
      publishedAt: "2026-11-12T12:00:00.000Z",
      publishedRevision: 5,
    });

    const state = store.getState();
    expect(state.history).toHaveLength(0);
    expect(state.future).toHaveLength(0);
    expect(state.publishedRevision).toBe(5);
    expect(state.notice).toBe("published");
  });

  it("records a conflict and can discard local changes", () => {
    const store = createStore();
    const baseline = store.getState().config;
    store.getState().addWidget("kpi");
    store.getState().markConflict(3, 7);

    expect(store.getState().conflict).toEqual({
      expectedRevision: 3,
      currentRevision: 7,
    });

    store.getState().discardChanges();
    expect(store.getState().config).toBe(baseline);
    expect(store.getState().conflict).toBeNull();
    expect(store.getState().history).toHaveLength(0);
  });

  it("replaces the draft after a restore", () => {
    const store = createStore();
    store.getState().addWidget("kpi");
    const restored = createConfig([]);

    store.getState().replaceDraft({
      config: restored,
      revision: 9,
      updatedAt: "2026-11-12T13:00:00.000Z",
      publishedAt: "2026-11-11T09:00:00.000Z",
      publishedRevision: 8,
    });

    const state = store.getState();
    expect(state.config).toBe(restored);
    expect(state.revision).toBe(9);
    expect(state.publishedRevision).toBe(8);
    expect(state.history).toHaveLength(0);
    expect(isDirty(state)).toBe(false);
  });

  it("rewrites widget interactions when a variable is renamed", () => {
    const store = createStore();
    const region = {
      id: "0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b31",
      name: "region",
      type: "string" as const,
      defaultValue: "all",
      bindings: [],
    };

    store.getState().upsertVariable(region);
    store.getState().updateWidget(createKpiWidget().id, {
      interaction: { variable: "region" },
    });
    store.getState().upsertVariable({ ...region, name: "market" }, "region");

    const state = store.getState();
    expect(state.config.variables).toHaveLength(1);
    expect(state.config.variables[0]?.name).toBe("market");
    expect(state.config.widgets[0]?.interaction).toEqual({ variable: "market" });
  });

  it("clears interactions that referenced a removed variable", () => {
    const store = createStore();
    const region = {
      id: "0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b31",
      name: "region",
      type: "string" as const,
      defaultValue: "all",
      bindings: [],
    };

    store.getState().upsertVariable(region);
    store.getState().updateWidget(createKpiWidget().id, {
      interaction: { variable: "region" },
    });
    store.getState().removeVariable(region.id);

    const state = store.getState();
    expect(state.config.variables).toHaveLength(0);
    expect(state.config.widgets[0]?.interaction).toBeUndefined();
  });

  it("ignores removing a variable that is not in the draft", () => {
    const store = createStore();
    store.getState().selectWidget(createKpiWidget().id);
    store.getState().removeVariable("0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b99");

    expect(store.getState().selectedWidgetId).toBe(createKpiWidget().id);
  });

  it("imports a configuration as one undoable commit", () => {
    const onChange = vi.fn();
    const store = createEditorStore({
      config: createConfig(),
      revision: 1,
      registry: () => createWidgetRegistry([kpiPlugin]),
      onChange,
    });
    store.getState().selectWidget(createKpiWidget().id);
    const imported = createConfig([]);

    store.getState().importConfig(imported);

    expect(store.getState().config).toBe(imported);
    expect(store.getState().selectedWidgetId).toBeNull();
    expect(store.getState().history).toHaveLength(1);
    expect(isDirty(store.getState())).toBe(true);
    expect(onChange).toHaveBeenCalledWith(imported);

    store.getState().undo();
    expect(store.getState().config.widgets).toHaveLength(1);
  });

  it("rebases the revision only when the draft is clean", () => {
    const store = createStore();
    store.getState().rebase(8);
    expect(store.getState().revision).toBe(8);

    store.getState().addWidget("kpi");
    store.getState().rebase(12);
    expect(store.getState().revision).toBe(8);
  });
});
