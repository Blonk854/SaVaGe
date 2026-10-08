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
  hitTestWorldPad,
  nodeHitBoundsContains,
} from "./hitTest";
import { identity, nodeWorldMatrix } from "./transform";

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

  it("pads stroke-only symbol artwork before rejecting instance hits", () => {
    const doc = createEmptyDocument();
    const art = rect("art", 0, 0, 20, 10, 4);
    art.fill = { type: "none" };
    doc.symbols.mark = {
      id: "mark",
      name: "Mark",
      width: 20,
      height: 10,
      rootChildIds: ["art"],
      nodes: { art },
    };
    doc.nodes.inst = {
      id: "inst",
      name: "Mark",
      type: "symbolInstance",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      transform: defaultTransform(100, 50),
      symbolId: "mark",
      width: 20,
      height: 10,
    };
    doc.rootChildIds = ["inst"];

    expect(nodeHitBoundsContains(doc, doc.nodes.inst, 121, 55, 1)).toBe(true);
    expect(nodeHitBoundsContains(doc, doc.nodes.inst, 123, 55, 1)).toBe(false);

    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      setTransform: vi.fn(),
      lineWidth: 1,
      isPointInPath: () => false,
      isPointInStroke: () => true,
    } as unknown as CanvasRenderingContext2D;
    expect(hitTestTopNode(ctx, doc, 121, 55, 1)).toBe("inst");
  });

  it("scales symbol-artwork stroke pad under a rotated/scaled instance matrix", () => {
    const doc = createEmptyDocument();
    const art = rect("art", 0, 0, 20, 10, 4);
    art.fill = { type: "none" };
    doc.symbols.mark = {
      id: "mark",
      name: "Mark",
      width: 20,
      height: 10,
      rootChildIds: ["art"],
      nodes: { art },
    };
    doc.nodes.inst = {
      id: "inst",
      name: "Mark",
      type: "symbolInstance",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      transform: { ...defaultTransform(100, 50), rotation: 90, scaleX: 2, scaleY: 2 },
      symbolId: "mark",
      width: 20,
      height: 10,
    };
    doc.rootChildIds = ["inst"];

    // Placed matrix is rotate 90° * scale 2, so the stroke pad doubles.
    const placed = nodeWorldMatrix(doc, "inst");
    expect(placed).not.toBeNull();
    expect(hitTestWorldPad(art, 1, identity())).toBe(2);
    expect(hitTestWorldPad(art, 1, placed!)).toBeCloseTo(4);

    // Rotated world AABB spans x∈[80,100], y∈[50,90]; pad 4 extends each side.
    expect(nodeHitBoundsContains(doc, doc.nodes.inst, 77, 70, 1)).toBe(true);
    expect(nodeHitBoundsContains(doc, doc.nodes.inst, 75, 70, 1)).toBe(false);
    expect(nodeHitBoundsContains(doc, doc.nodes.inst, 90, 47, 1)).toBe(true);
    expect(nodeHitBoundsContains(doc, doc.nodes.inst, 90, 45, 1)).toBe(false);

    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      setTransform: vi.fn(),
      lineWidth: 1,
      isPointInPath: () => false,
      isPointInStroke: () => true,
    } as unknown as CanvasRenderingContext2D;
    expect(hitTestTopNode(ctx, doc, 77, 70, 1)).toBe("inst");
  });

  it("uses the max column norm for the pad under a non-uniform instance scale", () => {
    const doc = createEmptyDocument();
    const art = rect("art", 0, 0, 20, 10, 4);
    art.fill = { type: "none" };
    doc.symbols.mark = {
      id: "mark",
      name: "Mark",
      width: 20,
      height: 10,
      rootChildIds: ["art"],
      nodes: { art },
    };
    doc.nodes.inst = {
      id: "inst",
      name: "Mark",
      type: "symbolInstance",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      transform: { ...defaultTransform(100, 50), scaleX: 3, scaleY: 0.5 },
      symbolId: "mark",
      width: 20,
      height: 10,
    };
    doc.rootChildIds = ["inst"];

    // Column norms are 3 and 0.5; the pad tracks the max (3), not the average (1.75).
    const placed = nodeWorldMatrix(doc, "inst");
    expect(placed).not.toBeNull();
    expect(hitTestWorldPad(art, 1, identity())).toBe(2);
    expect(hitTestWorldPad(art, 1, placed!)).toBeCloseTo(6);

    // World AABB spans x∈[100,160], y∈[50,55]; pad 6 extends each side.
    // An average-based pad of 3.5 would reject (95, 52) and (52.5, ...) style edges.
    expect(nodeHitBoundsContains(doc, doc.nodes.inst, 95, 52, 1)).toBe(true);
    expect(nodeHitBoundsContains(doc, doc.nodes.inst, 93, 52, 1)).toBe(false);
    expect(nodeHitBoundsContains(doc, doc.nodes.inst, 165, 52, 1)).toBe(true);
    expect(nodeHitBoundsContains(doc, doc.nodes.inst, 167, 52, 1)).toBe(false);
    expect(nodeHitBoundsContains(doc, doc.nodes.inst, 130, 60, 1)).toBe(true);
    expect(nodeHitBoundsContains(doc, doc.nodes.inst, 130, 62, 1)).toBe(false);

    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      setTransform: vi.fn(),
      lineWidth: 1,
      isPointInPath: () => false,
      isPointInStroke: () => true,
    } as unknown as CanvasRenderingContext2D;
    expect(hitTestTopNode(ctx, doc, 95, 52, 1)).toBe("inst");
  });

  it("uses the full column norm for the pad under instance skewX", () => {
    const doc = createEmptyDocument();
    const art = rect("art", 0, 0, 20, 10, 4);
    art.fill = { type: "none" };
    doc.symbols.mark = {
      id: "mark",
      name: "Mark",
      width: 20,
      height: 10,
      rootChildIds: ["art"],
      nodes: { art },
    };
    doc.nodes.inst = {
      id: "inst",
      name: "Mark",
      type: "symbolInstance",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      transform: { ...defaultTransform(100, 50), skewX: 45 },
      symbolId: "mark",
      width: 20,
      height: 10,
    };
    doc.rootChildIds = ["inst"];

    // skewX 45° places the matrix {a:1, b:0, c:tan45°=1, d:1}. The diagonal
    // terms alone give a scale of 1 (pad 2); the column norms are 1 and √2,
    // so the pad is 2√2. This pins hypot(c, d), not max(|a|, |d|).
    const placed = nodeWorldMatrix(doc, "inst");
    expect(placed).not.toBeNull();
    expect(placed!.a).toBeCloseTo(1);
    expect(placed!.b).toBeCloseTo(0);
    expect(placed!.c).toBeCloseTo(1);
    expect(placed!.d).toBeCloseTo(1);
    expect(hitTestWorldPad(art, 1, identity())).toBe(2);
    expect(hitTestWorldPad(art, 1, placed!)).toBeCloseTo(2 * Math.SQRT2);

    // Sheared world AABB spans x∈[100,130], y∈[50,60]; pad 2√2 ≈ 2.828
    // extends each side. A diagonal-only pad of 2 would reject these.
    expect(nodeHitBoundsContains(doc, doc.nodes.inst, 97.5, 55, 1)).toBe(true);
    expect(nodeHitBoundsContains(doc, doc.nodes.inst, 97, 55, 1)).toBe(false);
    expect(nodeHitBoundsContains(doc, doc.nodes.inst, 132.5, 55, 1)).toBe(true);
    expect(nodeHitBoundsContains(doc, doc.nodes.inst, 133, 55, 1)).toBe(false);
    expect(nodeHitBoundsContains(doc, doc.nodes.inst, 115, 47.5, 1)).toBe(true);
    expect(nodeHitBoundsContains(doc, doc.nodes.inst, 115, 47, 1)).toBe(false);
    expect(nodeHitBoundsContains(doc, doc.nodes.inst, 115, 62.5, 1)).toBe(true);
    expect(nodeHitBoundsContains(doc, doc.nodes.inst, 115, 63, 1)).toBe(false);

    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      setTransform: vi.fn(),
      lineWidth: 1,
      isPointInPath: () => false,
      isPointInStroke: () => true,
    } as unknown as CanvasRenderingContext2D;
    expect(hitTestTopNode(ctx, doc, 97.5, 55, 1)).toBe("inst");
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
