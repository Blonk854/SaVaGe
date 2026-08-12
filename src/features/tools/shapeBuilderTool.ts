import { nanoid } from "nanoid";
import { flattenNodeToShape, type ShapeContours } from "../../shared/geometry/flatten";
import { pointInContours } from "../../shared/geometry/pointInPolygon";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { useUiStore } from "../../shared/stores/uiStore";
import {
  decomposeShapeRegions,
  flattenShapeLists,
  shapesToPathNode,
  tauriOverlay,
} from "./booleanCore";
import type { Tool } from "./types";

export interface ShapeBuilderRegion {
  id: string;
  mask: number;
  contours: ShapeContours[];
  kept: boolean;
}

interface Session {
  sourceIds: string[];
  regions: ShapeBuilderRegion[];
  busy: boolean;
}

let session: Session | null = null;

export function getShapeBuilderSession() {
  return session;
}

export function clearShapeBuilderSession() {
  session = null;
  useUiStore.getState().setShapeBuilderActive(false);
  useUiStore.getState().markDirty();
}

export async function beginShapeBuilder(): Promise<boolean> {
  const s = await ensureSession();
  return !!s?.regions.length;
}

async function ensureSession(): Promise<Session | null> {
  if (session && !session.busy) return session;
  const store = useDocumentStore.getState();
  const ids = store.selection.filter((id) => store.doc.nodes[id]).slice(0, 4);
  const shapes = ids
    .map((id) => flattenNodeToShape(store.doc, id))
    .filter((s): s is ShapeContours => !!s && s.length > 0);
  if (shapes.length < 2) {
    session = null;
    useUiStore.getState().setShapeBuilderActive(false);
    return null;
  }

  session = { sourceIds: ids, regions: [], busy: true };
  useUiStore.getState().setShapeBuilderActive(true);
  try {
    const decomposed = await decomposeShapeRegions(shapes, tauriOverlay);
    session.regions = decomposed.map((r) => ({
      id: nanoid(8),
      mask: r.mask,
      contours: r.contours,
      kept: true,
    }));
  } finally {
    if (session) session.busy = false;
  }
  useUiStore.getState().markDirty();
  return session;
}

export async function commitShapeBuilder(): Promise<void> {
  const s = session;
  if (!s?.regions.length) return;
  const kept = s.regions.filter((r) => r.kept).map((r) => r.contours);
  if (!kept.length) {
    clearShapeBuilderSession();
    return;
  }
  // Union kept fragments
  let result: ShapeContours[] = kept[0];
  for (let i = 1; i < kept.length; i++) {
    result = await tauriOverlay(result, kept[i], "union");
  }
  const store = useDocumentStore.getState();
  const styleSource = store.doc.nodes[s.sourceIds[s.sourceIds.length - 1]];
  const node = shapesToPathNode(result, "Shape Builder", styleSource);
  store.deleteNodes(s.sourceIds);
  store.addNode(node);
  clearShapeBuilderSession();
  useUiStore.getState().setActiveTool("select");
}

export const shapeBuilderTool: Tool = {
  id: "shapeBuilder",
  onPointerDown(e) {
    void (async () => {
      const s = await ensureSession();
      if (!s) return;
      for (const region of s.regions) {
        if (pointInContours(e.wx, e.wy, region.contours)) {
          region.kept = !region.kept;
          useUiStore.getState().markDirty();
          return;
        }
      }
    })();
  },
  onPointerMove() {},
  onPointerUp() {},
  onKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      void commitShapeBuilder();
    }
    if (e.key === "Escape") {
      clearShapeBuilderSession();
      useUiStore.getState().setActiveTool("select");
    }
  },
};

/** Pure helper for tests: toggle keep by point. */
export function toggleRegionAtPoint(
  regions: ShapeBuilderRegion[],
  x: number,
  y: number,
): ShapeBuilderRegion[] {
  return regions.map((r) =>
    pointInContours(x, y, r.contours) ? { ...r, kept: !r.kept } : r,
  );
}

export function keptContoursFlat(regions: ShapeBuilderRegion[]): ShapeContours[] {
  return flattenShapeLists(regions.filter((r) => r.kept).map((r) => r.contours));
}
