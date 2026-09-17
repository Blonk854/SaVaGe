import { useRef, useState } from "react";
import { Panel } from "../../shared/ui/Panel";
import { ListRow } from "../../shared/ui/ListRow";
import { useDocumentStore } from "../../shared/stores/documentStore";
import type { NodeId, SceneNode } from "../../shared/document/types";

/** Recursive rows keep group subscriptions; order matches `layerTreeIds`. */

function LayerRow({
  id,
  depth,
  first,
}: {
  id: NodeId;
  depth: number;
  first: boolean;
}) {
  const node = useDocumentStore((s) => s.doc.nodes[id]);
  const selected = useDocumentStore((s) => s.selection.includes(id));
  const focusId = useDocumentStore((s) => s.selection[0] ?? null);
  const setSelection = useDocumentStore((s) => s.setSelection);
  const updateNode = useDocumentStore((s) => s.updateNode);
  const [editing, setEditing] = useState(false);
  const skipRename = useRef(false);

  if (!node) return null;
  const tabStop = focusId === id || (!focusId && first);

  return (
    <>
      <ListRow
        id={id}
        label={`${node.name}, ${node.type}`}
        selected={selected}
        tabStop={tabStop}
        onSelect={(nextId) => setSelection([nextId])}
        onRename={() => setEditing(true)}
        className="layer"
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <button
          type="button"
          className="icon"
          title={node.visible ? "Hide" : "Show"}
          aria-label={node.visible ? `Hide ${node.name}` : `Show ${node.name}`}
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
          title={node.locked ? "Unlock" : "Lock"}
          aria-label={node.locked ? `Unlock ${node.name}` : `Lock ${node.name}`}
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
            aria-label={`Rename ${node.name}`}
            onBlur={(e) => {
              if (!skipRename.current) {
                updateNode(id, { name: e.target.value } as Partial<SceneNode>);
              }
              skipRename.current = false;
              setEditing(false);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                skipRename.current = true;
                setEditing(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span>
            {node.name}
            <em>{node.type}</em>
          </span>
        )}
      </ListRow>
      {node.type === "group" &&
        node.children.map((cid) => (
          <LayerRow key={cid} id={cid} depth={depth + 1} first={false} />
        ))}
    </>
  );
}

export function LayersPanel() {
  const rootChildIds = useDocumentStore((s) => s.doc.rootChildIds);
  const ordered = [...rootChildIds].reverse();

  return (
    <Panel title="Layers">
      <div className="layers" role="listbox" aria-label="Layers" data-list-root>
        {ordered.map((id, index) => (
          <LayerRow key={id} id={id} depth={0} first={index === 0} />
        ))}
        {!ordered.length && (
          <p className="sv-empty">No layers yet — convert an image or draw a shape</p>
        )}
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
        .layer:hover,
        .layer:focus-visible { background: rgba(255,255,255,0.04); }
        .layer.selected { background: var(--selection-fill); }
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
      `}</style>
    </Panel>
  );
}
