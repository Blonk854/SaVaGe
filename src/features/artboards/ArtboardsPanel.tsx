import { useState } from "react";
import { Panel } from "../../shared/ui/Panel";
import { Button } from "../../shared/ui/Button";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { useUiStore } from "../../shared/stores/uiStore";
import { fitToArtboard } from "../editor/camera";
import clsx from "clsx";

export function ArtboardsPanel() {
  const artboards = useDocumentStore((s) => s.doc.artboards);
  const activeId = useDocumentStore((s) => s.doc.activeArtboardId);
  const setActiveArtboard = useDocumentStore((s) => s.setActiveArtboard);
  const addArtboard = useDocumentStore((s) => s.addArtboard);
  const updateArtboard = useDocumentStore((s) => s.updateArtboard);
  const removeArtboard = useDocumentStore((s) => s.removeArtboard);
  const [editing, setEditing] = useState<string | null>(null);

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
          onClick={() => {
            addArtboard();
            useUiStore.getState().markDirty();
          }}
        >
          +
        </Button>
      }
    >
      <div className="abs">
        {artboards.map((ab) => (
          <div
            key={ab.id}
            className={clsx("abs__row", ab.id === activeId && "active")}
            onClick={() => activate(ab.id)}
          >
            {editing === ab.id ? (
              <input
                autoFocus
                defaultValue={ab.name}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  updateArtboard(ab.id, { name: e.target.value || ab.name });
                  setEditing(null);
                  useUiStore.getState().markDirty();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
            ) : (
              <span onDoubleClick={() => setEditing(ab.id)}>{ab.name}</span>
            )}
            <em>
              {Math.round(ab.width)}×{Math.round(ab.height)}
            </em>
            <button
              type="button"
              className="abs__del"
              title="Delete artboard"
              disabled={artboards.length <= 1}
              onClick={(e) => {
                e.stopPropagation();
                removeArtboard(ab.id);
                useUiStore.getState().markDirty();
              }}
            >
              ×
            </button>
          </div>
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
        .abs__row:hover { background: rgba(255,255,255,0.04); }
        .abs__row.active {
          background: rgba(184,255,60,0.12);
          color: var(--accent);
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
