import type { SvgDocument } from "../document/types";
import {
  snapToPerspective,
  type PerspectiveGrid,
} from "./perspective";
import { nodeWorldBounds } from "./bounds";
import { applyMat, transformToMatrix } from "./transform";

export const SNAP_GRID = 32;

export interface SnapContext {
  zoom: number;
  showGrid: boolean;
  perspective: PerspectiveGrid;
  doc: SvgDocument;
}

function consider(
  best: { x: number; y: number; d: number },
  px: number,
  py: number,
  x: number,
  y: number,
) {
  const d = Math.hypot(x - px, y - py);
  if (d < best.d) {
    best.x = px;
    best.y = py;
    best.d = d;
  }
}

function addBoundsPoints(
  pts: { x: number; y: number }[],
  x: number,
  y: number,
  w: number,
  h: number,
) {
  pts.push(
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
    { x: x + w / 2, y },
    { x: x + w / 2, y: y + h },
    { x, y: y + h / 2 },
    { x: x + w, y: y + h / 2 },
    { x: x + w / 2, y: y + h / 2 },
  );
}

export function collectSnapPoints(doc: SvgDocument, limit = 2500): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const boards = doc.artboards?.length
    ? doc.artboards
    : [
        {
          x: doc.viewBox.x,
          y: doc.viewBox.y,
          width: doc.viewBox.w,
          height: doc.viewBox.h,
        },
      ];
  for (const b of boards) {
    addBoundsPoints(pts, b.x, b.y, b.width, b.height);
  }

  for (const id of Object.keys(doc.nodes)) {
    if (pts.length >= limit) break;
    const node = doc.nodes[id];
    if (!node?.visible) continue;
    const b = nodeWorldBounds(doc, id);
    if (b.w > 0 || b.h > 0) addBoundsPoints(pts, b.x, b.y, b.w, b.h);
    if (node.type === "path") {
      const m = transformToMatrix(node.transform);
      for (const sp of node.subpaths) {
        for (const p of sp.points) {
          pts.push(applyMat(m, p.x, p.y));
          if (pts.length >= limit) return pts;
        }
      }
    }
  }
  return pts;
}

/**
 * Snap a world point to nearby geometry, the document grid, and perspective rays.
 * Threshold scales with zoom (screen pixels).
 */
export function snapWorldPoint(
  x: number,
  y: number,
  ctx: SnapContext,
  screenPx = 16,
): { x: number; y: number } {
  const threshold = screenPx / Math.max(ctx.zoom, 0.05);
  const best = { x, y, d: threshold };

  if (ctx.showGrid) {
    const gx = Math.round(x / SNAP_GRID) * SNAP_GRID;
    const gy = Math.round(y / SNAP_GRID) * SNAP_GRID;
    consider(best, gx, gy, x, y);
    consider(best, gx, y, x, y);
    consider(best, x, gy, x, y);
  }

  for (const p of collectSnapPoints(ctx.doc)) {
    consider(best, p.x, p.y, x, y);
  }

  if (ctx.perspective.mode !== "off") {
    const persp = snapToPerspective(x, y, ctx.perspective, threshold);
    if (persp.x !== x || persp.y !== y) consider(best, persp.x, persp.y, x, y);
  }

  return { x: best.x, y: best.y };
}
