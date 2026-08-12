import type { NodeId, SceneNode, SvgDocument } from "../document/types";
import { subpathsToPath2D } from "./path";
import type { Mat2D } from "./transform";
import { transformToMatrix } from "./transform";

function invertMat(m: Mat2D): Mat2D | null {
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

function apply(m: Mat2D, x: number, y: number) {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

function paintOrder(doc: SvgDocument, ids: NodeId[]): NodeId[] {
  const out: NodeId[] = [];
  const walk = (list: NodeId[]) => {
    for (const id of list) {
      const n = doc.nodes[id];
      if (!n) continue;
      if (n.type === "group") walk(n.children);
      out.push(id);
    }
  };
  walk(ids);
  return out;
}

function hitNode(
  ctx: CanvasRenderingContext2D,
  node: SceneNode,
  wx: number,
  wy: number,
  zoom: number,
): boolean {
  if (!node.visible || node.locked) return false;
  const inv = invertMat(transformToMatrix(node.transform));
  if (!inv) return false;
  const local = apply(inv, wx, wy);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  let hit = false;
  switch (node.type) {
    case "rect": {
      const path = new Path2D();
      path.rect(0, 0, node.width, node.height);
      hit = ctx.isPointInPath(path, local.x, local.y);
      if (!hit && node.stroke.paint.type !== "none") {
        ctx.lineWidth = Math.max(node.stroke.width, 4 / zoom);
        hit = ctx.isPointInStroke(path, local.x, local.y);
      }
      break;
    }
    case "ellipse": {
      const path = new Path2D();
      path.ellipse(0, 0, Math.max(node.rx, 0.01), Math.max(node.ry, 0.01), 0, 0, Math.PI * 2);
      hit = ctx.isPointInPath(path, local.x, local.y);
      if (!hit && node.stroke.paint.type !== "none") {
        ctx.lineWidth = Math.max(node.stroke.width, 4 / zoom);
        hit = ctx.isPointInStroke(path, local.x, local.y);
      }
      break;
    }
    case "line": {
      const path = new Path2D();
      path.moveTo(0, 0);
      path.lineTo(node.x2, node.y2);
      ctx.lineWidth = Math.max(node.stroke.width, 6 / zoom);
      hit = ctx.isPointInStroke(path, local.x, local.y);
      break;
    }
    case "path": {
      const path = subpathsToPath2D(node.subpaths);
      if (node.fill.type !== "none") {
        hit = ctx.isPointInPath(path, local.x, local.y, node.fillRule);
      }
      if (!hit && node.stroke.paint.type !== "none") {
        ctx.lineWidth = Math.max(node.stroke.width, 4 / zoom);
        hit = ctx.isPointInStroke(path, local.x, local.y);
      }
      // Empty-fill paths still selectable near stroke
      if (!hit && node.fill.type === "none" && node.stroke.paint.type === "none") {
        ctx.lineWidth = 6 / zoom;
        hit = ctx.isPointInStroke(path, local.x, local.y);
      }
      break;
    }
    case "text": {
      const w = Math.max(8, node.content.length * node.fontSize * 0.55);
      const h = node.fontSize * node.lineHeight;
      const path = new Path2D();
      path.rect(0, -node.fontSize, w, h);
      hit = ctx.isPointInPath(path, local.x, local.y);
      break;
    }
    case "image":
    case "symbolInstance": {
      const path = new Path2D();
      path.rect(0, 0, node.width, node.height);
      hit = ctx.isPointInPath(path, local.x, local.y);
      break;
    }
    case "group":
      hit = false;
      break;
  }
  ctx.restore();
  return hit;
}

export function hitTestTopNode(
  ctx: CanvasRenderingContext2D,
  doc: SvgDocument,
  wx: number,
  wy: number,
  zoom: number,
): NodeId | null {
  const order = paintOrder(doc, doc.rootChildIds);
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const node = doc.nodes[id];
    if (!node || node.type === "group") continue;
    if (hitNode(ctx, node, wx, wy, zoom)) return id;
  }
  return null;
}

export function hitTestHandle(
  sx: number,
  sy: number,
  handles: { id: string; x: number; y: number }[],
  radius = 6,
): string | null {
  for (const h of handles) {
    const dx = sx - h.x;
    const dy = sy - h.y;
    if (dx * dx + dy * dy <= radius * radius) return h.id;
  }
  return null;
}
