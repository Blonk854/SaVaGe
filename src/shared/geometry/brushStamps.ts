/** Place motif stamps along a polyline at roughly equal arc spacing. */
export interface PolyPoint {
  x: number;
  y: number;
}

export interface StampPlacement {
  x: number;
  y: number;
  angle: number; // radians
  scale: number;
}

export function polylineLength(points: PolyPoint[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return len;
}

/** Sample stamps along path every `spacing` units, oriented to tangent. */
export function patternStampsAlong(
  points: PolyPoint[],
  spacing: number,
): StampPlacement[] {
  if (points.length < 2 || spacing <= 0) return [];
  const out: StampPlacement[] = [];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const ax = points[i - 1].x;
    const ay = points[i - 1].y;
    const bx = points[i].x;
    const by = points[i].y;
    const seg = Math.hypot(bx - ax, by - ay);
    if (seg < 1e-6) continue;
    const angle = Math.atan2(by - ay, bx - ax);
    let d = spacing - carry;
    while (d <= seg) {
      const t = d / seg;
      out.push({
        x: ax + (bx - ax) * t,
        y: ay + (by - ay) * t,
        angle,
        scale: 1,
      });
      d += spacing;
    }
    carry = seg - (d - spacing);
  }
  return out;
}

export interface ScatterOptions {
  spacing: number;
  jitter: number;
  scaleMin: number;
  scaleMax: number;
  /** Deterministic RNG seed (0–1 style mulberry). */
  seed?: number;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Scatter stamps with positional jitter, rotation noise, and scale variation. */
export function scatterStampsAlong(
  points: PolyPoint[],
  opts: ScatterOptions,
): StampPlacement[] {
  const base = patternStampsAlong(points, opts.spacing);
  const rand = mulberry32(Math.floor((opts.seed ?? 0.42) * 1e9) || 1);
  return base.map((s) => {
    const j = opts.jitter;
    const nx = -Math.sin(s.angle);
    const ny = Math.cos(s.angle);
    const offset = (rand() * 2 - 1) * j;
    return {
      x: s.x + nx * offset,
      y: s.y + ny * offset,
      angle: s.angle + (rand() * 2 - 1) * 0.9,
      scale: opts.scaleMin + rand() * (opts.scaleMax - opts.scaleMin),
    };
  });
}
