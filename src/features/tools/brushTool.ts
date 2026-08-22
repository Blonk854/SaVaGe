import { nanoid } from "nanoid";
import { useDocumentStore } from "../../shared/stores/documentStore";
import {
  defaultStroke,
  defaultTransform,
  solidFill,
  type PathNode,
  type PathPoint,
} from "../../shared/document/types";
import type { Tool } from "./types";

let drawing = false;
let samples: { x: number; y: number; w: number; t: number }[] = [];
let nodeId: string | null = null;
let last = { x: 0, y: 0, t: 0 };

const MIN_W = 1.5;
const MAX_W = 14;

function widthFromSpeed(dx: number, dy: number, dt: number): number {
  const speed = dt > 0 ? Math.hypot(dx, dy) / dt : 0;
  // Faster = thinner (calligraphy feel)
  const t = Math.min(1, speed / 2.5);
  return MAX_W - t * (MAX_W - MIN_W);
}

function ribbonPath(points: { x: number; y: number; w: number }[]): PathPoint[] {
  if (points.length < 2) return [];
  const left: PathPoint[] = [];
  const right: PathPoint[] = [];

  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * (points[i].w / 2);
    const ny = (dx / len) * (points[i].w / 2);
    left.push({
      id: nanoid(8),
      x: points[i].x + nx,
      y: points[i].y + ny,
      type: "corner",
    });
    right.push({
      id: nanoid(8),
      x: points[i].x - nx,
      y: points[i].y - ny,
      type: "corner",
    });
  }

  return [...left, ...right.reverse()];
}

function toNode(points: { x: number; y: number; w: number }[]): PathNode {
  const ring = ribbonPath(points);
  return {
    id: nodeId ?? nanoid(10),
    name: "Brush",
    type: "path",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: defaultTransform(),
    subpaths: [{ closed: true, points: ring }],
    fill: solidFill("#B8FF3C", 0.92),
    stroke: { ...defaultStroke("#000000", 0), paint: { type: "none" } },
    fillRule: "nonzero",
  };
}

export const brushTool: Tool = {
  id: "brush",
  onPointerDown(e) {
    drawing = true;
    const t = performance.now();
    last = { x: e.wx, y: e.wy, t };
    samples = [{ x: e.wx, y: e.wy, w: MAX_W * 0.7, t }];
    const node = toNode(samples);
    nodeId = node.id;
    useDocumentStore.temporal.getState().pause();
    useDocumentStore.getState().addNode(node);
  },
  onPointerMove(e) {
    if (!drawing || !nodeId) return;
    const t = performance.now();
    const dt = Math.max(1, t - last.t);
    const w = widthFromSpeed(e.wx - last.x, e.wy - last.y, dt);
    if (Math.hypot(e.wx - last.x, e.wy - last.y) < 1.5) return;
    // Smooth width
    const prevW = samples[samples.length - 1]?.w ?? w;
    samples.push({ x: e.wx, y: e.wy, w: prevW * 0.65 + w * 0.35, t });
    last = { x: e.wx, y: e.wy, t };
    const node = toNode(samples);
    useDocumentStore.getState().updateNode(nodeId, { subpaths: node.subpaths });
  },
  onPointerUp() {
    const id = nodeId;
    const count = samples.length;
    drawing = false;
    nodeId = null;
    samples = [];
    useDocumentStore.temporal.getState().resume();
    if (id && count < 2) useDocumentStore.getState().deleteNodes([id]);
  },
};
