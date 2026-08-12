import type { PathSubpath } from "../document/types";

export function subpathsToPath2D(subpaths: PathSubpath[]): Path2D {
  const path = new Path2D();
  for (const sp of subpaths) {
    if (!sp.points.length) continue;
    const first = sp.points[0];
    path.moveTo(first.x, first.y);
    for (let i = 1; i < sp.points.length; i++) {
      const prev = sp.points[i - 1];
      const cur = sp.points[i];
      if (prev.handleOut || cur.handleIn) {
        const c1 = prev.handleOut ?? { x: prev.x, y: prev.y };
        const c2 = cur.handleIn ?? { x: cur.x, y: cur.y };
        path.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, cur.x, cur.y);
      } else {
        path.lineTo(cur.x, cur.y);
      }
    }
    if (sp.closed) {
      const last = sp.points[sp.points.length - 1];
      const firstPt = sp.points[0];
      if (last.handleOut || firstPt.handleIn) {
        const c1 = last.handleOut ?? { x: last.x, y: last.y };
        const c2 = firstPt.handleIn ?? { x: firstPt.x, y: firstPt.y };
        path.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, firstPt.x, firstPt.y);
      }
      path.closePath();
    }
  }
  return path;
}

export function pointInPath(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  x: number,
  y: number,
  fillRule: CanvasFillRule = "nonzero",
): boolean {
  return ctx.isPointInPath(path, x, y, fillRule);
}

export function pointInStroke(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  x: number,
  y: number,
): boolean {
  return ctx.isPointInStroke(path, x, y);
}

/** Ramer–Douglas–Peucker simplify for pencil tool */
export function simplifyPolyline(
  points: { x: number; y: number }[],
  epsilon: number,
): { x: number; y: number }[] {
  if (points.length < 3) return points;
  const sqEps = epsilon * epsilon;

  const distSq = (
    p: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) => {
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    if (dx === 0 && dy === 0) {
      dx = p.x - a.x;
      dy = p.y - a.y;
      return dx * dx + dy * dy;
    }
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
    const tt = Math.max(0, Math.min(1, t));
    const x = a.x + tt * dx;
    const y = a.y + tt * dy;
    const ex = p.x - x;
    const ey = p.y - y;
    return ex * ex + ey * ey;
  };

  const recurse = (start: number, end: number, out: boolean[]) => {
    let maxD = 0;
    let idx = 0;
    for (let i = start + 1; i < end; i++) {
      const d = distSq(points[i], points[start], points[end]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > sqEps) {
      out[idx] = true;
      recurse(start, idx, out);
      recurse(idx, end, out);
    }
  };

  const keep = points.map(() => false);
  keep[0] = true;
  keep[points.length - 1] = true;
  recurse(0, points.length - 1, keep);
  return points.filter((_, i) => keep[i]);
}
