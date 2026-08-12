import { useDocumentStore } from "../../shared/stores/documentStore";
import type { PathNode } from "../../shared/document/types";
import { transformToMatrix } from "../../shared/geometry/transform";
import type { Tool } from "./types";
import { setSelectHandles } from "./selectTool";

let draggingId: string | null = null;
let mode: "move" | "width" = "move";
let start = { x: 0, y: 0 };
let origin = { x: 0, y: 0 };
let originWidth = 2;

export const directSelectTool: Tool = {
  id: "directSelect",
  onPointerDown(e) {
    const store = useDocumentStore.getState();
    const id = store.selection[0];
    const node = id ? store.doc.nodes[id] : null;
    if (!node || node.type !== "path") return;
    const m = transformToMatrix(node.transform);
    for (const sp of node.subpaths) {
      for (const pt of sp.points) {
        const wx = m.a * pt.x + m.c * pt.y + m.e;
        const wy = m.b * pt.x + m.d * pt.y + m.f;
        if (Math.hypot(e.wx - wx, e.wy - wy) < 6) {
          draggingId = pt.id;
          start = { x: e.wx, y: e.wy };
          origin = { x: pt.x, y: pt.y };
          originWidth = pt.strokeWidth ?? node.stroke.width;
          mode = e.altKey ? "width" : "move";
          return;
        }
      }
    }
  },
  onPointerMove(e) {
    if (!draggingId) return;
    const store = useDocumentStore.getState();
    const id = store.selection[0];
    const node = id ? store.doc.nodes[id] : null;
    if (!node || node.type !== "path") return;
    const dx = e.wx - start.x;
    const dy = e.wy - start.y;

    if (mode === "width") {
      const nextW = Math.max(0.5, originWidth + dx * 0.35);
      const subpaths = node.subpaths.map((sp) => ({
        ...sp,
        points: sp.points.map((p) =>
          p.id === draggingId ? { ...p, strokeWidth: nextW } : p,
        ),
      }));
      store.updateNode(id, { subpaths } as Partial<PathNode>);
      return;
    }

    const subpaths = node.subpaths.map((sp) => ({
      ...sp,
      points: sp.points.map((p) =>
        p.id === draggingId
          ? {
              ...p,
              x: origin.x + dx,
              y: origin.y + dy,
              handleIn: p.handleIn
                ? { x: p.handleIn.x + dx, y: p.handleIn.y + dy }
                : undefined,
              handleOut: p.handleOut
                ? { x: p.handleOut.x + dx, y: p.handleOut.y + dy }
                : undefined,
            }
          : p,
      ),
    }));
    store.updateNode(id, { subpaths } as Partial<PathNode>);
  },
  onPointerUp() {
    draggingId = null;
    mode = "move";
  },
};

void setSelectHandles;
