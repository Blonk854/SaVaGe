import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "../../shared/document/emptyDocument";
import {
  defaultStroke,
  defaultTransform,
  solidFill,
  type GroupNode,
  type RectNode,
} from "../../shared/document/types";
import { layerTreeIds } from "./layerTree";

function rect(id: string): RectNode {
  return {
    id,
    name: id,
    type: "rect",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: defaultTransform(),
    width: 10,
    height: 10,
    rx: 0,
    ry: 0,
    fill: solidFill("#fff"),
    stroke: defaultStroke("#000", 1),
  };
}

function group(id: string, children: string[]): GroupNode {
  return {
    id,
    name: id,
    type: "group",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: defaultTransform(),
    children,
  };
}

describe("layerTreeIds", () => {
  it("lists every node with the last root child first", () => {
    const doc = createEmptyDocument();
    doc.nodes = {
      a: rect("a"),
      b: rect("b"),
      g: group("g", ["c"]),
      c: rect("c"),
    };
    doc.rootChildIds = ["a", "g", "b"];
    expect(layerTreeIds(doc)).toEqual(["b", "g", "c", "a"]);
  });

  it("keeps a wide tree fully listed for keyboard rows", () => {
    const doc = createEmptyDocument();
    const ids = Array.from({ length: 80 }, (_, i) => `n${i}`);
    for (const id of ids) doc.nodes[id] = rect(id);
    doc.rootChildIds = ids;
    const listed = layerTreeIds(doc);
    expect(listed).toHaveLength(80);
    expect(listed[0]).toBe("n79");
    expect(listed[79]).toBe("n0");
  });
});
