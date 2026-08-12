import { nanoid } from "nanoid";
import { useDocumentStore } from "../../shared/stores/documentStore";
import {
  defaultStroke,
  defaultTransform,
  type PathNode,
} from "../../shared/document/types";
import { simplifyPolyline } from "../../shared/geometry/path";
import type { Tool } from "./types";

let drawing = false;
let samples: { x: number; y: number }[] = [];
let nodeId: string | null = null;

function toPath(points: { x: number; y: number }[]): PathNode {
  const simplified = simplifyPolyline(points, 1.5);
  return {
    id: nodeId ?? nanoid(10),
    name: "Pencil",
    type: "path",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: defaultTransform(),
    subpaths: [
      {
        closed: false,
        points: simplified.map((p) => ({
          id: nanoid(8),
          x: p.x,
          y: p.y,
          type: "corner" as const,
        })),
      },
    ],
    fill: { type: "none" },
    stroke: defaultStroke("#B8FF3C", 2),
    fillRule: "nonzero",
  };
}

export const pencilTool: Tool = {
  id: "pencil",
  onPointerDown(e) {
    drawing = true;
    samples = [{ x: e.wx, y: e.wy }];
    const node = toPath(samples);
    nodeId = node.id;
    useDocumentStore.getState().addNode(node);
  },
  onPointerMove(e) {
    if (!drawing || !nodeId) return;
    const last = samples[samples.length - 1];
    if (Math.hypot(e.wx - last.x, e.wy - last.y) < 2) return;
    samples.push({ x: e.wx, y: e.wy });
    const node = toPath(samples);
    useDocumentStore.getState().updateNode(nodeId, {
      subpaths: node.subpaths,
    });
  },
  onPointerUp() {
    drawing = false;
    nodeId = null;
    samples = [];
  },
};
