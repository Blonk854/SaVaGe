import { useDocumentStore } from "../../shared/stores/documentStore";
import { useUiStore } from "../../shared/stores/uiStore";
import { selectionBounds } from "../../shared/geometry/bounds";
import { getActiveArtboard } from "../../shared/document/artboards";

export function fitToArtboard(viewportW: number, viewportH: number, padding = 48) {
  const doc = useDocumentStore.getState().doc;
  const ab = getActiveArtboard(doc);
  const zoom = Math.min(
    (viewportW - padding * 2) / Math.max(ab.width, 1),
    (viewportH - padding * 2) / Math.max(ab.height, 1),
  );
  const panX = (viewportW - ab.width * zoom) / 2 - ab.x * zoom;
  const panY = (viewportH - ab.height * zoom) / 2 - ab.y * zoom;
  const ui = useUiStore.getState();
  ui.setZoom(zoom);
  ui.setPan(panX, panY);
}

export function fitAllArtboards(viewportW: number, viewportH: number, padding = 48) {
  const doc = useDocumentStore.getState().doc;
  const { w, h, x, y } = doc.viewBox;
  const zoom = Math.min(
    (viewportW - padding * 2) / Math.max(w, 1),
    (viewportH - padding * 2) / Math.max(h, 1),
  );
  const panX = (viewportW - w * zoom) / 2 - x * zoom;
  const panY = (viewportH - h * zoom) / 2 - y * zoom;
  const ui = useUiStore.getState();
  ui.setZoom(zoom);
  ui.setPan(panX, panY);
}

export function fitToSelection(viewportW: number, viewportH: number, padding = 48) {
  const { doc, selection } = useDocumentStore.getState();
  const b = selection.length
    ? selectionBounds(doc, selection)
    : (() => {
        const ab = getActiveArtboard(doc);
        return { x: ab.x, y: ab.y, w: ab.width, h: ab.height };
      })();
  if (b.w <= 0 || b.h <= 0) {
    fitToArtboard(viewportW, viewportH, padding);
    return;
  }
  const zoom = Math.min(
    (viewportW - padding * 2) / b.w,
    (viewportH - padding * 2) / b.h,
  );
  const panX = (viewportW - b.w * zoom) / 2 - b.x * zoom;
  const panY = (viewportH - b.h * zoom) / 2 - b.y * zoom;
  const ui = useUiStore.getState();
  ui.setZoom(zoom);
  ui.setPan(panX, panY);
}

export function setZoomCentered(nextZoom: number, viewportW: number, viewportH: number) {
  const ui = useUiStore.getState();
  const cx = (viewportW / 2 - ui.panX) / ui.zoom;
  const cy = (viewportH / 2 - ui.panY) / ui.zoom;
  const z = Math.min(64, Math.max(0.05, nextZoom));
  ui.setZoom(z);
  ui.setPan(viewportW / 2 - cx * z, viewportH / 2 - cy * z);
}
