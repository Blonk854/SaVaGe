import { invoke } from "@tauri-apps/api/core";
import { nanoid } from "nanoid";
import type { ShapeContours } from "../../shared/geometry/flatten";
import {
  defaultStroke,
  defaultTransform,
  solidFill,
  type PathNode,
  type PathSubpath,
  type SceneNode,
} from "../../shared/document/types";

export type BooleanOp = "union" | "intersect" | "subtract" | "exclude";

export type OverlayFn = (
  subjects: ShapeContours[],
  clips: ShapeContours[],
  op: BooleanOp,
) => Promise<ShapeContours[]>;

interface BooleanResult {
  shapes: number[][][][];
}

export const tauriOverlay: OverlayFn = async (subjects, clips, op) => {
  const result = await invoke<BooleanResult>("boolean_op", {
    request: { subjects, clips, op },
  });
  return result.shapes as ShapeContours[];
};

export function shapesToPathNode(
  shapes: ShapeContours[],
  name: string,
  styleSource?: SceneNode,
): PathNode {
  const subpaths: PathSubpath[] = [];
  for (const shape of shapes) {
    for (const contour of shape) {
      if (contour.length < 3) continue;
      subpaths.push({
        closed: true,
        points: contour.map(([x, y]) => ({
          id: nanoid(8),
          x,
          y,
          type: "corner" as const,
        })),
      });
    }
  }
  const node: PathNode = {
    id: nanoid(10),
    name,
    type: "path",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: defaultTransform(),
    subpaths,
    fill: solidFill("#B8FF3C", 0.85),
    stroke: defaultStroke("#0B0D10", 1),
    fillRule: "evenodd",
  };
  if (styleSource && "fill" in styleSource) {
    node.fill = structuredClone(styleSource.fill);
    node.stroke = structuredClone(styleSource.stroke);
  }
  return node;
}

export async function computeBooleanShapes(
  shapes: ShapeContours[],
  op: BooleanOp,
  overlay: OverlayFn = tauriOverlay,
): Promise<ShapeContours[]> {
  if (shapes.length < 2) return [];

  if (op === "subtract" || op === "union") {
    return overlay([shapes[0]], shapes.slice(1), op);
  }

  let resultShapes: ShapeContours[] = [shapes[0]];
  for (let i = 1; i < shapes.length; i++) {
    resultShapes = await overlay(resultShapes, [shapes[i]], op);
    if (!resultShapes.length) break;
  }
  return resultShapes;
}

/** Atomic face decomposition via incremental split (any number of flattenable shapes). */
export async function decomposeShapeRegions(
  shapes: ShapeContours[],
  overlay: OverlayFn = tauriOverlay,
): Promise<{ mask: number; contours: ShapeContours[] }[]> {
  const n = shapes.length;
  if (n < 2) return [];

  let regions: { mask: number; contours: ShapeContours[] }[] = [
    { mask: 1, contours: [shapes[0]] },
  ];

  for (let i = 1; i < n; i++) {
    const bit = 1 << i;
    const next: { mask: number; contours: ShapeContours[] }[] = [];
    for (const r of regions) {
      const inside = await overlay(r.contours, [shapes[i]], "intersect");
      const outside = await overlay(r.contours, [shapes[i]], "subtract");
      if (inside.length) next.push({ mask: r.mask | bit, contours: inside });
      if (outside.length) next.push({ mask: r.mask, contours: outside });
    }
    let leftover: ShapeContours[] = [shapes[i]];
    for (let j = 0; j < i; j++) {
      leftover = leftover.length ? await overlay(leftover, [shapes[j]], "subtract") : leftover;
      if (!leftover.length) break;
    }
    if (leftover.length) next.push({ mask: bit, contours: leftover });
    regions = next;
  }
  return regions;
}

/** Flatten multiple shape lists into one ShapeContours[] for path building. */
export function flattenShapeLists(lists: ShapeContours[][]): ShapeContours[] {
  return lists.flat();
}
