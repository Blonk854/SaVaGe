import { create } from "zustand";
import type { ShapeContours } from "../geometry/flatten";
import {
  defaultPerspectiveGrid,
  type PerspectiveGrid,
} from "../geometry/perspective";
import type { GrantedImageSource } from "../../features/converter/rasterFiles";

export type AppMode = "convert" | "edit";
export type RightTab = "layers" | "properties" | "artboards" | "symbols" | "plugins";
export type ToolId =
  | "select"
  | "directSelect"
  | "pan"
  | "zoom"
  | "rect"
  | "ellipse"
  | "line"
  | "polygon"
  | "star"
  | "pen"
  | "pencil"
  | "brush"
  | "patternBrush"
  | "scatterBrush"
  | "shapeBuilder"
  | "text";

export interface BooleanPreviewState {
  op: "union" | "intersect" | "subtract" | "exclude";
  shapes: ShapeContours[];
}

interface UiState {
  mode: AppMode;
  activeTool: ToolId;
  rightTab: RightTab;
  zoom: number;
  panX: number;
  panY: number;
  showGrid: boolean;
  snap: boolean;
  perspective: PerspectiveGrid;
  frameMs: number;
  converting: boolean;
  convertProgressLabel: string;
  hoverNodeId: string | null;
  dirty: boolean;
  booleanPreview: BooleanPreviewState | null;
  shapeBuilderActive: boolean;
  pendingConvertPath: GrantedImageSource | null;
  setMode: (mode: AppMode) => void;
  setActiveTool: (tool: ToolId) => void;
  setRightTab: (tab: RightTab) => void;
  setZoom: (zoom: number) => void;
  setPan: (panX: number, panY: number) => void;
  setShowGrid: (v: boolean) => void;
  setSnap: (v: boolean) => void;
  setPerspectiveMode: (mode: PerspectiveGrid["mode"]) => void;
  setPerspective: (patch: Partial<PerspectiveGrid>) => void;
  setFrameMs: (ms: number) => void;
  setConverting: (v: boolean, label?: string) => void;
  setHoverNodeId: (id: string | null) => void;
  setBooleanPreview: (preview: BooleanPreviewState | null) => void;
  setShapeBuilderActive: (v: boolean) => void;
  setPendingConvertPath: (source: GrantedImageSource | null) => void;
  markDirty: () => void;
  clearDirty: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  mode: "convert",
  activeTool: "select",
  rightTab: "layers",
  zoom: 1,
  panX: 80,
  panY: 60,
  showGrid: true,
  snap: true,
  perspective: defaultPerspectiveGrid(),
  frameMs: 0,
  converting: false,
  convertProgressLabel: "",
  hoverNodeId: null,
  dirty: true,
  booleanPreview: null,
  shapeBuilderActive: false,
  pendingConvertPath: null,
  setMode: (mode) => set((s) => (s.mode === mode ? s : { mode, dirty: true })),
  setActiveTool: (activeTool) =>
    set((s) =>
      s.activeTool === activeTool ? s : { activeTool, booleanPreview: null, dirty: true },
    ),
  setRightTab: (rightTab) => set((s) => (s.rightTab === rightTab ? s : { rightTab })),
  setZoom: (zoom) =>
    set((s) => {
      const next = Math.min(64, Math.max(0.05, zoom));
      return s.zoom === next ? s : { zoom: next, dirty: true };
    }),
  setPan: (panX, panY) =>
    set((s) => (s.panX === panX && s.panY === panY ? s : { panX, panY, dirty: true })),
  setShowGrid: (showGrid) =>
    set((s) => (s.showGrid === showGrid ? s : { showGrid, dirty: true })),
  setSnap: (snap) => set((s) => (s.snap === snap ? s : { snap })),
  setPerspectiveMode: (mode) =>
    set((s) =>
      s.perspective.mode === mode
        ? s
        : { perspective: { ...s.perspective, mode }, dirty: true },
    ),
  setPerspective: (patch) =>
    set((s) => ({
      perspective: { ...s.perspective, ...patch },
      dirty: true,
    })),
  setFrameMs: (frameMs) =>
    set((s) => {
      const next = Math.round(frameMs * 10) / 10;
      return s.frameMs === next ? s : { frameMs: next };
    }),
  setConverting: (converting, label = "") =>
    set((s) =>
      s.converting === converting && s.convertProgressLabel === label
        ? s
        : { converting, convertProgressLabel: label },
    ),
  setHoverNodeId: (hoverNodeId) =>
    set((s) => (s.hoverNodeId === hoverNodeId ? s : { hoverNodeId, dirty: true })),
  setBooleanPreview: (booleanPreview) => set({ booleanPreview, dirty: true }),
  setShapeBuilderActive: (shapeBuilderActive) =>
    set((s) =>
      s.shapeBuilderActive === shapeBuilderActive ? s : { shapeBuilderActive, dirty: true },
    ),
  setPendingConvertPath: (pendingConvertPath) => set({ pendingConvertPath }),
  markDirty: () =>
    set((s) => (s.dirty ? s : { dirty: true })),
  clearDirty: () =>
    set((s) => (s.dirty ? { dirty: false } : s)),
}));
