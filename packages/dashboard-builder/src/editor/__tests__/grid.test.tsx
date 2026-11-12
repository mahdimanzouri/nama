import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GridLayout, noCompactor } from "react-grid-layout";

/**
 * React 19 compatibility gate for React Grid Layout v2: the grid must render a
 * controlled layout on the server without touching `window`.
 */
describe("react-grid-layout with React 19", () => {
  it("server-renders a controlled layout", () => {
    const html = renderToStaticMarkup(
      <GridLayout
        width={800}
        layout={[{ i: "a", x: 0, y: 0, w: 4, h: 2 }]}
        gridConfig={{
          cols: 12,
          rowHeight: 40,
          margin: [8, 8],
          containerPadding: [0, 0],
          maxRows: 1000,
        }}
        compactor={noCompactor}
      >
        <div key="a">Widget A</div>
      </GridLayout>,
    );

    expect(html).toContain("react-grid-layout");
    expect(html).toContain("Widget A");
    expect(html).toContain("react-grid-item");
  });
});
