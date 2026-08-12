export interface RibbonSample {
  x: number;
  y: number;
  width: number;
}

/** Build a closed outline around a centerline with per-sample half-widths. */
export function ribbonOutline(samples: RibbonSample[]): { x: number; y: number }[] {
  if (samples.length < 2) return [];
  const left: { x: number; y: number }[] = [];
  const right: { x: number; y: number }[] = [];

  for (let i = 0; i < samples.length; i++) {
    const prev = samples[Math.max(0, i - 1)];
    const next = samples[Math.min(samples.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const hw = Math.max(0.25, samples[i].width / 2);
    const nx = (-dy / len) * hw;
    const ny = (dx / len) * hw;
    left.push({ x: samples[i].x + nx, y: samples[i].y + ny });
    right.push({ x: samples[i].x - nx, y: samples[i].y - ny });
  }

  return [...left, ...right.reverse()];
}

/** Sample widths along a polyline; missing widths fall back to `defaultWidth`. */
export function samplesFromPolyline(
  points: { x: number; y: number }[],
  widths: (number | undefined)[] | undefined,
  defaultWidth: number,
): RibbonSample[] {
  return points.map((p, i) => ({
    x: p.x,
    y: p.y,
    width: widths?.[i] ?? defaultWidth,
  }));
}

export function hasVariableWidths(
  widths: (number | undefined)[] | undefined,
  defaultWidth: number,
): boolean {
  if (!widths?.length) return false;
  return widths.some((w) => w != null && Math.abs(w - defaultWidth) > 1e-3);
}
