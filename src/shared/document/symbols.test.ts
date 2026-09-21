import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyDocument } from "./emptyDocument";
import {
  defaultStroke,
  defaultTransform,
  solidFill,
  type GroupNode,
  type RectNode,
  type SymbolInstanceNode,
} from "./types";
import { applyMat, matrixToTransform, multiply, nodeWorldMatrix, transformToMatrix } from "../geometry/transform";
import { useDocumentStore } from "../stores/documentStore";
import { expandSymbolInstance } from "./symbols";

function rect(id: string, x: number): RectNode {
  return {
    id,
    name: id,
    type: "rect",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: defaultTransform(x, 0),
    width: 10,
    height: 10,
    rx: 0,
    ry: 0,
    fill: solidFill("#fff"),
    stroke: defaultStroke("#000", 1),
  };
}

describe("expandSymbolInstance", () => {
  beforeEach(() => {
    useDocumentStore.temporal.getState().clear();
    const doc = createEmptyDocument();
    const wrap: GroupNode = {
      id: "wrap",
      name: "wrap",
      type: "group",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      transform: defaultTransform(),
      children: ["leaf"],
    };
    const leaf = rect("leaf", 10);
    doc.symbols.mark = {
      id: "mark",
      name: "Mark",
      width: 20,
      height: 10,
      rootChildIds: ["wrap"],
      nodes: { wrap, leaf },
    };
    const inst: SymbolInstanceNode = {
      id: "inst",
      name: "Mark",
      type: "symbolInstance",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      transform: { ...defaultTransform(4, 6), rotation: 90, scaleX: 2, scaleY: 1 },
      symbolId: "mark",
      width: 20,
      height: 10,
    };
    doc.nodes = { inst };
    doc.rootChildIds = ["inst"];
    useDocumentStore.setState({ doc, selection: ["inst"] });
  });

  it("keeps nested symbol artwork in world space after detach", () => {
    const before = useDocumentStore.getState().doc;
    const instWorld = nodeWorldMatrix(before, "inst")!;
    const mini = {
      ...before,
      rootChildIds: before.symbols.mark.rootChildIds,
      nodes: before.symbols.mark.nodes,
    };
    const expected = applyMat(
      multiply(instWorld, nodeWorldMatrix(mini, "leaf")!),
      0,
      0,
    );

    useDocumentStore.getState().detachSymbol("inst");
    const after = useDocumentStore.getState().doc;
    expect(after.nodes.inst).toBeUndefined();
    const rootId = after.rootChildIds[0];
    const group = after.nodes[rootId];
    expect(group?.type).toBe("group");
    if (group?.type !== "group") return;
    const leafId = group.children[0];
    const origin = applyMat(nodeWorldMatrix(after, leafId)!, 0, 0);
    expect(origin.x).toBeCloseTo(expected.x);
    expect(origin.y).toBeCloseTo(expected.y);
    const corner = applyMat(nodeWorldMatrix(after, leafId)!, 1, 0);
    const expectedCorner = applyMat(
      multiply(instWorld, nodeWorldMatrix(mini, "leaf")!),
      1,
      0,
    );
    expect(corner.x).toBeCloseTo(expectedCorner.x);
    expect(corner.y).toBeCloseTo(expectedCorner.y);
  });

  it("leaves the instance in place when the instance transform is singular", () => {
    useDocumentStore.getState().setNodeTransform("inst", {
      ...defaultTransform(),
      scaleX: 0,
      scaleY: 0,
    });
    expect(expandSymbolInstance(useDocumentStore.getState().doc, "inst")).toBeNull();
    useDocumentStore.getState().detachSymbol("inst");
    expect(useDocumentStore.getState().doc.nodes.inst?.type).toBe("symbolInstance");
  });
});

describe("mixed transform conformance", () => {
  it("round-trips nested nonuniform scale plus rotation through matrixToTransform", () => {
    const parent = {
      ...defaultTransform(5, -3),
      rotation: 35,
      scaleX: 2,
      scaleY: 0.5,
    };
    const child = { ...defaultTransform(10, 0), rotation: -12 };
    const composed = multiply(transformToMatrix(parent), transformToMatrix(child));
    const recovered = matrixToTransform(composed);
    expect(recovered).toBeTruthy();
    const again = transformToMatrix(recovered!);
    expect(applyMat(again, 2, 4).x).toBeCloseTo(applyMat(composed, 2, 4).x);
    expect(applyMat(again, 2, 4).y).toBeCloseTo(applyMat(composed, 2, 4).y);
    expect(applyMat(again, 0, 1).x).toBeCloseTo(applyMat(composed, 0, 1).x);
    expect(applyMat(again, 0, 1).y).toBeCloseTo(applyMat(composed, 0, 1).y);
  });
});
