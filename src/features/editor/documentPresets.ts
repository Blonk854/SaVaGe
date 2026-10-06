import { fitToArtboard } from "./camera";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { useUiStore } from "../../shared/stores/uiStore";

export const ARTBOARD_SIZE_LIMIT = 16_384;

export const DOCUMENT_PRESETS = [
  { id: "screen", label: "1920×1080", width: 1920, height: 1080 },
  { id: "square", label: "1080×1080", width: 1080, height: 1080 },
  { id: "story", label: "1080×1920", width: 1080, height: 1920 },
  { id: "icon", label: "512×512", width: 512, height: 512 },
] as const;

export function parseArtboardSize(width: string, height: string): { width: number; height: number } | null {
  if (!/^\d+$/.test(width.trim()) || !/^\d+$/.test(height.trim())) return null;
  const nextWidth = Number(width);
  const nextHeight = Number(height);
  if (
    !Number.isInteger(nextWidth) ||
    !Number.isInteger(nextHeight) ||
    nextWidth < 1 ||
    nextHeight < 1 ||
    nextWidth > ARTBOARD_SIZE_LIMIT ||
    nextHeight > ARTBOARD_SIZE_LIMIT
  ) {
    return null;
  }
  return { width: nextWidth, height: nextHeight };
}

export function resizeActiveArtboard(width: number, height: number, viewport?: { w: number; h: number }) {
  const id = useDocumentStore.getState().doc.activeArtboardId;
  useDocumentStore.getState().updateArtboard(id, { width, height });
  useUiStore.getState().markDirty();
  if (viewport && viewport.w >= 32 && viewport.h >= 32) {
    fitToArtboard(viewport.w, viewport.h);
  }
}
