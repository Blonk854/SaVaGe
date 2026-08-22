import { describe, expect, it } from "vitest";
import type { ShapeContours } from "../../shared/geometry/flatten";
import {
  computeBooleanShapes,
  decomposeShapeRegions,
  shapesToPathNode,
  type OverlayFn,
} from "./booleanCore";
import { toggleRegionAtPoint, type ShapeBuilderRegion } from "./shapeBuilderTool";

type Box = { minX: number; minY: number; maxX: number; maxY: number };

function boxOf(shape: ShapeContours): Box {
  const xs = shape.flatMap((c) => c.map((p) => p[0]));
  const ys = shape.flatMap((c) => c.map((p) => p[1]));
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function shapeFromBox(b: Box): ShapeContours {
  return [
    [
      [b.minX, b.minY],
      [b.maxX, b.minY],
      [b.maxX, b.maxY],
      [b.minX, b.maxY],
    ],
  ];
}

/** Tiny AABB boolean for tests (axis-aligned rect contours only). */
const aabbOverlay: OverlayFn = async (subjects, clips, op) => {
  const A = subjects[0] ? boxOf(subjects[0]) : null;
  const B = clips[0] ? boxOf(clips[0]) : null;
  if (!A) return [];
  if (!B) return [shapeFromBox(A)];

  const ix: Box = {
    minX: Math.max(A.minX, B.minX),
    minY: Math.max(A.minY, B.minY),
    maxX: Math.min(A.maxX, B.maxX),
    maxY: Math.min(A.maxY, B.maxY),
  };
  const overlaps = ix.minX < ix.maxX && ix.minY < ix.maxY;

  if (op === "intersect") return overlaps ? [shapeFromBox(ix)] : [];
  if (op === "union") {
    if (!overlaps) return [shapeFromBox(A), shapeFromBox(B)];
    return [
      shapeFromBox({
        minX: Math.min(A.minX, B.minX),
        minY: Math.min(A.minY, B.minY),
        maxX: Math.max(A.maxX, B.maxX),
        maxY: Math.max(A.maxY, B.maxY),
      }),
    ];
  }
  if (op === "subtract") {
    if (!overlaps) return [shapeFromBox(A)];
    if (ix.minX > A.minX) {
      return [
        shapeFromBox({
          minX: A.minX,
          minY: A.minY,
          maxX: ix.minX,
          maxY: A.maxY,
        }),
      ];
    }
    return [shapeFromBox(A)];
  }
  if (!overlaps) return [shapeFromBox(A), shapeFromBox(B)];
  return [shapeFromBox(A), shapeFromBox(B)];
};

function rect(x: number, y: number, w: number, h: number): ShapeContours {
  return shapeFromBox({ minX: x, minY: y, maxX: x + w, maxY: y + h });
}

describe("booleanCore", () => {
  it("computes intersect of overlapping rects", async () => {
    const result = await computeBooleanShapes(
      [rect(0, 0, 10, 10), rect(5, 5, 10, 10)],
      "intersect",
      aabbOverlay,
    );
    expect(result.length).toBeGreaterThan(0);
    const xs = result[0][0].map((p) => p[0]);
    expect(Math.min(...xs)).toBe(5);
    expect(Math.max(...xs)).toBe(10);
  });

  it("builds a path node from contours", () => {
    const node = shapesToPathNode([rect(0, 0, 20, 10)], "Test");
    expect(node.type).toBe("path");
    expect(node.subpaths[0].closed).toBe(true);
    expect(node.subpaths[0].points).toHaveLength(4);
  });

  it("decomposes two overlapping rects into regions", async () => {
    const regions = await decomposeShapeRegions(
      [rect(0, 0, 10, 10), rect(5, 0, 10, 10)],
      aabbOverlay,
    );
    expect(regions.length).toBeGreaterThan(0);
    expect(regions.some((r) => r.mask === 3)).toBe(true);
  });

  it("decomposes more than four overlapping shapes", async () => {
    const regions = await decomposeShapeRegions(
      [
        rect(0, 0, 10, 10),
        rect(5, 0, 10, 10),
        rect(10, 0, 10, 10),
        rect(15, 0, 10, 10),
        rect(20, 0, 10, 10),
      ],
      aabbOverlay,
    );
    expect(regions.length).toBeGreaterThan(0);
    expect(regions.some((r) => r.mask & (1 << 4))).toBe(true);
  });
});

describe("shapeBuilder toggle", () => {
  it("toggles keep flag for hit region", () => {
    const regions: ShapeBuilderRegion[] = [
      {
        id: "a",
        mask: 1,
        kept: true,
        contours: [rect(0, 0, 10, 10)],
      },
      {
        id: "b",
        mask: 2,
        kept: true,
        contours: [rect(20, 0, 10, 10)],
      },
    ];
    const next = toggleRegionAtPoint(regions, 5, 5);
    expect(next[0].kept).toBe(false);
    expect(next[1].kept).toBe(true);
  });
});
