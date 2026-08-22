import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "../document/emptyDocument";
import {
  defaultStroke,
  defaultTransform,
  solidFill,
  type PathNode,
  type RectNode,
} from "../document/types";
import { flattenNodeToShape } from "./flatten";

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
});
