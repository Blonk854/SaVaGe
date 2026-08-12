import type { MeshGradientPaint } from "./types";
import { rasterizeMesh } from "../geometry/mesh";

const cache = new WeakMap<MeshGradientPaint, CanvasPattern | null>();

export function meshPattern(
  ctx: CanvasRenderingContext2D,
  paint: MeshGradientPaint,
): CanvasPattern | null {
  const hit = cache.get(paint);
  if (hit !== undefined) return hit;

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of paint.points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const w = Math.max(1, Math.ceil(maxX - minX) + 2);
  const h = Math.max(1, Math.ceil(maxY - minY) + 2);
  const data = rasterizeMesh(paint, w, h, minX, minY);
  if (!data) {
    cache.set(paint, null);
    return null;
  }

  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const octx = off.getContext("2d");
  if (!octx) {
    cache.set(paint, null);
    return null;
  }
  octx.putImageData(new ImageData(data, w, h), 0, 0);
  const pattern = ctx.createPattern(off, "no-repeat");
  if (pattern && "setTransform" in pattern) {
    pattern.setTransform(new DOMMatrix().translateSelf(minX, minY));
  }
  cache.set(paint, pattern);
  return pattern;
}

export function invalidateMeshCache(paint: MeshGradientPaint) {
  cache.delete(paint);
}
