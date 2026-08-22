import { useDocumentStore } from "../../shared/stores/documentStore";
import { useUiStore } from "../../shared/stores/uiStore";
import type { PathNode, PathPoint } from "../../shared/document/types";
import { applyMat, invertMat, transformToMatrix } from "../../shared/geometry/transform";
import type { Tool } from "./types";

let draggingId: string | null = null;
let draggingNodeId: string | null = null;
let mode: "move" | "width" = "move";
let origin = { x: 0, y: 0 };
let startWorld = { x: 0, y: 0 };
let originWidth = 2;

export function nearestPathPoint(
  wx: number,
  wy: number,
  threshold: number,
): { nodeId: string; point: PathPoint; dist: number } | null {
  const doc = useDocumentStore.getState().doc;
  let best: { nodeId: string; point: PathPoint; dist: number } | null = null;
  for (const node of Object.values(doc.nodes)) {
    if (node.type !== "path" || !node.visible || node.locked) continue;
    const m = transformToMatrix(node.transform);
    for (const sp of node.subpaths) {
      for (const pt of sp.points) {
        const world = applyMat(m, pt.x, pt.y);
        const dist = Math.hypot(wx - world.x, wy - world.y);
        if (dist < threshold && (!best || dist < best.dist)) {
          best = { nodeId: node.id, point: pt, dist };
        }
      }
    }
  }
  return best;
}

export const directSelectTool: Tool = {
  id: "directSelect",
  onPointerDown(e) {
    const zoom = useUiStore.getState().zoom;
    const thresh = 8 / Math.max(zoom, 0.05);
    const hit = nearestPathPoint(e.wx, e.wy, thresh);
    if (!hit) return;
    const store = useDocumentStore.getState();
    store.setSelection([hit.nodeId]);
    draggingId = hit.point.id;
    draggingNodeId = hit.nodeId;
    origin = { x: hit.point.x, y: hit.point.y };
    startWorld = { x: e.wx, y: e.wy };
    const node = store.doc.nodes[hit.nodeId];
    originWidth =
      hit.point.strokeWidth ?? (node?.type === "path" ? node.stroke.width : 2);
    mode = e.altKey ? "width" : "move";
    useDocumentStore.temporal.getState().pause();
  },
  onPointerMove(e) {
    if (!draggingId || !draggingNodeId) return;
    const store = useDocumentStore.getState();
    const node = store.doc.nodes[draggingNodeId];
    if (!node || node.type !== "path") return;

    if (mode === "width") {
      const nextW = Math.max(0.5, originWidth + (e.wx - startWorld.x) * 0.35);
      const subpaths = node.subpaths.map((sp) => ({
        ...sp,
        points: sp.points.map((p) =>
          p.id === draggingId ? { ...p, strokeWidth: nextW } : p,
        ),
      }));
      store.updateNode(node.id, { subpaths } as Partial<PathNode>);
      return;
    }

    const inv = invertMat(transformToMatrix(node.transform));
    const local = inv ? applyMat(inv, e.wx, e.wy) : { x: e.wx, y: e.wy };
    const dx = local.x - origin.x;
    const dy = local.y - origin.y;

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
    store.updateNode(node.id, { subpaths } as Partial<PathNode>);
  },
  onPointerUp() {
    if (draggingId) useDocumentStore.temporal.getState().resume();
    draggingId = null;
    draggingNodeId = null;
    mode = "move";
  },
};
