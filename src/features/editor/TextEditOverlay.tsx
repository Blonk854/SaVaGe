import { useEffect, useRef } from "react";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { useUiStore } from "../../shared/stores/uiStore";
import { worldToScreen } from "../../shared/geometry/transform";
import type { TextNode } from "../../shared/document/types";

interface Props {
  nodeId: string;
  onClose: () => void;
}

export function TextEditOverlay({ nodeId, onClose }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const node = useDocumentStore((s) => s.doc.nodes[nodeId]);
  const updateNode = useDocumentStore((s) => s.updateNode);
  const zoom = useUiStore((s) => s.zoom);
  const panX = useUiStore((s) => s.panX);
  const panY = useUiStore((s) => s.panY);

  const text = node?.type === "text" ? node : undefined;

  useEffect(() => {
    if (text) ref.current?.focus();
  }, [text, nodeId]);

  if (!text) return null;

  const screen = worldToScreen(text.transform.x, text.transform.y, zoom, panX, panY);

  return (
    <input
      ref={ref}
      className="text-edit"
      defaultValue={text.content}
      style={{
        left: screen.x,
        top: screen.y - text.fontSize * zoom,
        fontSize: Math.max(12, text.fontSize * zoom),
        fontFamily: text.fontFamily,
        fontWeight: text.fontWeight,
        minWidth: 120,
      }}
      onBlur={(e) => {
        updateNode(text.id, { content: e.target.value } as Partial<TextNode>);
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
