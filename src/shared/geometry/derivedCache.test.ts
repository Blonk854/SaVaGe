import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmptyDocument } from "../document/emptyDocument";
import {
  defaultStroke,
  defaultTransform,
  solidFill,
  type GroupNode,
  type RectNode,
  type SvgDocument,
  type SymbolInstanceNode,
} from "../document/types";
import { computeNodeWorldBounds, nodeWorldBounds, type Bounds } from "./bounds";
import {
  derivedCacheStats,
  invalidateDerivedCache,
  resetDerivedCache,
  setDerivedCacheLimits,
} from "./derivedCache";
import { applyMat, collectWorldMatrices, computeNodeWorldMatrix, nodeWorldMatrix } from "./transform";
import { useDocumentStore } from "../stores/documentStore";

function rect(id: string, x = 0, y = 0, width = 20, height = 10): RectNode {
  return {
    id,
    name: id,
    type: "rect",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: defaultTransform(x, y),
    width,
    height,
    rx: 0,
    ry: 0,
    fill: solidFill("#fff"),
    stroke: defaultStroke("#000", 1),
  };
}

function group(id: string, children: string[], transform = defaultTransform()): GroupNode {
  return {
    id,
    name: id,
    type: "group",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform,
    children,
  };
}

function nestedDoc(): SvgDocument {
  const doc = createEmptyDocument();
  const outer = group("outer", ["inner"], { ...defaultTransform(10, 20), rotation: 90 });
  const inner = group("inner", ["shape"], { ...defaultTransform(5, 0), scaleX: 2, scaleY: 3 });
  const shape = rect("shape", 1, 2);
  doc.nodes = { outer, inner, shape };
  doc.rootChildIds = ["outer"];
  return doc;
}

function expectMatrixEq(
  actual: ReturnType<typeof nodeWorldMatrix>,
  expected: ReturnType<typeof computeNodeWorldMatrix>,
) {
  expect(actual).toEqual(expected);
}

function expectBoundsEq(actual: Bounds, expected: Bounds) {
  expect(actual.x).toBeCloseTo(expected.x, 8);
  expect(actual.y).toBeCloseTo(expected.y, 8);
  expect(actual.w).toBeCloseTo(expected.w, 8);
  expect(actual.h).toBeCloseTo(expected.h, 8);
}

function expectMatchesOracle(doc: SvgDocument, ids = Object.keys(doc.nodes)) {
  for (const id of ids) {
    expectMatrixEq(nodeWorldMatrix(doc, id), computeNodeWorldMatrix(doc, id));
    expectBoundsEq(nodeWorldBounds(doc, id), computeNodeWorldBounds(doc, id));
  }
}

describe("derived geometry cache", () => {
  beforeEach(() => {
    resetDerivedCache();
    useDocumentStore.temporal.getState().clear();
    useDocumentStore.setState({ doc: createEmptyDocument(), selection: [] });
  });

  afterEach(() => {
    resetDerivedCache();
  });

  it("matches the uncached oracle for nested transforms", () => {
    const doc = nestedDoc();
    expectMatchesOracle(doc);
    const world = nodeWorldMatrix(doc, "shape");
    expect(world).toBeTruthy();
    expect(applyMat(world!, 0, 0)).toEqual({ x: 4, y: 27 });
    const bounds = nodeWorldBounds(doc, "outer");
    expect(bounds.x).toBeCloseTo(-26);
    expect(bounds.y).toBeCloseTo(27);
    expect(bounds.w).toBeCloseTo(30);
    expect(bounds.h).toBeCloseTo(40);
  });

  it("bulk-fill matrices match the per-node oracle", () => {
    const doc = nestedDoc();
    for (const [id, matrix] of collectWorldMatrices(doc)) {
      expect(matrix).toEqual(computeNodeWorldMatrix(doc, id));
    }
  });

  it("repeat lookups on one snapshot do not miss", () => {
    const doc = nestedDoc();
    nodeWorldMatrix(doc, "shape");
    nodeWorldBounds(doc, "outer");
    const afterWarm = derivedCacheStats();
    expect(afterWarm.matrixEntries).toBeGreaterThan(0);
    expect(afterWarm.boundsEntries).toBeGreaterThan(0);
    nodeWorldMatrix(doc, "shape");
    nodeWorldMatrix(doc, "inner");
    nodeWorldBounds(doc, "outer");
    nodeWorldBounds(doc, "shape");
    const again = derivedCacheStats();
    expect(again.matrixMisses).toBe(afterWarm.matrixMisses);
    expect(again.boundsMisses).toBe(afterWarm.boundsMisses);
    expect(again.matrixHits).toBeGreaterThan(afterWarm.matrixHits);
    expect(again.boundsHits).toBeGreaterThan(afterWarm.boundsHits);
  });

  it("invalidates in-place node edits", () => {
    const doc = nestedDoc();
    const before = nodeWorldMatrix(doc, "shape");
    const beforeBounds = nodeWorldBounds(doc, "shape");
    doc.nodes.shape.transform = defaultTransform(11, 2);
    expect(nodeWorldMatrix(doc, "shape")).toEqual(before);
    expect(nodeWorldBounds(doc, "shape")).toEqual(beforeBounds);
    expect(computeNodeWorldMatrix(doc, "shape")).not.toEqual(before);
    invalidateDerivedCache(doc);
    expectMatchesOracle(doc);
  });

  it("invalidates ancestor transform edits", () => {
    const doc = nestedDoc();
    const before = nodeWorldMatrix(doc, "shape");
    doc.nodes.outer.transform = defaultTransform(0, 0);
    expect(nodeWorldMatrix(doc, "shape")).toEqual(before);
    expect(computeNodeWorldMatrix(doc, "shape")).not.toEqual(before);
    invalidateDerivedCache(doc);
    expectMatchesOracle(doc);
    expect(applyMat(nodeWorldMatrix(doc, "shape")!, 0, 0)).toEqual({ x: 7, y: 6 });
  });

  it("invalidates reparenting", () => {
    const doc = createEmptyDocument();
    const left = group("left", ["leaf"], defaultTransform(100, 0));
    const right = group("right", [], defaultTransform(0, 50));
    const leaf = rect("leaf", 1, 0);
    doc.nodes = { left, right, leaf };
    doc.rootChildIds = ["left", "right"];
    const before = nodeWorldMatrix(doc, "leaf");
    expect(applyMat(before!, 0, 0)).toEqual({ x: 101, y: 0 });

    left.children = [];
    right.children = ["leaf"];
    expect(nodeWorldMatrix(doc, "leaf")).toEqual(before);
    expect(applyMat(computeNodeWorldMatrix(doc, "leaf")!, 0, 0)).toEqual({ x: 1, y: 50 });
    invalidateDerivedCache(doc);
    expectMatchesOracle(doc);
    expect(applyMat(nodeWorldMatrix(doc, "leaf")!, 0, 0)).toEqual({ x: 1, y: 50 });
  });

  it("keeps instance AABBs aligned with the oracle after symbol edits", () => {
    const doc = createEmptyDocument();
    const master = rect("master", 0, 0, 40, 40);
    doc.symbols.sym = {
      id: "sym",
      name: "Mark",
      width: 40,
      height: 40,
      rootChildIds: ["master"],
      nodes: { master },
    };
    const inst: SymbolInstanceNode = {
      ...rect("inst", 10, 20, 40, 40),
      type: "symbolInstance",
      symbolId: "sym",
    };
    doc.nodes = { inst };
    doc.rootChildIds = ["inst"];

    expectMatchesOracle(doc);
    const box = nodeWorldBounds(doc, "inst");
    expect(box).toEqual({ x: 10, y: 20, w: 40, h: 40 });

    doc.symbols.sym.nodes.master.width = 8;
    doc.symbols.sym.width = 8;
    expectMatchesOracle(doc);
    expect(nodeWorldBounds(doc, "inst")).toEqual(box);

    inst.width = 80;
    expect(nodeWorldBounds(doc, "inst")).toEqual(box);
    expect(computeNodeWorldBounds(doc, "inst").w).toBe(80);
    invalidateDerivedCache(doc);
    expectMatchesOracle(doc);
    expect(nodeWorldBounds(doc, "inst").w).toBe(80);
  });

  it("does not reuse another document's cache after replacement", () => {
    const first = nestedDoc();
    const second = nestedDoc();
    second.nodes.outer.transform = defaultTransform(0, 0);
    const firstWorld = nodeWorldMatrix(first, "shape");
    expect(applyMat(firstWorld!, 0, 0)).toEqual({ x: 4, y: 27 });
    expectMatchesOracle(second);
    expect(applyMat(nodeWorldMatrix(second, "shape")!, 0, 0)).toEqual({ x: 7, y: 6 });
    expect(applyMat(nodeWorldMatrix(first, "shape")!, 0, 0)).toEqual({ x: 4, y: 27 });
  });

  it("tracks history snapshots independently", () => {
    const start = nestedDoc();
    useDocumentStore.setState({ doc: start, selection: ["shape"] });
    useDocumentStore.temporal.getState().clear();
    expectMatchesOracle(useDocumentStore.getState().doc);

    useDocumentStore.getState().setNodeTransform("outer", defaultTransform(0, 0));
    const edited = useDocumentStore.getState().doc;
    expect(edited).not.toBe(start);
    expectMatchesOracle(edited);
    expect(applyMat(nodeWorldMatrix(edited, "shape")!, 0, 0)).toEqual({ x: 7, y: 6 });

    useDocumentStore.temporal.getState().undo();
    const undone = useDocumentStore.getState().doc;
    expect(undone).toBe(start);
    expectMatchesOracle(undone);
    expect(applyMat(nodeWorldMatrix(undone, "shape")!, 0, 0)).toEqual({ x: 4, y: 27 });

    useDocumentStore.temporal.getState().redo();
    expectMatchesOracle(useDocumentStore.getState().doc);
  });

  it("replacing the store document does not keep the previous snapshot's matrices", () => {
    useDocumentStore.getState().loadDocument(nestedDoc());
    const loaded = useDocumentStore.getState().doc;
    expect(applyMat(nodeWorldMatrix(loaded, "shape")!, 0, 0)).toEqual({ x: 4, y: 27 });

    const replacement = nestedDoc();
    replacement.nodes.outer.transform = defaultTransform(0, 0);
    useDocumentStore.getState().loadDocument(replacement);
    const next = useDocumentStore.getState().doc;
    expect(next).not.toBe(loaded);
    expectMatchesOracle(next);
    expect(applyMat(nodeWorldMatrix(next, "shape")!, 0, 0)).toEqual({ x: 7, y: 6 });
  });

  it("evicts extra document snapshots", () => {
    setDerivedCacheLimits({ maxDocuments: 2, maxNodesPerDocument: 8 });
    const docs = [0, 1, 2].map((i) => {
      const doc = createEmptyDocument();
      doc.nodes.a = rect("a", i * 10, 0);
      doc.rootChildIds = ["a"];
      return doc;
    });
    for (const doc of docs) nodeWorldMatrix(doc, "a");
    expect(derivedCacheStats().documents).toBe(2);
    for (const doc of docs) expectMatchesOracle(doc);
  });

  it("evicts extra node entries inside a snapshot", () => {
    setDerivedCacheLimits({ maxDocuments: 2, maxNodesPerDocument: 2 });
    const crowded = createEmptyDocument();
    crowded.nodes = {
      a: rect("a", 0, 0),
      b: rect("b", 5, 0),
      c: rect("c", 9, 0),
    };
    crowded.rootChildIds = ["a", "b", "c"];
    for (const id of ["a", "b", "c"]) nodeWorldBounds(crowded, id);
    expect(derivedCacheStats().matrixEntries).toBeLessThanOrEqual(2);
    expect(derivedCacheStats().boundsEntries).toBeLessThanOrEqual(2);
    expectMatchesOracle(crowded);
  });
});
