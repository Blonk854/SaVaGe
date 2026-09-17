import type { NodeId, SceneNode, SvgDocument } from "../document/types";
import { nodeWorldBounds, pointInBounds } from "./bounds";
import { subpathsToPath2D } from "./path";
import { invertMat, nodeWorldMatrix, type Mat2D } from "./transform";

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

/** Local stroke width used by the precise canvas hit, including screen-pixel slop. */
export function hitTestLocalStrokeWidth(node: SceneNode, zoom: number): number {
  const z = Math.max(zoom, 0.05);
  switch (node.type) {
    case "line":
      return Math.max(node.stroke.width, 6 / z);
    case "rect":
    case "ellipse":
      return node.stroke.paint.type !== "none" ? Math.max(node.stroke.width, 4 / z) : 0;
    case "path":
      if (node.stroke.paint.type !== "none") return Math.max(node.stroke.width, 4 / z);
      if (node.fill.type === "none") return 6 / z;
      return 0;
    default:
      return 0;
  }
}

/** World-space AABB pad so stroke hits are not rejected before the Path2D test. */
export function hitTestWorldPad(node: SceneNode, zoom: number, world: Mat2D): number {
  const local = hitTestLocalStrokeWidth(node, zoom);
  if (local <= 0) return 0;
  const scale = Math.max(Math.hypot(world.a, world.b), Math.hypot(world.c, world.d), 1e-6);
  return (local / 2) * scale;
}

/**
 * Cheap rejection: false means the precise Path2D test cannot hit.
 * True is conservative (stroke padding and rotated AABBs).
 */
export function nodeHitBoundsContains(
  doc: SvgDocument,
  node: SceneNode,
  wx: number,
  wy: number,
  zoom: number,
): boolean {
  const world = nodeWorldMatrix(doc, node.id);
  if (!world) return false;
  return pointInBounds(nodeWorldBounds(doc, node.id), wx, wy, hitTestWorldPad(node, zoom, world));
}

function hitNode(
  ctx: CanvasRenderingContext2D,
  doc: SvgDocument,
  node: SceneNode,
  wx: number,
  wy: number,
  zoom: number,
): boolean {
  if (!node.visible || node.locked) return false;
  const world = nodeWorldMatrix(doc, node.id);
  if (!world) return false;
  const inv = invertMat(world);
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
    if (!node.visible || node.locked) continue;
    if (!nodeHitBoundsContains(doc, node, wx, wy, zoom)) continue;
    if (hitNode(ctx, doc, node, wx, wy, zoom)) return id;
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
