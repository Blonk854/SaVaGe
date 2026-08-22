import { useEffect, useRef } from "react";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { useUiStore } from "../../shared/stores/uiStore";
import { worldToScreen } from "../../shared/geometry/transform";
import type { TextNode } from "../../shared/document/types";

interface Props {
  nodeId: string | null;
  onClose: () => void;
}

export function TextEditOverlay({ nodeId, onClose }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const doc = useDocumentStore((s) => s.doc);
  const updateNode = useDocumentStore((s) => s.updateNode);
  const zoom = useUiStore((s) => s.zoom);
  const panX = useUiStore((s) => s.panX);
  const panY = useUiStore((s) => s.panY);

  const node = nodeId ? (doc.nodes[nodeId] as TextNode | undefined) : undefined;
  const isText = node?.type === "text";

  useEffect(() => {
    if (isText) ref.current?.focus();
  }, [isText, nodeId]);

  if (!isText || !node) return null;

  const screen = worldToScreen(node.transform.x, node.transform.y, zoom, panX, panY);

  return (
    <input
      ref={ref}
      className="text-edit"
      defaultValue={node.content}
      style={{
        left: screen.x,
        top: screen.y - node.fontSize * zoom,
        fontSize: Math.max(12, node.fontSize * zoom),
        fontFamily: node.fontFamily,
        fontWeight: node.fontWeight,
        minWidth: 120,
      }}
      onBlur={(e) => {
        updateNode(node.id, { content: e.target.value } as Partial<TextNode>);
        useUiStore.getState().markDirty();
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur();
        e.stopPropagation();
      }}
    />
  );
}
