import type { PathPoint, SceneNode, SvgDocument } from "../document/types";
import { applyMat, transformToMatrix } from "./transform";

export type Contour = [number, number][];
export type ShapeContours = Contour[];

function sampleCubic(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  steps = 8,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const x =
      u * u * u * p0.x +
      3 * u * u * t * p1.x +
      3 * u * t * t * p2.x +
      t * t * t * p3.x;
    const y =
      u * u * u * p0.y +
      3 * u * u * t * p1.y +
      3 * u * t * t * p2.y +
      t * t * t * p3.y;
    out.push({ x, y });
  }
  return out;
}

function pathPointsToContour(points: PathPoint[], closed: boolean): Contour {
  if (!points.length) return [];
  const samples: { x: number; y: number }[] = [{ x: points[0].x, y: points[0].y }];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    if (prev.handleOut || cur.handleIn) {
      const c1 = prev.handleOut ?? { x: prev.x, y: prev.y };
      const c2 = cur.handleIn ?? { x: cur.x, y: cur.y };
      samples.push(...sampleCubic(prev, c1, c2, cur));
    } else {
      samples.push({ x: cur.x, y: cur.y });
    }
  }
  if (closed && points.length > 2) {
    const last = points[points.length - 1];
    const first = points[0];
    if (last.handleOut || first.handleIn) {
      const c1 = last.handleOut ?? { x: last.x, y: last.y };
      const c2 = first.handleIn ?? { x: first.x, y: first.y };
      samples.push(...sampleCubic(last, c1, c2, first));
    }
  }
  return samples.map((p) => [p.x, p.y] as [number, number]);
}

function toWorld(contour: Contour, node: SceneNode): Contour {
  const m = transformToMatrix(node.transform);
  return contour.map(([x, y]) => {
    const p = applyMat(m, x, y);
    return [p.x, p.y] as [number, number];
  });
}

/** Flatten a scene node into polygon contours in world space (for boolean ops). */
export function flattenNodeToShape(doc: SvgDocument, id: string): ShapeContours | null {
  const node = doc.nodes[id];
  if (!node || !node.visible) return null;

  if (node.type === "group") {
    const shapes: ShapeContours = [];
    for (const cid of node.children) {
      const child = flattenNodeToShape(doc, cid);
      if (child) shapes.push(...child);
    }
    return shapes.length ? shapes : null;
  }

  if (node.type === "rect") {
    const c: Contour = [
      [0, 0],
      [node.width, 0],
      [node.width, node.height],
      [0, node.height],
    ];
    return [toWorld(c, node)];
  }

  if (node.type === "ellipse") {
    const steps = 32;
    const c: Contour = [];
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      c.push([Math.cos(a) * node.rx, Math.sin(a) * node.ry]);
    }
    return [toWorld(c, node)];
  }

  if (node.type === "path") {
    const contours: ShapeContours = [];
    for (const sp of node.subpaths) {
      if (sp.points.length < 3) continue;
      // Open paths aren't valid boolean fills unless nearly closed
      const closed =
        sp.closed ||
        Math.hypot(
          sp.points[0].x - sp.points[sp.points.length - 1].x,
          sp.points[0].y - sp.points[sp.points.length - 1].y,
        ) < 0.5;
      if (!closed) continue;
      const local = pathPointsToContour(sp.points, true);
      if (local.length >= 3) contours.push(toWorld(local, node));
    }
    return contours.length ? contours : null;
  }

  return null;
}
