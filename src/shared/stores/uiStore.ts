import { create } from "zustand";
import type { ShapeContours } from "../geometry/flatten";
import {
  defaultPerspectiveGrid,
  type PerspectiveGrid,
} from "../geometry/perspective";

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
  pendingConvertPath: string | null;
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
  setPendingConvertPath: (path: string | null) => void;
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
  setMode: (mode) => set({ mode, dirty: true }),
  setActiveTool: (activeTool) =>
    set({ activeTool, booleanPreview: null, dirty: true }),
  setRightTab: (rightTab) => set({ rightTab }),
  setZoom: (zoom) => set({ zoom: Math.min(64, Math.max(0.05, zoom)), dirty: true }),
  setPan: (panX, panY) => set({ panX, panY, dirty: true }),
  setShowGrid: (showGrid) => set({ showGrid, dirty: true }),
  setSnap: (snap) => set({ snap }),
  setPerspectiveMode: (mode) =>
    set((s) => ({
      perspective: { ...s.perspective, mode },
      dirty: true,
    })),
  setPerspective: (patch) =>
    set((s) => ({
      perspective: { ...s.perspective, ...patch },
      dirty: true,
    })),
  setFrameMs: (frameMs) => set({ frameMs }),
  setConverting: (converting, label = "") =>
    set({ converting, convertProgressLabel: label }),
  setHoverNodeId: (hoverNodeId) => set({ hoverNodeId, dirty: true }),
  setBooleanPreview: (booleanPreview) => set({ booleanPreview, dirty: true }),
  setShapeBuilderActive: (shapeBuilderActive) => set({ shapeBuilderActive, dirty: true }),
  setPendingConvertPath: (pendingConvertPath) => set({ pendingConvertPath }),
  markDirty: () => set({ dirty: true }),
  clearDirty: () => set({ dirty: false }),
}));
