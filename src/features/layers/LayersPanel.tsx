import { useState } from "react";
import { Panel } from "../../shared/ui/Panel";
import { useDocumentStore } from "../../shared/stores/documentStore";
import type { NodeId, SceneNode } from "../../shared/document/types";
import clsx from "clsx";

function LayerRow({
  id,
  depth,
}: {
  id: NodeId;
  depth: number;
}) {
  const node = useDocumentStore((s) => s.doc.nodes[id]);
  const selection = useDocumentStore((s) => s.selection);
  const setSelection = useDocumentStore((s) => s.setSelection);
  const updateNode = useDocumentStore((s) => s.updateNode);
  const reorderInParent = useDocumentStore((s) => s.reorderInParent);
  const [editing, setEditing] = useState(false);

  if (!node) return null;

  return (
    <>
      <div
        className={clsx("layer", selection.includes(id) && "selected")}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => setSelection([id])}
        draggable
        onDragStart={(e) => e.dataTransfer.setData("text/plain", id)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const dragged = e.dataTransfer.getData("text/plain");
          if (!dragged || dragged === id) return;
          const root = useDocumentStore.getState().doc.rootChildIds;
          const idx = root.indexOf(id);
          if (idx >= 0) reorderInParent(dragged, idx);
        }}
      >
        <button
          type="button"
          className="icon"
          title="Visibility"
          onClick={(e) => {
            e.stopPropagation();
            updateNode(id, { visible: !node.visible } as Partial<SceneNode>);
          }}
        >
          {node.visible ? "o" : "-"}
        </button>
        <button
          type="button"
          className="icon"
          title="Lock"
          onClick={(e) => {
            e.stopPropagation();
            updateNode(id, { locked: !node.locked } as Partial<SceneNode>);
          }}
        >
          {node.locked ? "L" : "U"}
        </button>
        {editing ? (
          <input
            autoFocus
            defaultValue={node.name}
            onBlur={(e) => {
              updateNode(id, { name: e.target.value } as Partial<SceneNode>);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span onDoubleClick={() => setEditing(true)}>
            {node.name}
            <em>{node.type}</em>
          </span>
        )}
      </div>
      {node.type === "group" &&
        node.children.map((cid) => <LayerRow key={cid} id={cid} depth={depth + 1} />)}
    </>
  );
}

export function LayersPanel() {
  const rootChildIds = useDocumentStore((s) => s.doc.rootChildIds);
  return (
    <Panel title="Layers">
      <div className="layers">
        {[...rootChildIds].reverse().map((id) => (
          <LayerRow key={id} id={id} depth={0} />
        ))}
        {!rootChildIds.length && <p className="muted empty">No layers yet</p>}
      </div>
      <style>{`
        .layers { display: grid; gap: 2px; }
        .layer {
          display: grid;
          grid-template-columns: auto auto 1fr;
          align-items: center;
          gap: 0.25rem;
          padding: 0.3rem 0.4rem;
          border-radius: 6px;
          font-size: 0.8rem;
          cursor: pointer;
        }
        .layer:hover { background: rgba(255,255,255,0.04); }
        .layer.selected { background: rgba(184,255,60,0.12); }
        .layer .icon {
          border: 0;
          background: transparent;
          color: var(--fg-1);
          padding: 0;
          width: 1.2rem;
        }
        .layer span {
          display: flex;
          justify-content: space-between;
          gap: 0.4rem;
          min-width: 0;
        }
        .layer em {
          font-style: normal;
          color: var(--fg-1);
          font-size: 0.68rem;
          text-transform: uppercase;
        }
        .layer input {
          width: 100%;
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 0.15rem 0.3rem;
        }
        .empty { margin: 0.5rem; font-size: 0.8rem; }
      `}</style>
    </Panel>
  );
}
