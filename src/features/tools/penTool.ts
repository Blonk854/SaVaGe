import { nanoid } from "nanoid";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { useUiStore } from "../../shared/stores/uiStore";
import {
  defaultStroke,
  defaultTransform,
  solidFill,
  type PathNode,
  type PathPoint,
} from "../../shared/document/types";
import type { Tool, ToolEvent } from "./types";

let activeId: string | null = null;
let draggingHandle = false;
let lastPointId: string | null = null;

function getPath(): PathNode | null {
  if (!activeId) return null;
  const n = useDocumentStore.getState().doc.nodes[activeId];
  return n?.type === "path" ? n : null;
}

export const penTool: Tool = {
  id: "pen",
  onPointerDown(e: ToolEvent) {
    const store = useDocumentStore.getState();
    let path = getPath();
    if (!path) {
      const node: PathNode = {
        id: nanoid(10),
        name: "Path",
        type: "path",
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: "normal",
        transform: defaultTransform(),
        subpaths: [{ closed: false, points: [] }],
        fill: solidFill("#B8FF3C", 0.2),
        stroke: defaultStroke("#B8FF3C", 2),
        fillRule: "nonzero",
      };
      store.addNode(node);
      activeId = node.id;
      path = node;
    }

    const points = path.subpaths[0].points;
    if (points.length >= 3) {
      const first = points[0];
      const zoom = useUiStore.getState().zoom;
      if (Math.hypot(e.wx - first.x, e.wy - first.y) < 8 / Math.max(zoom, 0.05)) {
        store.updateNode(path.id, {
          subpaths: [{ ...path.subpaths[0], closed: true }],
        });
        activeId = null;
        return;
      }
    }

    const pt: PathPoint = {
      id: nanoid(8),
      x: e.wx,
      y: e.wy,
      type: "corner",
    };
    store.updateNode(path.id, {
      subpaths: [{ ...path.subpaths[0], points: [...points, pt] }],
    });
    lastPointId = pt.id;
    draggingHandle = true;
  },
  onPointerMove(e) {
    if (!draggingHandle || !activeId || !lastPointId) return;
    const path = getPath();
    if (!path) return;
    const points = path.subpaths[0].points.map((p) => {
      if (p.id !== lastPointId) return p;
      const dx = e.wx - p.x;
      const dy = e.wy - p.y;
      return {
        ...p,
        type: "smooth" as const,
        handleOut: { x: p.x + dx, y: p.y + dy },
        handleIn: { x: p.x - dx, y: p.y - dy },
      };
    });
    useDocumentStore.getState().updateNode(path.id, {
      subpaths: [{ ...path.subpaths[0], points }],
    });
  },
  onPointerUp() {
    draggingHandle = false;
  },
  onKeyDown(e) {
    if (e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      activeId = null;
      lastPointId = null;
    }
    if (e.key === "Backspace" && activeId) {
      e.preventDefault();
      const path = getPath();
      if (!path) return;
      const points = path.subpaths[0].points.slice(0, -1);
      if (!points.length) {
        useDocumentStore.getState().deleteNodes([path.id]);
        resetPenTool();
        return;
      }
      useDocumentStore.getState().updateNode(path.id, {
        subpaths: [{ ...path.subpaths[0], points }],
      });
    }
  },
};

export function isPenDrawing() {
  return activeId !== null;
}

export function resetPenTool() {
  activeId = null;
  lastPointId = null;
  draggingHandle = false;
}
