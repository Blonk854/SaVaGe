import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyDocument } from "./emptyDocument";
import {
  defaultStroke,
  defaultTransform,
  solidFill,
  type GroupNode,
  type RectNode,
  type SymbolInstanceNode,
} from "./types";
import { selectionBounds } from "../geometry/bounds";
import { hitTestTopNode } from "../geometry/hitTest";
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

describe("createSymbolFromSelection", () => {
  beforeEach(() => {
    useDocumentStore.temporal.getState().clear();
    const doc = createEmptyDocument();
    useDocumentStore.setState({ doc, selection: [] });
    useDocumentStore.getState().addNode(rect("a", 10));
    useDocumentStore.getState().addNode(rect("b", 40));
    useDocumentStore.getState().setSelection(["a", "b"]);
    useDocumentStore.getState().groupSelection();
  });

  it("clones a plain subtree when the selected nodes are Immer drafts", () => {
    const before = useDocumentStore.getState();
    const groupId = before.selection[0];
    const group = before.doc.nodes[groupId];
    expect(group?.type).toBe("group");
    if (group?.type !== "group") return;
    const originalChildren = [...group.children];

    useDocumentStore.getState().createSymbolFromSelection("Mark");

    const after = useDocumentStore.getState().doc;
    const symbol = Object.values(after.symbols).find((entry) => entry.name === "Mark");
    expect(symbol).toBeTruthy();
    if (!symbol) return;
    expect(symbol.rootChildIds).toHaveLength(1);
    const clonedRootId = symbol.rootChildIds[0];
    expect(clonedRootId).not.toBe(groupId);
    const cloned = symbol.nodes[clonedRootId];
    expect(cloned?.type).toBe("group");
    if (cloned?.type !== "group") return;
    expect(cloned.children).toHaveLength(originalChildren.length);
    for (const childId of cloned.children) {
      expect(originalChildren.includes(childId)).toBe(false);
      expect(symbol.nodes[childId]?.type).toBe("rect");
      expect(after.nodes[childId]).toBeUndefined();
    }
    expect(after.nodes[groupId]).toBeUndefined();
    for (const id of originalChildren) expect(after.nodes[id]).toBeUndefined();
    const instance = after.nodes[after.rootChildIds[0]];
    expect(instance?.type).toBe("symbolInstance");
    if (instance?.type !== "symbolInstance") return;
    expect(instance.symbolId).toBe(symbol.id);
    expect(structuredClone(symbol.nodes)).toEqual(symbol.nodes);
  });

  it("rebases only the symbol root and keeps nested local transforms", () => {
    const before = useDocumentStore.getState();
    const groupId = before.selection[0];
    const group = before.doc.nodes[groupId];
    expect(group?.type).toBe("group");
    if (group?.type !== "group") return;
    const childId = group.children[0];
    const child = before.doc.nodes[childId];
    expect(child).toBeTruthy();
    if (!child) return;
    useDocumentStore.getState().setNodeTransform(childId, {
      ...child.transform,
      x: child.transform.x + 3,
      rotation: 25,
    });

    const prepared = useDocumentStore.getState().doc;
    const preparedGroup = prepared.nodes[groupId];
    expect(preparedGroup?.type).toBe("group");
    if (preparedGroup?.type !== "group") return;
    const nested = preparedGroup.children.map((id) => ({ ...prepared.nodes[id].transform }));
    const bounds = selectionBounds(prepared, [groupId]);

    useDocumentStore.getState().createSymbolFromSelection("Mark");

    const symbol = Object.values(useDocumentStore.getState().doc.symbols).find(
      (entry) => entry.name === "Mark",
    );
    expect(symbol).toBeTruthy();
    if (!symbol) return;
    const cloned = symbol.nodes[symbol.rootChildIds[0]];
    expect(cloned?.type).toBe("group");
    if (cloned?.type !== "group") return;
    expect(cloned.transform.x).toBeCloseTo(preparedGroup.transform.x - bounds.x);
    expect(cloned.transform.y).toBeCloseTo(preparedGroup.transform.y - bounds.y);
    expect(cloned.transform.rotation).toBe(preparedGroup.transform.rotation);
    expect(cloned.transform.scaleX).toBe(preparedGroup.transform.scaleX);
    expect(cloned.transform.scaleY).toBe(preparedGroup.transform.scaleY);
    cloned.children.forEach((id, index) => {
      expect(symbol.nodes[id]?.transform).toEqual(nested[index]);
    });
  });

  it("keeps a node’s world point on the new instance when its parent is rotated", () => {
    useDocumentStore.temporal.getState().clear();
    useDocumentStore.setState({ doc: createEmptyDocument(), selection: [] });
    const parent: GroupNode = {
      id: "parent",
      name: "parent",
      type: "group",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      transform: { ...defaultTransform(100, 50), rotation: 90 },
      children: [],
    };
    useDocumentStore.getState().addNode(parent);
    useDocumentStore.getState().addNode(rect("child", 20), "parent");
    useDocumentStore.getState().setSelection(["child"]);

    const before = useDocumentStore.getState().doc;
    const childWorld = nodeWorldMatrix(before, "child");
    expect(childWorld).toBeTruthy();
    if (!childWorld) return;
    const expected = applyMat(childWorld, 0, 0);
    const expectedEdge = applyMat(childWorld, 10, 0);

    useDocumentStore.getState().createSymbolFromSelection("Mark");

    const afterState = useDocumentStore.getState();
    const instance = afterState.doc.nodes[afterState.selection[0]];
    expect(instance?.type).toBe("symbolInstance");
    if (instance?.type !== "symbolInstance") return;
    const symbol = afterState.doc.symbols[instance.symbolId];
    expect(symbol).toBeTruthy();
    if (!symbol) return;
    const clonedId = symbol.rootChildIds[0];
    const mini = {
      ...afterState.doc,
      rootChildIds: symbol.rootChildIds,
      nodes: symbol.nodes,
    };
    const placed = multiply(
      nodeWorldMatrix(afterState.doc, instance.id)!,
      nodeWorldMatrix(mini, clonedId)!,
    );
    const origin = applyMat(placed, 0, 0);
    expect(origin.x).toBeCloseTo(expected.x);
    expect(origin.y).toBeCloseTo(expected.y);
    const edge = applyMat(placed, 10, 0);
    expect(edge.x).toBeCloseTo(expectedEdge.x);
    expect(edge.y).toBeCloseTo(expectedEdge.y);
  });

  it("selects the rotated-parent instance at the artwork world origin", () => {
    useDocumentStore.temporal.getState().clear();
    useDocumentStore.setState({ doc: createEmptyDocument(), selection: [] });
    const parent: GroupNode = {
      id: "parent",
      name: "parent",
      type: "group",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      transform: { ...defaultTransform(100, 50), rotation: 90 },
      children: [],
    };
    useDocumentStore.getState().addNode(parent);
    useDocumentStore.getState().addNode(rect("child", 20), "parent");
    useDocumentStore.getState().setSelection(["child"]);
    useDocumentStore.getState().createSymbolFromSelection("Mark");

    const afterState = useDocumentStore.getState();
    const instance = afterState.doc.nodes[afterState.selection[0]];
    expect(instance?.type).toBe("symbolInstance");
    if (instance?.type !== "symbolInstance") return;
    const symbol = afterState.doc.symbols[instance.symbolId];
    expect(symbol).toBeTruthy();
    if (!symbol) return;
    const clonedId = symbol.rootChildIds[0];
    const mini = {
      ...afterState.doc,
      rootChildIds: symbol.rootChildIds,
      nodes: symbol.nodes,
    };
    const placed = multiply(
      nodeWorldMatrix(afterState.doc, instance.id)!,
      nodeWorldMatrix(mini, clonedId)!,
    );
    const origin = applyMat(placed, 0, 0);

    vi.stubGlobal(
      "Path2D",
      class {
        rect() {}
      },
    );
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      setTransform: vi.fn(),
      lineWidth: 1,
      isPointInPath: () => true,
      isPointInStroke: () => true,
    } as unknown as CanvasRenderingContext2D;
    try {
      expect(hitTestTopNode(ctx, afterState.doc, origin.x, origin.y, 1)).toBe(instance.id);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

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
