import { simplifyPolyline } from "../../shared/geometry/path";
import type { PathNode } from "../../shared/document/types";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { useUiStore } from "../../shared/stores/uiStore";
import { nanoid } from "nanoid";

export function simplifySelection(epsilon = 1.5) {
  const store = useDocumentStore.getState();
  for (const id of store.selection) {
    const node = store.doc.nodes[id];
    if (!node || node.type !== "path") continue;
    const subpaths = node.subpaths.map((sp) => {
      const simplified = simplifyPolyline(
        sp.points.map((p) => ({ x: p.x, y: p.y })),
        epsilon,
      );
      return {
        ...sp,
        points: simplified.map((p) => ({
          id: nanoid(8),
          x: p.x,
          y: p.y,
          type: "corner" as const,
        })),
      };
    });
    store.updateNode(id, { subpaths } as Partial<PathNode>);
  }
  useUiStore.getState().markDirty();
}
