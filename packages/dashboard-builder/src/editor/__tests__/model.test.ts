import { describe, expect, it } from "vitest";

import { createConfig, createKpiWidget } from "../../__tests__/fixtures";
import {
  addWidgetToConfig,
  editableItems,
  findFreePosition,
  fromGridLayout,
  removeWidgetFromConfig,
  setWidgetRect,
  toGridLayout,
  withBreakpointItems,
} from "../model";

const draftWidget = {
  type: "kpi",
  title: "Revenue",
  config: { label: "Revenue" },
  defaultSize: { w: 3, h: 4 },
};

describe("editor layout model", () => {
  it("adds a widget at the first free position and selects it", () => {
    const config = createConfig();
    const next = addWidgetToConfig(config, "desktop", draftWidget);
    const added = next.widgets[next.widgets.length - 1];

    expect(next.widgets).toHaveLength(2);
    expect(added).toBeDefined();
    expect(editableItems(next, "desktop")).toContainEqual({
      widgetId: added!.id,
      x: 4,
      y: 0,
      w: 3,
      h: 4,
    });
  });

  it("materializes inherited items when a narrower breakpoint is edited", () => {
    const config = addWidgetToConfig(createConfig(), "mobile", draftWidget);

    expect(config.layouts.mobile.items).toHaveLength(2);
    expect(config.layouts.tablet.items).toHaveLength(0);
    expect(editableItems(config, "mobile")).toHaveLength(2);
    expect(editableItems(config, "tablet")).toEqual(editableItems(config, "desktop"));
  });

  it("clamps sizes and positions to the breakpoint columns", () => {
    const config = addWidgetToConfig(createConfig(), "mobile", draftWidget);
    const widgetId = config.widgets[1]!.id;
    const next = setWidgetRect(config, "mobile", widgetId, { x: 10, w: 6 });

    expect(editableItems(next, "mobile")).toContainEqual({
      widgetId,
      x: 0,
      y: expect.any(Number),
      w: 4,
      h: 4,
    });
  });

  it("raises widget heights to the minimum when resized down", () => {
    const config = createConfig();
    const next = setWidgetRect(config, "desktop", createKpiWidget().id, { h: 0 });

    expect(editableItems(next, "desktop")[0]).toMatchObject({ h: 2 });
  });

  it("removes a widget from every breakpoint", () => {
    const config = addWidgetToConfig(createConfig(), "mobile", draftWidget);
    const removed = removeWidgetFromConfig(config, createKpiWidget().id);

    expect(removed.widgets).toHaveLength(1);
    expect(removed.layouts.desktop.items).toHaveLength(0);
    expect(removed.layouts.tablet.items).toHaveLength(0);
    expect(removed.layouts.mobile.items).toHaveLength(1);
  });

  it("finds no free slot inside a filled row", () => {
    const items = [{ widgetId: "a", x: 0, y: 0, w: 4, h: 2 }];

    expect(findFreePosition(items, 4, 4, 2)).toEqual({ x: 0, y: 2 });
  });

  it("round-trips react-grid-layout entries", () => {
    const items = [{ widgetId: "a", x: 1, y: 2, w: 3, h: 4 }];

    expect(fromGridLayout(toGridLayout(items))).toEqual(items);
  });

  it("does not mutate the input config when replacing a breakpoint", () => {
    const config = createConfig();
    const next = withBreakpointItems(config, "tablet", [
      { widgetId: createKpiWidget().id, x: 0, y: 0, w: 4, h: 4 },
    ]);

    expect(config.layouts.tablet.items).toHaveLength(0);
    expect(next.layouts.tablet.items).toHaveLength(1);
  });
});
