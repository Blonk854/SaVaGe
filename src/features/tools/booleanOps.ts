import { flattenNodeToShape, type ShapeContours } from "../../shared/geometry/flatten";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { useUiStore } from "../../shared/stores/uiStore";
import {
  computeBooleanShapes,
  shapesToPathNode,
  type BooleanOp,
} from "./booleanCore";

export type { BooleanOp } from "./booleanCore";

function selectionShapes(): { ids: string[]; shapes: ShapeContours[] } {
  const store = useDocumentStore.getState();
  const ids = store.selection.filter((id) => store.doc.nodes[id]);
  const shapes = ids
    .map((id) => flattenNodeToShape(store.doc, id))
    .filter((s): s is ShapeContours => !!s && s.length > 0);
  return { ids, shapes };
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

export async function runBooleanOp(op: BooleanOp): Promise<void> {
  const store = useDocumentStore.getState();
  const { ids, shapes } = selectionShapes();
  if (ids.length < 2) {
    throw new Error("Select at least two shapes for boolean operations");
  }
  if (shapes.length < 2) {
    throw new Error("Selection must include filled shapes (rect, ellipse, closed path)");
  }

  const resultShapes = await computeBooleanShapes(shapes, op);
  if (!resultShapes.length) {
    throw new Error("Boolean operation produced no geometry");
  }

  const styleSource = store.doc.nodes[ids[ids.length - 1]];
  const node = shapesToPathNode(resultShapes, `Boolean ${op}`, styleSource);
  store.deleteNodes(ids);
  store.addNode(node);
  clearBooleanPreview();
  useUiStore.getState().markDirty();
}
