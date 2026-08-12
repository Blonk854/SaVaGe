import type {
  MeshGradientPaint,
  NodeEffects,
  PathNode,
  StrokeStyle,
} from "../../../shared/document/types";
import { paintCanvasStyle } from "../../../shared/document/paint";
import { meshPattern } from "../../../shared/document/meshPaint";
import { subpathsToPath2D } from "../../../shared/geometry/path";
import {
  hasVariableWidths,
  ribbonOutline,
  samplesFromPolyline,
} from "../../../shared/geometry/ribbon";
import type { Mat2D } from "../../../shared/geometry/transform";

export function applyStrokeStyle(ctx: CanvasRenderingContext2D, stroke: StrokeStyle) {
  ctx.lineWidth = stroke.width;
  ctx.lineCap = stroke.lineCap;
  ctx.lineJoin = stroke.lineJoin;
  ctx.miterLimit = stroke.miterLimit;
  if (stroke.dashArray.length) ctx.setLineDash(stroke.dashArray);
  else ctx.setLineDash([]);
  ctx.lineDashOffset = stroke.dashOffset;
}

export function applyNodeEffects(ctx: CanvasRenderingContext2D, effects?: NodeEffects) {
  if (!effects) return;
  const filters: string[] = [];
  if (effects.shadow?.enabled) {
    const s = effects.shadow;
    ctx.shadowOffsetX = s.x;
    ctx.shadowOffsetY = s.y;
    ctx.shadowBlur = s.blur;
    ctx.shadowColor =
      s.opacity < 1
        ? `rgba(0,0,0,${s.opacity})`
        : s.color;
    if (s.color.startsWith("#") && s.opacity < 1) {
      const hex = s.color;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      ctx.shadowColor = `rgba(${r},${g},${b},${s.opacity})`;
    }
  }
  if (effects.blur > 0) {
    filters.push(`blur(${effects.blur}px)`);
  }
  if (filters.length) {
    (ctx as CanvasRenderingContext2D & { filter?: string }).filter = filters.join(" ");
  }
}

function fillMesh(
  ctx: CanvasRenderingContext2D,
  paint: MeshGradientPaint,
  path: Path2D,
  fillRule: CanvasFillRule,
) {
  const pattern = meshPattern(ctx, paint);
  if (!pattern) return;
  ctx.fillStyle = pattern;
  ctx.fill(path, fillRule);
}

function strokeVariableWidth(ctx: CanvasRenderingContext2D, node: PathNode) {
  for (const sp of node.subpaths) {
    if (sp.points.length < 2) continue;
    const widths = sp.points.map((p) => p.strokeWidth);
    const samples = samplesFromPolyline(sp.points, widths, node.stroke.width);
    const outline = ribbonOutline(samples);
    if (outline.length < 3) continue;
    const path = new Path2D();
    path.moveTo(outline[0].x, outline[0].y);
    for (let i = 1; i < outline.length; i++) path.lineTo(outline[i].x, outline[i].y);
    path.closePath();
    if (paintCanvasStyle(ctx, node.stroke.paint, "fill")) {
      ctx.fill(path);
    }
  }
}

export function drawPathNode(ctx: CanvasRenderingContext2D, node: PathNode, mat: Mat2D) {
  const path = subpathsToPath2D(node.subpaths);
  ctx.save();
  ctx.transform(mat.a, mat.b, mat.c, mat.d, mat.e, mat.f);
  ctx.globalAlpha *= node.opacity;
  applyNodeEffects(ctx, node.effects);

  if (node.fill.type === "mesh") {
    fillMesh(ctx, node.fill, path, node.fillRule);
  } else if (paintCanvasStyle(ctx, node.fill, "fill")) {
    ctx.fill(path, node.fillRule);
  }

  ctx.shadowColor = "transparent";

  const variable = node.subpaths.some((sp) =>
    hasVariableWidths(
      sp.points.map((p) => p.strokeWidth),
      node.stroke.width,
    ),
  );

  if (variable) {
    strokeVariableWidth(ctx, node);
  } else if (paintCanvasStyle(ctx, node.stroke.paint, "stroke")) {
    applyStrokeStyle(ctx, node.stroke);
    ctx.stroke(path);
  }
  ctx.restore();
}
