import { flattenNodeToShape, type ShapeContours } from "../../shared/geometry/flatten";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { useUiStore } from "../../shared/stores/uiStore";
import {
  computeBooleanShapes,
  shapesToPathNode,
  tauriOverlay,
  type BooleanOp,
  type OverlayFn,
} from "./booleanCore";

export type { BooleanOp } from "./booleanCore";

function selectionShapes(): { ids: string[]; shapes: ShapeContours[] } {
  const store = useDocumentStore.getState();
  const operands = store.selection.flatMap((id) => {
    const shape = flattenNodeToShape(store.doc, id);
    return shape?.length ? [{ id, shape }] : [];
  });
  return {
    ids: operands.map(({ id }) => id),
    shapes: operands.map(({ shape }) => shape),
  };
}

export async function previewBooleanOp(op: BooleanOp): Promise<void> {
  const { shapes } = selectionShapes();
  if (shapes.length < 2) {
    useUiStore.getState().setBooleanPreview(null);
    return;
  }
  try {
    const result = await computeBooleanShapes(shapes, op);
    useUiStore.getState().setBooleanPreview(
      result.length ? { op, shapes: result } : null,
    );
  } catch {
    useUiStore.getState().setBooleanPreview(null);
  }
}

export function clearBooleanPreview() {
  useUiStore.getState().setBooleanPreview(null);
}

export async function runBooleanOp(
  op: BooleanOp,
  overlay: OverlayFn = tauriOverlay,
): Promise<void> {
  const store = useDocumentStore.getState();
  const { ids, shapes } = selectionShapes();
  if (ids.length < 2) {
    throw new Error("Select at least two compatible filled shapes (rect, ellipse, or closed path)");
  }

  const resultShapes = await computeBooleanShapes(shapes, op, overlay);
  if (!resultShapes.length) {
    throw new Error("Boolean operation produced no geometry");
  }

  const styleSource = store.doc.nodes[ids[ids.length - 1]];
  const node = shapesToPathNode(resultShapes, `Boolean ${op}`, styleSource);
  store.replaceNodesWithNode(ids, node);
  clearBooleanPreview();
  useUiStore.getState().markDirty();
}
