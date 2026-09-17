import { useRef, useState } from "react";
import { Panel } from "../../shared/ui/Panel";
import { Button } from "../../shared/ui/Button";
import { ListRow } from "../../shared/ui/ListRow";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { useUiStore } from "../../shared/stores/uiStore";
import { fitToArtboard } from "../editor/camera";

export function ArtboardsPanel() {
  const artboards = useDocumentStore((s) => s.doc.artboards);
  const activeId = useDocumentStore((s) => s.doc.activeArtboardId);
  const setActiveArtboard = useDocumentStore((s) => s.setActiveArtboard);
  const addArtboard = useDocumentStore((s) => s.addArtboard);
  const updateArtboard = useDocumentStore((s) => s.updateArtboard);
  const removeArtboard = useDocumentStore((s) => s.removeArtboard);
  const [editing, setEditing] = useState<string | null>(null);
  const skipRename = useRef(false);

  const activate = (id: string) => {
    setActiveArtboard(id);
    useUiStore.getState().markDirty();
    const el = document.querySelector(".shell__main") as HTMLElement | null;
    if (el) fitToArtboard(el.clientWidth, el.clientHeight);
  };

  return (
    <Panel
      title="Artboards"
      actions={
        <Button
          variant="ghost"
          aria-label="Add artboard"
          title="Add artboard"
          onClick={() => {
            addArtboard();
            useUiStore.getState().markDirty();
          }}
        >
          +
        </Button>
      }
    >
      <div className="abs" role="listbox" aria-label="Artboards" data-list-root>
        {artboards.map((ab, index) => (
          <ListRow
            key={ab.id}
            id={ab.id}
            label={`${ab.name}, ${Math.round(ab.width)} by ${Math.round(ab.height)}`}
            selected={ab.id === activeId}
            tabStop={ab.id === activeId || (index === 0 && !artboards.some((item) => item.id === activeId))}
            onSelect={activate}
            onRename={() => setEditing(ab.id)}
            className="abs__row"
          >
            {editing === ab.id ? (
              <input
                autoFocus
                defaultValue={ab.name}
                aria-label={`Rename ${ab.name}`}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  if (!skipRename.current) {
                    updateArtboard(ab.id, { name: e.target.value || ab.name });
                    useUiStore.getState().markDirty();
                  }
                  skipRename.current = false;
                  setEditing(null);
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") {
                    skipRename.current = true;
                    setEditing(null);
                  }
                }}
              />
            ) : (
              <span>{ab.name}</span>
            )}
            <em>
              {Math.round(ab.width)}×{Math.round(ab.height)}
            </em>
            <button
              type="button"
              className="abs__del"
              title={artboards.length <= 1 ? "Keep at least one artboard" : "Delete artboard"}
              aria-label={`Delete ${ab.name}`}
              disabled={artboards.length <= 1}
              onClick={(e) => {
                e.stopPropagation();
                removeArtboard(ab.id);
                useUiStore.getState().markDirty();
              }}
            >
              ×
            </button>
          </ListRow>
        ))}
      </div>
      <style>{`
        .abs { display: grid; gap: 2px; }
        .abs__row {
          display: grid;
          grid-template-columns: 1fr auto auto;
          gap: 0.35rem;
          align-items: center;
          padding: 0.4rem 0.45rem;
          border-radius: 6px;
          font-size: 0.8rem;
          cursor: pointer;
        }
        .abs__row:hover,
        .abs__row:focus-visible { background: rgba(255,255,255,0.04); }
        .abs__row.selected,
        .abs__row.active {
          background: var(--selection-fill);
          color: var(--selection-fg);
        }
        .abs__row em {
          font-style: normal;
          color: var(--fg-1);
          font-size: 0.68rem;
        }
        .abs__row input {
          width: 100%;
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 0.15rem 0.3rem;
          color: var(--fg-0);
        }
        .abs__del {
          border: 0;
          background: transparent;
          color: var(--fg-1);
          width: 1.2rem;
          padding: 0;
        }
        .abs__del:disabled { opacity: 0.3; }
        .sv-panel__head .sv-btn { padding: 0.15rem 0.45rem; min-width: 28px; }
      `}</style>
    </Panel>
  );
}
