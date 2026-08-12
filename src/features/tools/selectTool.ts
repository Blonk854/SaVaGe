import { useDocumentStore } from "../../shared/stores/documentStore";
import { selectionBounds } from "../../shared/geometry/bounds";
import { hitTestHandle, hitTestTopNode } from "../../shared/geometry/hitTest";
import type { HandlePoint } from "../editor/renderer/drawHandles";
import type { Tool } from "./types";

let dragging = false;
let mode: "move" | "resize" | "rotate" | null = null;
let handleId: string | null = null;
let start = { wx: 0, wy: 0, sx: 0, sy: 0 };
let startTransforms: Record<string, { x: number; y: number; rotation: number; scaleX: number; scaleY: number }> = {};
let startBounds = { x: 0, y: 0, w: 0, h: 0 };
let hitCtx: CanvasRenderingContext2D | null = null;
let handles: HandlePoint[] = [];

export function setSelectHitContext(ctx: CanvasRenderingContext2D) {
  hitCtx = ctx;
}

export function setSelectHandles(h: HandlePoint[]) {
  handles = h;
}

export const selectTool: Tool = {
  id: "select",
  onPointerDown(e) {
    const store = useDocumentStore.getState();
    const h = hitTestHandle(e.sx, e.sy, handles);
    if (h) {
      dragging = true;
      useDocumentStore.temporal.getState().pause();
      mode = h === "rot" ? "rotate" : "resize";
      handleId = h;
      start = { wx: e.wx, wy: e.wy, sx: e.sx, sy: e.sy };
      startBounds = selectionBounds(store.doc, store.selection);
      startTransforms = Object.fromEntries(
        store.selection.map((id) => {
          const n = store.doc.nodes[id];
          return [
            id,
            {
              x: n.transform.x,
              y: n.transform.y,
              rotation: n.transform.rotation,
              scaleX: n.transform.scaleX,
              scaleY: n.transform.scaleY,
            },
          ];
        }),
      );
      return;
    }

    if (!hitCtx) return;
    const hit = hitTestTopNode(hitCtx, store.doc, e.wx, e.wy, 1);
    if (hit) {
      const next = e.shiftKey
        ? store.selection.includes(hit)
          ? store.selection.filter((id) => id !== hit)
          : [...store.selection, hit]
        : [hit];
      store.setSelection(next);
      dragging = true;
      useDocumentStore.temporal.getState().pause();
      mode = "move";
      start = { wx: e.wx, wy: e.wy, sx: e.sx, sy: e.sy };
      startTransforms = Object.fromEntries(
        next.map((id) => {
          const n = store.doc.nodes[id];
          return [id, { ...n.transform }];
        }),
      );
    } else if (!e.shiftKey) {
      store.setSelection([]);
    }
  },
  onPointerMove(e) {
    if (!dragging || !mode) return;
    const store = useDocumentStore.getState();
    const dx = e.wx - start.wx;
    const dy = e.wy - start.wy;

    if (mode === "move") {
      for (const id of store.selection) {
        const t0 = startTransforms[id];
        if (!t0) continue;
        store.setNodeTransform(id, {
          ...store.doc.nodes[id].transform,
          x: t0.x + dx,
          y: t0.y + dy,
        });
      }
      return;
    }

    if (mode === "rotate") {
      const cx = startBounds.x + startBounds.w / 2;
      const cy = startBounds.y + startBounds.h / 2;
      const a0 = Math.atan2(start.wy - cy, start.wx - cx);
      const a1 = Math.atan2(e.wy - cy, e.wx - cx);
      const deg = ((a1 - a0) * 180) / Math.PI;
      for (const id of store.selection) {
        const t0 = startTransforms[id];
        if (!t0) continue;
        store.setNodeTransform(id, {
          ...store.doc.nodes[id].transform,
          rotation: t0.rotation + deg,
        });
      }
      return;
    }

    if (mode === "resize" && handleId && startBounds.w > 0 && startBounds.h > 0) {
      let scaleX = 1;
      let scaleY = 1;
      if (handleId.includes("e")) scaleX = (startBounds.w + dx) / startBounds.w;
      if (handleId.includes("w")) scaleX = (startBounds.w - dx) / startBounds.w;
      if (handleId.includes("s")) scaleY = (startBounds.h + dy) / startBounds.h;
      if (handleId.includes("n")) scaleY = (startBounds.h - dy) / startBounds.h;
      if (e.shiftKey) {
        const s = Math.max(scaleX, scaleY);
        scaleX = s;
        scaleY = s;
      }
      scaleX = Math.max(0.05, scaleX);
      scaleY = Math.max(0.05, scaleY);
      for (const id of store.selection) {
        const t0 = startTransforms[id];
        if (!t0) continue;
        store.setNodeTransform(id, {
          ...store.doc.nodes[id].transform,
          scaleX: t0.scaleX * scaleX,
          scaleY: t0.scaleY * scaleY,
        });
      }
    }
  },
  onPointerUp() {
    if (dragging) {
      useDocumentStore.temporal.getState().resume();
    }
    dragging = false;
    mode = null;
    handleId = null;
  },
};
