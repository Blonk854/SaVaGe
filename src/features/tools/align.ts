import { useDocumentStore } from "../../shared/stores/documentStore";
import { nodeWorldBounds, selectionBounds } from "../../shared/geometry/bounds";

export type AlignMode =
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "bottom"
  | "distribute-h"
  | "distribute-v";

export function alignSelection(mode: AlignMode) {
  const store = useDocumentStore.getState();
  const ids = store.selection;
  if (ids.length < 2 && !mode.startsWith("distribute")) return;
  const bounds = selectionBounds(store.doc, ids);

  if (mode.startsWith("distribute") && ids.length < 3) return;

  if (!mode.startsWith("distribute")) {
    for (const id of ids) {
      const node = store.doc.nodes[id];
      if (!node) continue;
      const b = nodeWorldBounds(store.doc, id);
      let dx = 0;
      let dy = 0;
      if (mode === "left") dx = bounds.x - b.x;
      if (mode === "center") dx = bounds.x + bounds.w / 2 - (b.x + b.w / 2);
      if (mode === "right") dx = bounds.x + bounds.w - (b.x + b.w);
      if (mode === "top") dy = bounds.y - b.y;
      if (mode === "middle") dy = bounds.y + bounds.h / 2 - (b.y + b.h / 2);
      if (mode === "bottom") dy = bounds.y + bounds.h - (b.y + b.h);
      store.setNodeTransform(id, {
        ...node.transform,
        x: node.transform.x + dx,
        y: node.transform.y + dy,
      });
    }
    return;
  }

  const sorted = [...ids].sort((a, b) => {
    const ba = nodeWorldBounds(store.doc, a);
    const bb = nodeWorldBounds(store.doc, b);
    return mode === "distribute-h" ? ba.x - bb.x : ba.y - bb.y;
  });
  const first = nodeWorldBounds(store.doc, sorted[0]);
  const last = nodeWorldBounds(store.doc, sorted[sorted.length - 1]);
  const span =
    mode === "distribute-h"
      ? last.x + last.w - first.x
      : last.y + last.h - first.y;
  const totalSize = sorted.reduce((acc, id) => {
    const b = nodeWorldBounds(store.doc, id);
    return acc + (mode === "distribute-h" ? b.w : b.h);
  }, 0);
  const gap = (span - totalSize) / (sorted.length - 1);
  let cursor = mode === "distribute-h" ? first.x : first.y;
  for (const id of sorted) {
    const node = store.doc.nodes[id];
    const b = nodeWorldBounds(store.doc, id);
    if (mode === "distribute-h") {
      const dx = cursor - b.x;
      store.setNodeTransform(id, { ...node.transform, x: node.transform.x + dx });
      cursor += b.w + gap;
    } else {
      const dy = cursor - b.y;
      store.setNodeTransform(id, { ...node.transform, y: node.transform.y + dy });
      cursor += b.h + gap;
    }
  }
}
