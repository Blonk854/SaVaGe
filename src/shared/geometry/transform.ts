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

function matricesClose(left: Mat2D, right: Mat2D, epsilon = 1e-6): boolean {
  return (
    Math.abs(left.a - right.a) <= epsilon &&
    Math.abs(left.b - right.b) <= epsilon &&
    Math.abs(left.c - right.c) <= epsilon &&
    Math.abs(left.d - right.d) <= epsilon &&
    Math.abs(left.e - right.e) <= epsilon &&
    Math.abs(left.f - right.f) <= epsilon
  );
}

/**
 * Recover the version-1 decomposed fields from a matrix. The linear part is
 * written as rotate * scale * skewX (skewY is folded into those terms).
 * Returns null when reconstruction would silently drop shear or scale.
 */
export function matrixToTransform(m: Mat2D): Transform2D | null {
  const col1 = Math.hypot(m.a, m.b);
  let cos: number;
  let sin: number;
  let scaleX: number;
  let scaleY: number;
  let skewX: number;

  if (col1 >= 1e-12) {
    cos = m.a / col1;
    sin = m.b / col1;
    scaleX = col1;
    const u12 = cos * m.c + sin * m.d;
    const u22 = -sin * m.c + cos * m.d;
    scaleY = u22;
    skewX = (Math.atan(u12 / scaleX) * 180) / Math.PI;
  } else {
    const col2 = Math.hypot(m.c, m.d);
    if (col2 < 1e-12) {
      const zero: Transform2D = {
        x: m.e,
        y: m.f,
        rotation: 0,
        scaleX: 0,
        scaleY: 0,
        skewX: 0,
        skewY: 0,
      };
      return matricesClose(transformToMatrix(zero), m) ? zero : null;
    }
    // First column vanished: rotation comes from the second axis.
    cos = m.d / col2;
    sin = -m.c / col2;
    scaleX = 0;
    scaleY = col2;
    skewX = 0;
  }

  const next: Transform2D = {
    x: m.e,
    y: m.f,
    rotation: (Math.atan2(sin, cos) * 180) / Math.PI,
    scaleX,
    scaleY,
    skewX,
    skewY: 0,
  };
  return matricesClose(transformToMatrix(next), m) ? next : null;
}

/** Local Transform2D so `parentWorld * local` equals `world`. */
export function transformForNewParent(world: Mat2D, parentWorld: Mat2D): Transform2D | null {
  const inverse = invertMat(parentWorld);
  if (!inverse) return null;
  return matrixToTransform(multiply(inverse, world));
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
