import { nanoid } from "nanoid";
import { useDocumentStore } from "../../shared/stores/documentStore";
import {
  defaultStroke,
  defaultTransform,
  solidFill,
  type EllipseNode,
  type LineNode,
  type PathNode,
  type RectNode,
} from "../../shared/document/types";
import type { Tool } from "./types";
import type { ToolId } from "../../shared/stores/uiStore";

let drawing = false;
let start = { x: 0, y: 0 };
let nodeId: string | null = null;
let kind: ToolId = "rect";

function regularPolygon(cx: number, cy: number, r: number, sides: number, star = false): PathNode {
  const points = [];
  const count = star ? sides * 2 : sides;
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    const radius = star && i % 2 === 1 ? r * 0.45 : r;
    points.push({
      id: nanoid(8),
      x: cx + Math.cos(a) * radius,
      y: cy + Math.sin(a) * radius,
      type: "corner" as const,
    });
  }
  return {
    id: nanoid(10),
    name: star ? "Star" : "Polygon",
    type: "path",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: defaultTransform(),
    subpaths: [{ closed: true, points }],
    fill: solidFill("#B8FF3C", 0.85),
    stroke: defaultStroke("#0B0D10", 1),
    fillRule: "nonzero",
  };
}

function ensureNode(tool: ToolId, x: number, y: number) {
  const store = useDocumentStore.getState();
  if (tool === "rect") {
    const node: RectNode = {
      id: nanoid(10),
      name: "Rectangle",
      type: "rect",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      transform: defaultTransform(x, y),
      width: 1,
      height: 1,
      rx: 0,
      ry: 0,
      fill: solidFill("#B8FF3C", 0.85),
      stroke: defaultStroke("#0B0D10", 1),
    };
    store.addNode(node);
    return node.id;
  }
  if (tool === "ellipse") {
    const node: EllipseNode = {
      id: nanoid(10),
      name: "Ellipse",
      type: "ellipse",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      transform: defaultTransform(x, y),
      rx: 1,
      ry: 1,
      fill: solidFill("#B8FF3C", 0.85),
      stroke: defaultStroke("#0B0D10", 1),
    };
    store.addNode(node);
    return node.id;
  }
  if (tool === "line") {
    const node: LineNode = {
      id: nanoid(10),
      name: "Line",
      type: "line",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      transform: defaultTransform(x, y),
      x2: 1,
      y2: 1,
      stroke: defaultStroke("#B8FF3C", 2),
    };
    store.addNode(node);
    return node.id;
  }
  const poly = regularPolygon(0, 0, 1, 6, tool === "star");
  poly.transform = defaultTransform(x, y);
  store.addNode(poly);
  return poly.id;
}

function makeShapeTool(id: ToolId): Tool {
  return {
    id,
    onPointerDown(e) {
      drawing = true;
      kind = id;
      start = { x: e.wx, y: e.wy };
      nodeId = ensureNode(id, e.wx, e.wy);
    },
    onPointerMove(e) {
      if (!drawing || !nodeId) return;
      const store = useDocumentStore.getState();
      const node = store.doc.nodes[nodeId];
      if (!node) return;
      let x1 = start.x;
      let y1 = start.y;
      let x2 = e.wx;
      let y2 = e.wy;
      if (e.shiftKey && node.type !== "line") {
        const s = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
        x2 = x1 + Math.sign(x2 - x1 || 1) * s;
        y2 = y1 + Math.sign(y2 - y1 || 1) * s;
      }
      if (e.altKey && node.type !== "line") {
        const cx = start.x;
        const cy = start.y;
        const dx = Math.abs(x2 - cx);
        const dy = Math.abs(y2 - cy);
        x1 = cx - dx;
        y1 = cy - dy;
        x2 = cx + dx;
        y2 = cy + dy;
      }

      if (node.type === "rect") {
        store.updateNode(nodeId, {
          transform: { ...node.transform, x: Math.min(x1, x2), y: Math.min(y1, y2) },
          width: Math.max(1, Math.abs(x2 - x1)),
          height: Math.max(1, Math.abs(y2 - y1)),
        } as Partial<RectNode>);
      } else if (node.type === "ellipse") {
        const rx = Math.max(1, Math.abs(x2 - x1) / 2);
        const ry = Math.max(1, Math.abs(y2 - y1) / 2);
        store.updateNode(nodeId, {
          transform: {
            ...node.transform,
            x: Math.min(x1, x2) + rx,
            y: Math.min(y1, y2) + ry,
          },
          rx,
          ry,
        } as Partial<EllipseNode>);
      } else if (node.type === "line") {
        store.updateNode(nodeId, {
          transform: { ...node.transform, x: start.x, y: start.y },
          x2: e.wx - start.x,
          y2: e.wy - start.y,
        } as Partial<LineNode>);
      } else if (node.type === "path") {
        const r = Math.max(1, Math.hypot(e.wx - start.x, e.wy - start.y));
        const next = regularPolygon(0, 0, r, kind === "star" ? 5 : 6, kind === "star");
        store.updateNode(nodeId, {
          transform: defaultTransform(start.x, start.y),
          subpaths: next.subpaths,
        } as Partial<PathNode>);
      }
    },
    onPointerUp() {
      drawing = false;
      nodeId = null;
    },
  };
}

export const rectTool = makeShapeTool("rect");
export const ellipseTool = makeShapeTool("ellipse");
export const lineTool = makeShapeTool("line");
export const polygonTool = makeShapeTool("polygon");
export const starTool = makeShapeTool("star");
