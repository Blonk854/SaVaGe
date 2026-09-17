import type { SceneNode, SvgDocument, Transform2D } from "../document/types";
import { recallBounds, rememberBounds } from "./derivedCache";
import { applyMat, computeNodeWorldMatrix, nodeWorldMatrix, type Mat2D } from "./transform";

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function emptyBounds(): Bounds {
  return { x: 0, y: 0, w: 0, h: 0 };
}

export function unionBounds(a: Bounds, b: Bounds): Bounds {
  if (a.w <= 0 && a.h <= 0) return b;
  if (b.w <= 0 && b.h <= 0) return a;
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.w, b.x + b.w);
  const y2 = Math.max(a.y + a.h, b.y + b.h);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export function pointInBounds(b: Bounds, x: number, y: number, pad = 0): boolean {
  return x >= b.x - pad && y >= b.y - pad && x <= b.x + b.w + pad && y <= b.y + b.h + pad;
}

function localBounds(node: SceneNode): Bounds {
  switch (node.type) {
    case "rect":
      return { x: 0, y: 0, w: node.width, h: node.height };
    case "ellipse":
      return { x: -node.rx, y: -node.ry, w: node.rx * 2, h: node.ry * 2 };
    case "line":
      return {
        x: Math.min(0, node.x2),
        y: Math.min(0, node.y2),
        w: Math.abs(node.x2),
        h: Math.abs(node.y2),
      };
    case "text":
      return { x: 0, y: -node.fontSize, w: node.content.length * node.fontSize * 0.55, h: node.fontSize * node.lineHeight };
    case "image":
      return { x: 0, y: 0, w: node.width, h: node.height };
    case "symbolInstance":
      return { x: 0, y: 0, w: node.width, h: node.height };
    case "path": {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const sp of node.subpaths) {
        for (const p of sp.points) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
          if (p.handleIn) {
            minX = Math.min(minX, p.handleIn.x);
            minY = Math.min(minY, p.handleIn.y);
            maxX = Math.max(maxX, p.handleIn.x);
            maxY = Math.max(maxY, p.handleIn.y);
          }
          if (p.handleOut) {
            minX = Math.min(minX, p.handleOut.x);
            minY = Math.min(minY, p.handleOut.y);
            maxX = Math.max(maxX, p.handleOut.x);
            maxY = Math.max(maxY, p.handleOut.y);
          }
        }
      }
      if (!Number.isFinite(minX)) return emptyBounds();
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    case "group":
      return emptyBounds();
  }
}

function worldAabbFromLocal(lb: Bounds, m: Mat2D): Bounds {
  const corners = [
    applyMat(m, lb.x, lb.y),
    applyMat(m, lb.x + lb.w, lb.y),
    applyMat(m, lb.x + lb.w, lb.y + lb.h),
    applyMat(m, lb.x, lb.y + lb.h),
  ];
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

function leafWorldBounds(node: SceneNode, matrix: Mat2D | null): Bounds {
  if (!matrix) return emptyBounds();
  return worldAabbFromLocal(localBounds(node), matrix);
}

/** Uncached oracle: world AABB from ancestor matrices and local geometry. */
export function computeNodeWorldBounds(doc: SvgDocument, id: string): Bounds {
  const node = doc.nodes[id];
  if (!node) return emptyBounds();
  if (node.type === "group") {
    let b = emptyBounds();
    for (const cid of node.children) {
      b = unionBounds(b, computeNodeWorldBounds(doc, cid));
    }
    return b;
  }
  return leafWorldBounds(node, computeNodeWorldMatrix(doc, id));
}

/**
 * World AABB for a node. Cached per immutable document snapshot; in-place
 * mutation of the same object requires `invalidateDerivedCache(doc)`.
 */
export function nodeWorldBounds(doc: SvgDocument, id: string): Bounds {
  const cached = recallBounds(doc, id);
  if (cached) return cached;
  const node = doc.nodes[id];
  if (!node) return emptyBounds();
  let bounds: Bounds;
  if (node.type === "group") {
    bounds = emptyBounds();
    for (const cid of node.children) {
      bounds = unionBounds(bounds, nodeWorldBounds(doc, cid));
    }
  } else {
    bounds = leafWorldBounds(node, nodeWorldMatrix(doc, id));
  }
  rememberBounds(doc, id, bounds);
  return bounds;
}

/** Scale a node's transform so its world bounds match the given width/height. */
export function transformForWorldSize(
  transform: Transform2D,
  bounds: Bounds,
  width: number,
  height: number,
): Transform2D {
  const w = Math.max(0.01, width);
  const h = Math.max(0.01, height);
  return {
    ...transform,
    scaleX: bounds.w > 1e-6 ? (w / bounds.w) * transform.scaleX : transform.scaleX,
    scaleY: bounds.h > 1e-6 ? (h / bounds.h) * transform.scaleY : transform.scaleY,
  };
}

export function selectionBounds(doc: SvgDocument, ids: string[]): Bounds {
  let b = emptyBounds();
  for (const id of ids) b = unionBounds(b, nodeWorldBounds(doc, id));
  return b;
}
