import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyDocument } from "../document/emptyDocument";
import { parseSavageDocument } from "../document/parseSavage";
import {
  defaultStroke,
  defaultTransform,
  solidFill,
  type GroupNode,
  type PathNode,
  type RectNode,
  type SceneNode,
  type SvgDocument,
  type Transform2D,
} from "../document/types";
import { drawSelectionChrome } from "../../features/editor/renderer/drawHandles";
import { projectContents } from "../stores/projectSessionStore";
import { computeNodeWorldBounds, nodeWorldBounds, selectionBounds } from "./bounds";
import { flattenNodeToShape } from "./flatten";
import { hitTestTopNode, nodeHitBoundsContains } from "./hitTest";
import { collectSnapPoints, snapWorldPoint } from "./snap";
import { defaultPerspectiveGrid } from "./perspective";
import {
  applyMat,
  invertMat,
  nodeWorldMatrix,
  transformForNewParent,
  transformToMatrix,
} from "./transform";

const RECT_W = 10;
const RECT_H = 20;

function rect(id: string, transform: Transform2D, width = RECT_W, height = RECT_H): RectNode {
  return {
    id,
    name: id,
    type: "rect",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform,
    width,
    height,
    rx: 0,
    ry: 0,
    fill: solidFill("#fff"),
    stroke: { ...defaultStroke("#000", 1), paint: { type: "none" } },
  };
}

function group(id: string, children: string[], transform: Transform2D): GroupNode {
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

function path(id: string, transform: Transform2D, points: { id: string; x: number; y: number }[]): PathNode {
  return {
    id,
    name: id,
    type: "path",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform,
    subpaths: [
      {
        closed: true,
        points: points.map((p) => ({ ...p, type: "corner" as const })),
      },
    ],
    fill: solidFill("#fff"),
    stroke: defaultStroke("#000", 1),
    fillRule: "nonzero",
  };
}

function scene(nodes: SceneNode[], roots: string[]): SvgDocument {
  const doc = createEmptyDocument();
  doc.nodes = Object.fromEntries(nodes.map((node) => [node.id, node]));
  doc.rootChildIds = roots;
  return doc;
}

function expectPoint(
  actual: { x: number; y: number },
  x: number,
  y: number,
) {
  expect(actual.x).toBeCloseTo(x, 6);
  expect(actual.y).toBeCloseTo(y, 6);
}

function expectAabb(
  actual: { x: number; y: number; w: number; h: number },
  x: number,
  y: number,
  w: number,
  h: number,
) {
  expect(actual.x).toBeCloseTo(x, 6);
  expect(actual.y).toBeCloseTo(y, 6);
  expect(actual.w).toBeCloseTo(w, 6);
  expect(actual.h).toBeCloseTo(h, 6);
}

function localCorners(width = RECT_W, height = RECT_H): [number, number][] {
  return [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ];
}

function worldCorners(doc: SvgDocument, id: string, locals = localCorners()) {
  const world = nodeWorldMatrix(doc, id);
  expect(world).toBeTruthy();
  return locals.map(([x, y]) => applyMat(world!, x, y));
}

class Path2DStub {
  rect() {}
  ellipse() {}
  moveTo() {}
  lineTo() {}
  bezierCurveTo() {}
  closePath() {}
  addPath() {}
}

function fakeDrawCtx() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    setLineDash: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    rect: vi.fn(),
    fillRect: vi.fn(),
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 1,
  } as unknown as CanvasRenderingContext2D;
}

function fakeHitCtx() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    lineWidth: 1,
    isPointInPath: () => true,
    isPointInStroke: () => false,
  } as unknown as CanvasRenderingContext2D;
}

describe("geometry conformance fixtures", () => {
  it("maps a translated 10×20 rect to hand-calculated world corners", () => {
    const doc = scene([rect("leaf", defaultTransform(100, 50))], ["leaf"]);
    const corners = worldCorners(doc, "leaf");
    expectPoint(corners[0], 100, 50);
    expectPoint(corners[1], 110, 50);
    expectPoint(corners[2], 110, 70);
    expectPoint(corners[3], 100, 70);
    expectAabb(nodeWorldBounds(doc, "leaf"), 100, 50, 10, 20);
    expectAabb(computeNodeWorldBounds(doc, "leaf"), 100, 50, 10, 20);
    expect(flattenNodeToShape(doc, "leaf")?.[0]).toEqual([
      [100, 50],
      [110, 50],
      [110, 70],
      [100, 70],
    ]);
  });

  it("rotates 90° counterclockwise about the local origin", () => {
    const doc = scene([rect("leaf", { ...defaultTransform(), rotation: 90 })], ["leaf"]);
    const corners = worldCorners(doc, "leaf");
    // (x, y) -> (-y, x)
    expectPoint(corners[0], 0, 0);
    expectPoint(corners[1], 0, 10);
    expectPoint(corners[2], -20, 10);
    expectPoint(corners[3], -20, 0);
    expectAabb(nodeWorldBounds(doc, "leaf"), -20, 0, 20, 10);
    expectAabb(selectionBounds(doc, ["leaf"]), -20, 0, 20, 10);
    expect(nodeHitBoundsContains(doc, doc.nodes.leaf, -10, 5, 1)).toBe(true);
    expect(nodeHitBoundsContains(doc, doc.nodes.leaf, 1, 1, 1)).toBe(false);
  });

  it("rotates 45° with independent √2 coordinates", () => {
    const s = Math.SQRT2 / 2;
    const doc = scene([rect("leaf", { ...defaultTransform(), rotation: 45 }, 10, 10)], ["leaf"]);
    const corners = worldCorners(doc, "leaf", localCorners(10, 10));
    expectPoint(corners[0], 0, 0);
    expectPoint(corners[1], 10 * s, 10 * s);
    expectPoint(corners[2], 0, 20 * s);
    expectPoint(corners[3], -10 * s, 10 * s);
    expectAabb(nodeWorldBounds(doc, "leaf"), -10 * s, 0, 20 * s, 20 * s);
  });

  it("reflects through negative scale without dropping the leaf", () => {
    const flipX = scene([rect("leaf", { ...defaultTransform(), scaleX: -1 })], ["leaf"]);
    const flipY = scene([rect("leaf", { ...defaultTransform(), scaleY: -1 })], ["leaf"]);
    const xCorners = worldCorners(flipX, "leaf");
    expectPoint(xCorners[0], 0, 0);
    expectPoint(xCorners[1], -10, 0);
    expectPoint(xCorners[2], -10, 20);
    expectPoint(xCorners[3], 0, 20);
    expectAabb(nodeWorldBounds(flipX, "leaf"), -10, 0, 10, 20);

    const yCorners = worldCorners(flipY, "leaf");
    expectPoint(yCorners[0], 0, 0);
    expectPoint(yCorners[1], 10, 0);
    expectPoint(yCorners[2], 10, -20);
    expectPoint(yCorners[3], 0, -20);
    expectAabb(nodeWorldBounds(flipY, "leaf"), 0, -20, 10, 20);

    const inv = invertMat(nodeWorldMatrix(flipX, "leaf")!);
    expect(inv).toBeTruthy();
    expectPoint(applyMat(inv!, -5, 10), 5, 10);
  });

  it("composes translate × rotate 90 × nonuniform scale in that order", () => {
    const transform = { ...defaultTransform(8, 4), rotation: 90, scaleX: 2, scaleY: 1 };
    const doc = scene([rect("leaf", transform)], ["leaf"]);
    // scale (2x, y), rotate 90: (-y, 2x), then + (8, 4)
    const corners = worldCorners(doc, "leaf");
    expectPoint(corners[0], 8, 4);
    expectPoint(corners[1], 8, 24);
    expectPoint(corners[2], -12, 24);
    expectPoint(corners[3], -12, 4);
    expectAabb(nodeWorldBounds(doc, "leaf"), -12, 4, 20, 20);
    const flat = flattenNodeToShape(doc, "leaf")![0];
    expectPoint({ x: flat[0][0], y: flat[0][1] }, 8, 4);
    expectPoint({ x: flat[1][0], y: flat[1][1] }, 8, 24);
    expectPoint({ x: flat[2][0], y: flat[2][1] }, -12, 24);
    expectPoint({ x: flat[3][0], y: flat[3][1] }, -12, 4);
  });

  it("walks two grouping levels with rotation and nonuniform scale", () => {
    const doc = scene(
      [
        group("outer", ["inner"], { ...defaultTransform(10, 20), rotation: 90 }),
        group("inner", ["shape"], { ...defaultTransform(5, 0), scaleX: 2, scaleY: 3 }),
        rect("shape", defaultTransform(1, 2), 20, 10),
      ],
      ["outer"],
    );
    const corners = worldCorners(doc, "shape", localCorners(20, 10));
    expectPoint(corners[0], 4, 27);
    expectPoint(corners[1], 4, 67);
    expectPoint(corners[2], -26, 67);
    expectPoint(corners[3], -26, 27);
    expectAabb(nodeWorldBounds(doc, "shape"), -26, 27, 30, 40);
    expectAabb(nodeWorldBounds(doc, "outer"), -26, 27, 30, 40);
    expectAabb(computeNodeWorldBounds(doc, "outer"), -26, 27, 30, 40);

    const reopened = parseSavageDocument(projectContents(doc));
    expectPoint(worldCorners(reopened, "shape")[0], 4, 27);
    expectAabb(nodeWorldBounds(reopened, "outer"), -26, 27, 30, 40);
  });

  it("refuses an inverse when scale collapses the determinant", () => {
    const singular = transformToMatrix({ ...defaultTransform(3, 4), scaleX: 0, scaleY: 2 });
    expect(invertMat(singular)).toBeNull();
    const parent = transformToMatrix({ ...defaultTransform(), scaleX: 0, scaleY: 1 });
    const world = transformToMatrix(defaultTransform(10, 0));
    expect(transformForNewParent(world, parent)).toBeNull();
  });

  it("bakes a reflected parent into a new local without moving world points", () => {
    const parent = transformToMatrix({ ...defaultTransform(6, 0), scaleX: -2, scaleY: 1 });
    const world = transformToMatrix(defaultTransform(10, 4));
    const local = transformForNewParent(world, parent);
    expect(local).toBeTruthy();
    const baked = transformToMatrix(local!);
    const composed = {
      a: parent.a * baked.a + parent.c * baked.b,
      b: parent.b * baked.a + parent.d * baked.b,
      c: parent.a * baked.c + parent.c * baked.d,
      d: parent.b * baked.c + parent.d * baked.d,
      e: parent.a * baked.e + parent.c * baked.f + parent.e,
      f: parent.b * baked.e + parent.d * baked.f + parent.f,
    };
    expectPoint(applyMat(composed, 0, 0), 10, 4);
    const sample = applyMat(world, 3, 5);
    expectPoint(applyMat(composed, 3, 5), sample.x, sample.y);
  });
});

describe("nested path snap and selection handles", () => {
  beforeEach(() => {
    vi.stubGlobal("Path2D", Path2DStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const nestedPath = () =>
    scene(
      [
        group("frame", ["mark"], defaultTransform(50, 40)),
        path("mark", defaultTransform(), [
          { id: "p0", x: 0, y: 0 },
          { id: "p1", x: 10, y: 0 },
          { id: "p2", x: 10, y: 10 },
        ]),
      ],
      ["frame"],
    );

  it("snaps to nested path anchors in world space", () => {
    const doc = nestedPath();
    const points = collectSnapPoints(doc);
    expect(points.some((p) => Math.abs(p.x - 60) < 1e-9 && Math.abs(p.y - 40) < 1e-9)).toBe(true);
    const snapped = snapWorldPoint(59, 40, {
      zoom: 1,
      showGrid: false,
      perspective: defaultPerspectiveGrid(),
      doc,
    });
    expectPoint(snapped, 60, 40);
  });

  it("places AABB and path-anchor handles on world coordinates", () => {
    const doc = nestedPath();
    expectAabb(selectionBounds(doc, ["mark"]), 50, 40, 10, 10);
    const handles = drawSelectionChrome(fakeDrawCtx(), doc, ["mark"], 1, 0, 0, true);
    const nw = handles.find((h) => h.id === "nw");
    const anchor = handles.find((h) => h.id === "anchor:p1");
    expect(nw).toBeTruthy();
    expectPoint(nw!, 50, 40);
    expect(anchor).toBeTruthy();
    expectPoint(anchor!, 60, 40);
  });

  it("does not hit-test a singular transform even inside its AABB", () => {
    const doc = scene([rect("flat", { ...defaultTransform(0, 0), scaleX: 0 })], ["flat"]);
    expect(hitTestTopNode(fakeHitCtx(), doc, 0, 10, 1)).toBeNull();
  });
});
