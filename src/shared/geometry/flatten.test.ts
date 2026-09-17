import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "../document/emptyDocument";
import {
  defaultStroke,
  defaultTransform,
  solidFill,
  type GroupNode,
  type PathNode,
  type RectNode,
} from "../document/types";
import { flattenNodeToShape } from "./flatten";
import { nodeWorldBounds } from "./bounds";
import { applyMat, nodeWorldMatrix } from "./transform";

function rect(id: string): RectNode {
  return {
    id,
    name: "Rectangle",
    type: "rect",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: defaultTransform(0, 0),
    width: 20,
    height: 10,
    rx: 0,
    ry: 0,
    fill: solidFill("#fff"),
    stroke: defaultStroke("#000", 1),
  };
}

function path(id: string, closed: boolean): PathNode {
  return {
    id,
    name: "Path",
    type: "path",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: defaultTransform(),
    subpaths: [
      {
        closed,
        points: [
          { id: "a", x: 0, y: 0, type: "corner" },
          { id: "b", x: 10, y: 0, type: "corner" },
          { id: "c", x: 10, y: 10, type: "corner" },
        ],
      },
    ],
    fill: solidFill("#fff"),
    stroke: defaultStroke("#000", 1),
    fillRule: "nonzero",
  };
}

describe("flattenNodeToShape", () => {
  it("flattens rectangles to world contours", () => {
    const doc = createEmptyDocument();
    doc.nodes.r1 = rect("r1");
    const shape = flattenNodeToShape(doc, "r1");
    expect(shape?.[0]).toEqual([
      [0, 0],
      [20, 0],
      [20, 10],
      [0, 10],
    ]);
  });

  it("skips open paths and keeps closed ones", () => {
    const doc = createEmptyDocument();
    doc.nodes.open = path("open", false);
    doc.nodes.closed = path("closed", true);
    expect(flattenNodeToShape(doc, "open")).toBeNull();
    expect(flattenNodeToShape(doc, "closed")?.length).toBe(1);
  });

  it("composes nested group transforms for flattening and bounds", () => {
    const doc = createEmptyDocument();
    const outer: GroupNode = {
      ...rect("outer"),
      type: "group",
      transform: { ...defaultTransform(10, 20), rotation: 90 },
      children: ["inner"],
    };
    const inner: GroupNode = {
      ...rect("inner"),
      type: "group",
      transform: { ...defaultTransform(5, 0), scaleX: 2, scaleY: 3 },
      children: ["shape"],
    };
    const shape = rect("shape");
    shape.transform = defaultTransform(1, 2);
    doc.nodes = { outer, inner, shape };
    doc.rootChildIds = ["outer"];

    const world = nodeWorldMatrix(doc, "shape");
    expect(world).toBeTruthy();
    expect(applyMat(world!, 0, 0)).toEqual({ x: 4, y: 27 });
    expect(flattenNodeToShape(doc, "outer")?.[0]).toEqual([
      [4, 27],
      [4.000000000000003, 67],
      [-25.999999999999996, 67],
      [-26, 27.000000000000004],
    ]);
    const bounds = nodeWorldBounds(doc, "outer");
    expect(bounds.x).toBeCloseTo(-26);
    expect(bounds.y).toBeCloseTo(27);
    expect(bounds.w).toBeCloseTo(30);
    expect(bounds.h).toBeCloseTo(40);
  });
});
