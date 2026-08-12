import type { Paint } from "./types";

export function paintCanvasStyle(
  ctx: CanvasRenderingContext2D,
  paint: Paint,
  kind: "fill" | "stroke",
): boolean {
  if (paint.type === "none") return false;
  if (paint.type === "solid") {
    ctx.globalAlpha *= paint.opacity;
    if (kind === "fill") ctx.fillStyle = paint.color;
    else ctx.strokeStyle = paint.color;
    return true;
  }
  if (paint.type === "linear") {
    const g = ctx.createLinearGradient(paint.x1, paint.y1, paint.x2, paint.y2);
    for (const s of paint.stops) {
      g.addColorStop(s.offset, withAlpha(s.color, s.opacity));
    }
    if (kind === "fill") ctx.fillStyle = g;
    else ctx.strokeStyle = g;
    return true;
  }
  if (paint.type === "radial") {
    const fx = paint.fx ?? paint.cx;
    const fy = paint.fy ?? paint.cy;
    const g = ctx.createRadialGradient(fx, fy, 0, paint.cx, paint.cy, Math.max(paint.r, 0.01));
    for (const s of paint.stops) {
      g.addColorStop(s.offset, withAlpha(s.color, s.opacity));
    }
    if (kind === "fill") ctx.fillStyle = g;
    else ctx.strokeStyle = g;
    return true;
  }
  // Mesh fills are handled by drawPath (pattern); strokes fall back to first vertex color
  if (paint.type === "mesh") {
    if (kind === "stroke") {
      ctx.strokeStyle = paint.points[0]?.color ?? "#B8FF3C";
      return true;
    }
    return false;
  }
  return false;
}

function withAlpha(color: string, opacity: number): string {
  if (opacity >= 1) return color;
  if (color.startsWith("#") && (color.length === 7 || color.length === 4)) {
    const hex =
      color.length === 4
        ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
        : color;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${opacity})`;
  }
  return color;
}

export function primaryColor(paint: Paint): string {
  if (paint.type === "solid") return paint.color;
  if (paint.type === "linear" || paint.type === "radial") {
    return paint.stops[0]?.color ?? "#B8FF3C";
  }
  if (paint.type === "mesh") return paint.points[0]?.color ?? "#B8FF3C";
  return "#000000";
}
