import type { NodeId, SvgDocument } from "../../shared/document/types";

/**
 * Inspector layer order: last root child is first in the list, groups expand
 * in stored child order. Every node is listed — virtualizing this walk would
 * drop keyboard sibling focus on `[data-list-row]`.
 */
export function layerTreeIds(doc: SvgDocument): NodeId[] {
  const out: NodeId[] = [];
  const walk = (ids: NodeId[]) => {
    for (const id of ids) {
      const node = doc.nodes[id];
      if (!node) continue;
      out.push(id);
      if (node.type === "group") walk(node.children);
    }
  };
  walk([...doc.rootChildIds].reverse());
  return out;
}
