import { useDocumentStore } from "../../shared/stores/documentStore";
import { useUiStore } from "../../shared/stores/uiStore";
import type { Tool } from "./types";

/** Middle-mouse / Space pan is handled in the viewport; this is a safe no-op. */
export const panTool: Tool = {
  id: "pan",
  onPointerDown() {},
  onPointerMove() {},
  onPointerUp() {},
};

/** Click zoom in; Alt-click zoom out, keeping the cursor world point stable. */
export const zoomTool: Tool = {
  id: "zoom",
  onPointerDown(e) {
    const ui = useUiStore.getState();
    const factor = e.altKey ? 1 / 1.25 : 1.25;
    const nextZoom = Math.min(64, Math.max(0.05, ui.zoom * factor));
    ui.setZoom(nextZoom);
    ui.setPan(e.sx - e.wx * nextZoom, e.sy - e.wy * nextZoom);
  },
  onPointerMove() {},
  onPointerUp() {},
};

/** Resume undo history if a gesture was aborted mid-pause. */
export function resumeHistory() {
  useDocumentStore.temporal.getState().resume();
}
