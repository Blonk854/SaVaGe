import type { Transform2D } from "../../shared/document/types";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { useUiStore } from "../../shared/stores/uiStore";
import { selectionBounds, type Bounds } from "../../shared/geometry/bounds";
import { hitTestHandle, hitTestTopNode } from "../../shared/geometry/hitTest";
import type { HandlePoint } from "../editor/renderer/drawHandles";
import type { Tool } from "./types";

let dragging = false;
let mode: "move" | "resize" | "rotate" | null = null;
let handleId: string | null = null;
let start = { wx: 0, wy: 0, sx: 0, sy: 0 };
let startTransforms: Record<
  string,
  { x: number; y: number; rotation: number; scaleX: number; scaleY: number }
> = {};
let startBounds = { x: 0, y: 0, w: 0, h: 0 };
let hitCtx: CanvasRenderingContext2D | null = null;
let handles: HandlePoint[] = [];

export function setSelectHitContext(ctx: CanvasRenderingContext2D) {
  hitCtx = ctx;
}

export function setSelectHandles(h: HandlePoint[]) {
  handles = h;
}

/** Scale a transform around the opposite corner of the selection bounds. */
export function applyResizeHandle(
  t0: Pick<Transform2D, "x" | "y" | "rotation" | "scaleX" | "scaleY">,
  bounds: Bounds,
  handle: string,
  dx: number,
  dy: number,
  uniform: boolean,
): Pick<Transform2D, "x" | "y" | "rotation" | "scaleX" | "scaleY"> {
  let scaleX = 1;
  let scaleY = 1;
  if (handle.includes("e")) scaleX = (bounds.w + dx) / Math.max(bounds.w, 1e-6);
  if (handle.includes("w")) scaleX = (bounds.w - dx) / Math.max(bounds.w, 1e-6);
  if (handle.includes("s")) scaleY = (bounds.h + dy) / Math.max(bounds.h, 1e-6);
  if (handle.includes("n")) scaleY = (bounds.h - dy) / Math.max(bounds.h, 1e-6);
  if (uniform) {
    const s = Math.max(scaleX, scaleY);
    scaleX = s;
    scaleY = s;
  }
  scaleX = Math.max(0.05, scaleX);
  scaleY = Math.max(0.05, scaleY);
  const ox = handle.includes("w") ? bounds.x + bounds.w : bounds.x;
  const oy = handle.includes("n") ? bounds.y + bounds.h : bounds.y;
  return {
    rotation: t0.rotation,
    x: ox + (t0.x - ox) * scaleX,
    y: oy + (t0.y - oy) * scaleY,
    scaleX: t0.scaleX * scaleX,
    scaleY: t0.scaleY * scaleY,
  };
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
    const hit = hitTestTopNode(hitCtx, store.doc, e.wx, e.wy, useUiStore.getState().zoom);
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
        const node = store.doc.nodes[id];
        if (!t0 || !node || node.locked) continue;
        store.setNodeTransform(id, {
          ...node.transform,
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
      const rad = a1 - a0;
      const deg = (rad * 180) / Math.PI;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      for (const id of store.selection) {
        const t0 = startTransforms[id];
        const node = store.doc.nodes[id];
        if (!t0 || !node || node.locked) continue;
        const dx0 = t0.x - cx;
        const dy0 = t0.y - cy;
        store.setNodeTransform(id, {
          ...node.transform,
          x: cx + dx0 * cos - dy0 * sin,
          y: cy + dx0 * sin + dy0 * cos,
          rotation: t0.rotation + deg,
        });
      }
      return;
    }

    if (mode === "resize" && handleId && startBounds.w > 0 && startBounds.h > 0) {
      for (const id of store.selection) {
        const t0 = startTransforms[id];
        const node = store.doc.nodes[id];
        if (!t0 || !node || node.locked) continue;
        const next = applyResizeHandle(t0, startBounds, handleId, dx, dy, e.shiftKey);
        store.setNodeTransform(id, {
          ...node.transform,
          ...next,
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
