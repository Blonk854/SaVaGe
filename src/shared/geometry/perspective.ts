/** 1-point and 2-point perspective helpers. */

export interface PerspectiveGrid {
  mode: "off" | "1point" | "2point";
  /** Horizon Y in document space */
  horizonY: number;
  /** Vanishing point(s) in document space */
  vp1: { x: number; y: number };
  vp2: { x: number; y: number };
  /** Ground plane Y (bottom of grid fan) */
  groundY: number;
  /** Number of rays from each VP */
  rays: number;
}

export function defaultPerspectiveGrid(
  viewBox = { x: 0, y: 0, w: 800, h: 600 },
): PerspectiveGrid {
  return {
    mode: "off",
    horizonY: viewBox.y + viewBox.h * 0.4,
    vp1: { x: viewBox.x + viewBox.w * 0.5, y: viewBox.y + viewBox.h * 0.4 },
    vp2: { x: viewBox.x + viewBox.w * 0.85, y: viewBox.y + viewBox.h * 0.4 },
    groundY: viewBox.y + viewBox.h * 0.95,
    rays: 12,
  };
}

export interface PerspectiveRay {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Build guide rays for drawing. */
export function perspectiveRays(grid: PerspectiveGrid): PerspectiveRay[] {
  if (grid.mode === "off") return [];
  const rays: PerspectiveRay[] = [];
  const span = Math.abs(grid.groundY - grid.horizonY) || 1;
  const half = grid.rays / 2;

  const addFan = (vp: { x: number; y: number }, leftBias: number) => {
    for (let i = -half; i <= half; i++) {
      const t = i / Math.max(1, half);
      const gx = vp.x + t * span * 1.8 + leftBias;
      rays.push({
        x1: vp.x,
        y1: vp.y,
        x2: gx,
        y2: grid.groundY,
      });
    }
  };

  // Horizon line
  rays.push({
    x1: grid.vp1.x - 2000,
    y1: grid.horizonY,
    x2: grid.vp1.x + 2000,
    y2: grid.horizonY,
  });

  if (grid.mode === "1point") {
    addFan(grid.vp1, 0);
  } else {
    addFan(grid.vp1, -span * 0.3);
    addFan(grid.vp2, span * 0.3);
  }
  return rays;
}

/**
 * Snap a world point toward the nearest perspective ray (projection onto segment).
 * Returns original point if mode is off or distance > threshold.
 */
export function snapToPerspective(
  x: number,
  y: number,
  grid: PerspectiveGrid,
  threshold = 18,
): { x: number; y: number } {
  if (grid.mode === "off") return { x, y };
  const rays = perspectiveRays(grid);
  let best = { x, y, d: threshold };
  for (const r of rays) {
    const dx = r.x2 - r.x1;
    const dy = r.y2 - r.y1;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((x - r.x1) * dx + (y - r.y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = r.x1 + t * dx;
    const py = r.y1 + t * dy;
    const d = Math.hypot(x - px, y - py);
    if (d < best.d) best = { x: px, y: py, d };
  }
  return { x: best.x, y: best.y };
}
