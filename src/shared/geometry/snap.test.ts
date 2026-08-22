import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "../document/emptyDocument";
import { defaultPerspectiveGrid } from "./perspective";
import { SNAP_GRID, snapWorldPoint } from "./snap";
import { defaultStroke, defaultTransform, solidFill, type RectNode } from "../document/types";

describe("snapWorldPoint", () => {
  it("snaps to the document grid when Snap and Grid are on", () => {
    const doc = createEmptyDocument();
    const p = snapWorldPoint(33, 3, {
      zoom: 1,
      showGrid: true,
      perspective: defaultPerspectiveGrid(),
      doc,
    });
    expect(p.x).toBe(SNAP_GRID);
    expect(p.y).toBe(3);
  });

  it("snaps to nearby object corners", () => {
    const doc = createEmptyDocument();
    const rect: RectNode = {
      id: "r1",
      name: "Rectangle",
      type: "rect",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      transform: defaultTransform(100, 80),
      width: 40,
      height: 20,
      rx: 0,
      ry: 0,
      fill: solidFill("#fff"),
      stroke: defaultStroke("#000", 0),
    };
    doc.nodes[rect.id] = rect;
    doc.rootChildIds = [rect.id];
    const p = snapWorldPoint(102, 81, {
      zoom: 1,
      showGrid: false,
      perspective: defaultPerspectiveGrid(),
      doc,
    });
    expect(p.x).toBe(100);
    expect(p.y).toBe(80);
  });

  it("leaves points alone when nothing is in range", () => {
    const doc = createEmptyDocument();
    const p = snapWorldPoint(17, 19, {
      zoom: 1,
      showGrid: false,
      perspective: defaultPerspectiveGrid(),
      doc,
    });
    expect(p).toEqual({ x: 17, y: 19 });
  });
});
