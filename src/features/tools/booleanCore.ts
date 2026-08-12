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

/** Atomic face decomposition for up to 4 shapes (subset inclusion masks). */
export async function decomposeShapeRegions(
  shapes: ShapeContours[],
  overlay: OverlayFn = tauriOverlay,
): Promise<{ mask: number; contours: ShapeContours[] }[]> {
  const n = Math.min(shapes.length, 4);
  const regions: { mask: number; contours: ShapeContours[] }[] = [];
  if (n < 2) return regions;

  for (let mask = 1; mask < 1 << n; mask++) {
    const bits: number[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) bits.push(i);

    let result: ShapeContours[] = [shapes[bits[0]]];
    for (let k = 1; k < bits.length; k++) {
      result = await overlay(result, [shapes[bits[k]]], "intersect");
      if (!result.length) break;
    }
    if (!result.length) continue;

    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) continue;
      result = await overlay(result, [shapes[i]], "subtract");
      if (!result.length) break;
    }
    if (result.length) regions.push({ mask, contours: result });
  }
  return regions;
}

/** Flatten multiple shape lists into one ShapeContours[] for path building. */
export function flattenShapeLists(lists: ShapeContours[][]): ShapeContours[] {
  return lists.flat();
}
