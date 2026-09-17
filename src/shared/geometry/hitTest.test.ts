import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyDocument } from "../document/emptyDocument";
import {
  defaultStroke,
  defaultTransform,
  solidFill,
  type LineNode,
  type RectNode,
} from "../document/types";
import { nodeWorldBounds, pointInBounds } from "./bounds";
import {
  hitTestTopNode,
  nodeHitBoundsContains,
} from "./hitTest";

class Path2DStub {
  rect() {}
  ellipse() {}
  moveTo() {}
  lineTo() {}
  bezierCurveTo() {}
  closePath() {}
  addPath() {}
}

function rect(id: string, x: number, y: number, width = 20, height = 10, strokeWidth = 0): RectNode {
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
    stroke:
      strokeWidth > 0
        ? defaultStroke("#000", strokeWidth)
        : { ...defaultStroke("#000", 1), paint: { type: "none" } },
  };
}

function line(id: string, x: number, y: number, x2: number, y2: number): LineNode {
  return {
    id,
    name: id,
    type: "line",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: defaultTransform(x, y),
    x2,
    y2,
    stroke: defaultStroke("#000", 2),
  };
}

function fakeCtx(precise = true) {
  const calls = { path: 0, stroke: 0 };
  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    lineWidth: 1,
    isPointInPath: () => {
      calls.path += 1;
      return precise;
    },
    isPointInStroke: () => {
      calls.stroke += 1;
      return precise;
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe("pointInBounds", () => {
  it("includes the padded edge and rejects far points", () => {
    const b = { x: 10, y: 20, w: 30, h: 40 };
    expect(pointInBounds(b, 10, 20)).toBe(true);
    expect(pointInBounds(b, 40, 60)).toBe(true);
    expect(pointInBounds(b, 9, 20)).toBe(false);
    expect(pointInBounds(b, 9, 20, 1)).toBe(true);
    expect(pointInBounds(b, 100, 20, 1)).toBe(false);
  });
});

describe("hit-test bounds rejection", () => {
  beforeEach(() => {
    vi.stubGlobal("Path2D", Path2DStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips Path2D tests for points outside the padded AABB", () => {
    const doc = createEmptyDocument();
    doc.nodes.a = rect("a", 0, 0, 20, 10);
    doc.rootChildIds = ["a"];
    expect(nodeHitBoundsContains(doc, doc.nodes.a, 8, 4, 1)).toBe(true);
    expect(nodeHitBoundsContains(doc, doc.nodes.a, 80, 4, 1)).toBe(false);

    const { ctx, calls } = fakeCtx(true);
    expect(hitTestTopNode(ctx, doc, 80, 4, 1)).toBeNull();
    expect(calls.path).toBe(0);
    expect(calls.stroke).toBe(0);
    expect(hitTestTopNode(ctx, doc, 8, 4, 1)).toBe("a");
    expect(calls.path).toBeGreaterThan(0);
  });

  it("keeps topmost paint-order selection among overlapping leaves", () => {
    const doc = createEmptyDocument();
    doc.nodes.back = rect("back", 0, 0, 40, 40);
    doc.nodes.front = rect("front", 10, 10, 40, 40);
    doc.rootChildIds = ["back", "front"];
    const { ctx, calls } = fakeCtx(true);
    expect(hitTestTopNode(ctx, doc, 20, 20, 1)).toBe("front");
    expect(calls.path).toBe(1);
    expect(hitTestTopNode(ctx, doc, 5, 5, 1)).toBe("back");
    expect(hitTestTopNode(ctx, doc, 45, 45, 1)).toBe("front");
    expect(hitTestTopNode(ctx, doc, 80, 80, 1)).toBeNull();
  });

  it("still tests a lower node after the top node fails the AABB", () => {
    const doc = createEmptyDocument();
    doc.nodes.back = rect("back", 0, 0, 20, 20);
    doc.nodes.front = rect("front", 100, 100, 20, 20);
    doc.rootChildIds = ["back", "front"];
    const { ctx, calls } = fakeCtx(true);
    expect(hitTestTopNode(ctx, doc, 10, 10, 1)).toBe("back");
    expect(calls.path).toBe(1);
  });

  it("pads stroked geometry so edge hits are not rejected", () => {
    const plainDoc = createEmptyDocument();
    plainDoc.nodes.plain = rect("plain", 0, 0, 20, 10, 0);
    plainDoc.rootChildIds = ["plain"];
    const inkDoc = createEmptyDocument();
    inkDoc.nodes.ink = rect("ink", 0, 0, 20, 10, 4);
    inkDoc.rootChildIds = ["ink"];
    expect(nodeHitBoundsContains(plainDoc, plainDoc.nodes.plain, 21, 5, 1)).toBe(false);
    expect(nodeHitBoundsContains(inkDoc, inkDoc.nodes.ink, 21, 5, 1)).toBe(true);
    expect(nodeWorldBounds(inkDoc, "ink").w).toBe(20);
  });

  it("pads degenerate line bounds", () => {
    const doc = createEmptyDocument();
    doc.nodes.l = line("l", 0, 10, 80, 0);
    doc.rootChildIds = ["l"];
    expect(nodeWorldBounds(doc, "l").h).toBe(0);
    expect(nodeHitBoundsContains(doc, doc.nodes.l, 40, 10, 1)).toBe(true);
    expect(nodeHitBoundsContains(doc, doc.nodes.l, 40, 12, 1)).toBe(true);
    expect(nodeHitBoundsContains(doc, doc.nodes.l, 40, 40, 1)).toBe(false);
  });

  it("skips locked and hidden nodes", () => {
    const doc = createEmptyDocument();
    doc.nodes.a = { ...rect("a", 0, 0, 20, 20), locked: true };
    doc.nodes.b = { ...rect("b", 0, 0, 20, 20), visible: false };
    doc.rootChildIds = ["a", "b"];
    const { ctx, calls } = fakeCtx(true);
    expect(hitTestTopNode(ctx, doc, 10, 10, 1)).toBeNull();
    expect(calls.path).toBe(0);
  });
});
