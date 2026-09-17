import type {
  MeshGradientPaint,
  Paint,
  SceneNode,
  StrokeStyle,
  SvgDocument,
} from "../../../shared/document/types";
import { paintCanvasStyle } from "../../../shared/document/paint";
import { meshPattern } from "../../../shared/document/meshPaint";
import { subpathsToPath2D } from "../../../shared/geometry/path";
import { transformToMatrix, type Mat2D } from "../../../shared/geometry/transform";
import { applyNodeEffects, applyStrokeStyle, drawPathNode } from "./drawPath";
import { getShapeBuilderSession } from "../../tools/shapeBuilderTool";
import type { BooleanPreviewState } from "../../../shared/stores/uiStore";
import {
  perspectiveRays,
  type PerspectiveGrid,
} from "../../../shared/geometry/perspective";

function buildClipPath(doc: SvgDocument, clipId: string): Path2D | null {
  const mask = doc.nodes[clipId];
  if (!mask) return null;
  const path = new Path2D();
  const m = transformToMatrix(mask.transform);
  const local = new Path2D();
  if (mask.type === "path") {
    const p = subpathsToPath2D(mask.subpaths);
    local.addPath(p);
  } else if (mask.type === "rect") {
    local.rect(0, 0, mask.width, mask.height);
  } else if (mask.type === "ellipse") {
    local.ellipse(0, 0, Math.max(mask.rx, 0.01), Math.max(mask.ry, 0.01), 0, 0, Math.PI * 2);
  } else {
    return null;
  }
  path.addPath(local, {
    a: m.a,
    b: m.b,
    c: m.c,
    d: m.d,
    e: m.e,
    f: m.f,
  } as DOMMatrix2DInit);
  return path;
}

function withClip(
  ctx: CanvasRenderingContext2D,
  doc: SvgDocument,
  node: SceneNode,
  draw: () => void,
) {
  if (!node.clipPathId) {
    draw();
    return;
  }
  const clip = buildClipPath(doc, node.clipPathId);
  if (!clip) {
    draw();
    return;
  }
  ctx.save();
  ctx.clip(clip);
  draw();
  ctx.restore();
}

function drawNode(ctx: CanvasRenderingContext2D, doc: SvgDocument, id: string) {
  const node = doc.nodes[id];
  if (!node || !node.visible) return;
  const mat = transformToMatrix(node.transform);

  const paint = () => {
    switch (node.type) {
      case "group": {
        ctx.save();
        ctx.transform(mat.a, mat.b, mat.c, mat.d, mat.e, mat.f);
        ctx.globalAlpha *= node.opacity;
        for (const cid of node.children) drawNode(ctx, doc, cid);
        ctx.restore();
        break;
      }
      case "path":
        drawPathNode(ctx, node, mat);
        break;
      case "rect":
        drawShape(ctx, node, mat, (p) => {
          p.rect(0, 0, node.width, node.height);
        });
        break;
      case "ellipse":
        drawShape(ctx, node, mat, (p) => {
          p.ellipse(0, 0, Math.max(node.rx, 0.01), Math.max(node.ry, 0.01), 0, 0, Math.PI * 2);
        });
        break;
      case "line": {
        ctx.save();
        ctx.transform(mat.a, mat.b, mat.c, mat.d, mat.e, mat.f);
        ctx.globalAlpha *= node.opacity;
        applyNodeEffects(ctx, node.effects);
        if (paintCanvasStyle(ctx, node.stroke.paint, "stroke")) {
          applyStrokeStyle(ctx, node.stroke);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(node.x2, node.y2);
          ctx.stroke();
        }
        ctx.restore();
        break;
      }
      case "text": {
        ctx.save();
        ctx.transform(mat.a, mat.b, mat.c, mat.d, mat.e, mat.f);
        ctx.globalAlpha *= node.opacity;
        applyNodeEffects(ctx, node.effects);
        ctx.font = `${node.fontWeight} ${node.fontSize}px ${node.fontFamily}`;
        ctx.textBaseline = "alphabetic";
        if (paintCanvasStyle(ctx, node.fill, "fill")) {
          ctx.fillText(node.content, 0, 0);
        }
        ctx.shadowColor = "transparent";
        if (paintCanvasStyle(ctx, node.stroke.paint, "stroke") && node.stroke.width > 0) {
          applyStrokeStyle(ctx, node.stroke);
          ctx.strokeText(node.content, 0, 0);
        }
        ctx.restore();
        break;
      }
      case "image": {
        ctx.save();
        ctx.transform(mat.a, mat.b, mat.c, mat.d, mat.e, mat.f);
        ctx.globalAlpha *= node.opacity;
        ctx.fillStyle = "#334155";
        ctx.fillRect(0, 0, node.width, node.height);
        ctx.restore();
        break;
      }
      case "symbolInstance": {
        const symbol = doc.symbols?.[node.symbolId];
        ctx.save();
        ctx.transform(mat.a, mat.b, mat.c, mat.d, mat.e, mat.f);
        ctx.globalAlpha *= node.opacity;
        applyNodeEffects(ctx, node.effects);
        if (symbol) {
          const mini: SvgDocument = {
            ...doc,
            rootChildIds: symbol.rootChildIds,
            nodes: symbol.nodes,
          };
          for (const cid of symbol.rootChildIds) drawNode(ctx, mini, cid);
        } else {
          ctx.strokeStyle = "rgba(184,255,60,0.5)";
          ctx.strokeRect(0, 0, node.width, node.height);
        }
        ctx.restore();
        break;
      }
    }
  };

  withClip(ctx, doc, node, paint);
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  node: {
    fill: Paint;
    stroke: StrokeStyle;
    opacity: number;
    effects?: SceneNode["effects"];
  },
  mat: Mat2D,
  build: (p: Path2D) => void,
) {
  const path = new Path2D();
  build(path);
  ctx.save();
  ctx.transform(mat.a, mat.b, mat.c, mat.d, mat.e, mat.f);
  ctx.globalAlpha *= node.opacity;
  applyNodeEffects(ctx, node.effects);
  if (node.fill.type === "mesh") {
    const pattern = meshPattern(ctx, node.fill as MeshGradientPaint);
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fill(path);
    }
  } else if (paintCanvasStyle(ctx, node.fill, "fill")) {
    ctx.fill(path);
  }
  ctx.shadowColor = "transparent";
  if (paintCanvasStyle(ctx, node.stroke.paint, "stroke")) {
    applyStrokeStyle(ctx, node.stroke);
    ctx.stroke(path);
  }
  ctx.restore();
}

function fillContours(
  ctx: CanvasRenderingContext2D,
  shapes: import("../../../shared/geometry/flatten").ShapeContours[],
  fill: string,
  stroke: string,
) {
  for (const shape of shapes) {
    for (const contour of shape) {
      if (contour.length < 3) continue;
      ctx.beginPath();
      ctx.moveTo(contour[0][0], contour[0][1]);
      for (let i = 1; i < contour.length; i++) ctx.lineTo(contour[i][0], contour[i][1]);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill("evenodd");
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

export function drawOverlays(
  ctx: CanvasRenderingContext2D,
  zoom: number,
  panX: number,
  panY: number,
  booleanPreview: BooleanPreviewState | null,
  perspective?: PerspectiveGrid,
) {
  ctx.save();
  ctx.translate(panX, panY);
  ctx.scale(zoom, zoom);
  ctx.lineWidth = 1.5 / zoom;

  if (perspective && perspective.mode !== "off") {
    const rays = perspectiveRays(perspective);
    ctx.strokeStyle = "rgba(34,211,238,0.35)";
    ctx.lineWidth = 1 / zoom;
    for (const r of rays) {
      ctx.beginPath();
      ctx.moveTo(r.x1, r.y1);
      ctx.lineTo(r.x2, r.y2);
      ctx.stroke();
    }
    // Vanishing points
    ctx.fillStyle = "rgba(34,211,238,0.9)";
    const drawVp = (vp: { x: number; y: number }) => {
      ctx.beginPath();
      ctx.arc(vp.x, vp.y, 4 / zoom, 0, Math.PI * 2);
      ctx.fill();
    };
    drawVp(perspective.vp1);
    if (perspective.mode === "2point") drawVp(perspective.vp2);
  }

  if (booleanPreview?.shapes?.length) {
    fillContours(
      ctx,
      booleanPreview.shapes,
      "rgba(184,255,60,0.28)",
      "rgba(184,255,60,0.95)",
    );
  }

  const sb = getShapeBuilderSession();
  if (sb?.regions.length) {
    for (const region of sb.regions) {
      fillContours(
        ctx,
        region.contours,
        region.kept ? "rgba(184,255,60,0.22)" : "rgba(248,113,113,0.18)",
        region.kept ? "rgba(184,255,60,0.9)" : "rgba(248,113,113,0.85)",
      );
    }
  }
  ctx.restore();
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  zoom: number,
  panX: number,
  panY: number,
) {
  const step = 32 * zoom;
  if (step < 8) return;
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  const ox = panX % step;
  const oy = panY % step;
  ctx.beginPath();
  for (let x = ox; x < width; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = oy; y < height; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawArtboards(
  ctx: CanvasRenderingContext2D,
  doc: SvgDocument,
  zoom: number,
) {
  const artboards = doc.artboards?.length
    ? doc.artboards
    : [
        {
          id: "legacy",
          name: "Artboard 1",
          x: doc.viewBox.x,
          y: doc.viewBox.y,
          width: doc.viewBox.w,
          height: doc.viewBox.h,
          background: "#ffffff",
        },
      ];
  const activeId = doc.activeArtboardId;

  for (const ab of artboards) {
    const isActive = ab.id === activeId;
    ctx.fillStyle = ab.background ?? "#ffffff";
    ctx.fillRect(ab.x, ab.y, ab.width, ab.height);
    ctx.strokeStyle = isActive ? "rgba(184,255,60,0.85)" : "rgba(255,255,255,0.18)";
    ctx.lineWidth = (isActive ? 2 : 1) / zoom;
    ctx.strokeRect(ab.x, ab.y, ab.width, ab.height);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Label in screen space via current transform already applied outside — draw in world then scale font
    ctx.restore();
    ctx.fillStyle = isActive ? "#B8FF3C" : "rgba(167,176,189,0.85)";
    ctx.font = `${12 / zoom}px "DM Sans Variable", sans-serif`;
    ctx.textBaseline = "bottom";
    ctx.fillText(ab.name, ab.x, ab.y - 6 / zoom);
  }
}

export function drawDocument(
  ctx: CanvasRenderingContext2D,
  doc: SvgDocument,
  zoom: number,
  panX: number,
  panY: number,
) {
  ctx.save();
  ctx.translate(panX, panY);
  ctx.scale(zoom, zoom);

  drawArtboards(ctx, doc, zoom);

  for (const id of doc.rootChildIds) drawNode(ctx, doc, id);
  ctx.restore();
}

