import type { SvgDocument, Transform2D } from "../document/types";
import {
  isDocumentBulkFilled,
  markDocumentBulkFilled,
  maxCachedNodesPerDocument,
  recallMatrix,
  rememberMatrix,
} from "./derivedCache";

export interface Mat2D {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export function identity(): Mat2D {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

export function multiply(m1: Mat2D, m2: Mat2D): Mat2D {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

export function transformToMatrix(t: Transform2D): Mat2D {
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const skewX = Math.tan((t.skewX * Math.PI) / 180);
  const skewY = Math.tan((t.skewY * Math.PI) / 180);
  let m = identity();
  m = multiply(m, { a: 1, b: 0, c: 0, d: 1, e: t.x, f: t.y });
  m = multiply(m, { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 });
  m = multiply(m, { a: t.scaleX, b: 0, c: 0, d: t.scaleY, e: 0, f: 0 });
  m = multiply(m, { a: 1, b: 0, c: skewX, d: 1, e: 0, f: 0 });
  m = multiply(m, { a: 1, b: skewY, c: 0, d: 1, e: 0, f: 0 });
  return m;
}

/** Uncached oracle: walk from the root until `targetId` is found. */
export function computeNodeWorldMatrix(doc: SvgDocument, targetId: string): Mat2D | null {
  const walk = (ids: string[], parentWorld: Mat2D, ancestors: Set<string>): Mat2D | null => {
    for (const id of ids) {
      const node = doc.nodes[id];
      if (!node || ancestors.has(id)) continue;
      const world = multiply(parentWorld, transformToMatrix(node.transform));
      if (id === targetId) return world;
      if (node.type === "group") {
        const nextAncestors = new Set(ancestors).add(id);
        const found = walk(node.children, world, nextAncestors);
        if (found) return found;
      }
    }
    return null;
  };
  const world = walk(doc.rootChildIds, identity(), new Set());
  if (world) return world;
  const unattached = doc.nodes[targetId];
  return unattached ? transformToMatrix(unattached.transform) : null;
}

/** Fill every node's world matrix in one traversal (same rules as the oracle). */
export function collectWorldMatrices(doc: SvgDocument): Map<string, Mat2D> {
  const out = new Map<string, Mat2D>();
  const walk = (ids: string[], parentWorld: Mat2D, ancestors: Set<string>) => {
    for (const id of ids) {
      const node = doc.nodes[id];
      if (!node || ancestors.has(id)) continue;
      const world = multiply(parentWorld, transformToMatrix(node.transform));
      out.set(id, world);
      if (node.type === "group") {
        const nextAncestors = new Set(ancestors).add(id);
        walk(node.children, world, nextAncestors);
      }
    }
  };
  walk(doc.rootChildIds, identity(), new Set());
  for (const id of Object.keys(doc.nodes)) {
    if (out.has(id)) continue;
    out.set(id, transformToMatrix(doc.nodes[id].transform));
  }
  return out;
}

function warmWorldMatrices(doc: SvgDocument): void {
  if (isDocumentBulkFilled(doc)) return;
  const nodeCount = Object.keys(doc.nodes).length;
  if (nodeCount === 0 || nodeCount > maxCachedNodesPerDocument()) {
    markDocumentBulkFilled(doc);
    return;
  }
  for (const [id, matrix] of collectWorldMatrices(doc)) {
    rememberMatrix(doc, id, matrix);
  }
  markDocumentBulkFilled(doc);
}

/**
 * World matrix for a node. Cached per immutable document snapshot; in-place
 * mutation of the same object requires `invalidateDerivedCache(doc)`.
 */
export function nodeWorldMatrix(doc: SvgDocument, targetId: string): Mat2D | null {
  const cached = recallMatrix(doc, targetId);
  if (cached) return cached;
  warmWorldMatrices(doc);
  const warmed = recallMatrix(doc, targetId);
  if (warmed) return warmed;
  const computed = computeNodeWorldMatrix(doc, targetId);
  if (computed) rememberMatrix(doc, targetId, computed);
  return computed;
}

export function applyMat(m: Mat2D, x: number, y: number): { x: number; y: number } {
  return {
    x: m.a * x + m.c * y + m.e,
    y: m.b * x + m.d * y + m.f,
  };
}

export function invertMat(m: Mat2D): Mat2D | null {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-12) return null;
  const id = 1 / det;
  return {
    a: m.d * id,
    b: -m.b * id,
    c: -m.c * id,
    d: m.a * id,
    e: (m.c * m.f - m.d * m.e) * id,
    f: (m.b * m.e - m.a * m.f) * id,
  };
}

export function screenToWorld(
  sx: number,
  sy: number,
  zoom: number,
  panX: number,
  panY: number,
): { x: number; y: number } {
  return { x: (sx - panX) / zoom, y: (sy - panY) / zoom };
}

export function worldToScreen(
  wx: number,
  wy: number,
  zoom: number,
  panX: number,
  panY: number,
): { x: number; y: number } {
  return { x: wx * zoom + panX, y: wy * zoom + panY };
}
