import { Panel } from "../../shared/ui/Panel";
import { Button } from "../../shared/ui/Button";
import { focusListSibling } from "../../shared/ui/keyboard";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { useUiStore } from "../../shared/stores/uiStore";

export function SymbolsPanel() {
  const symbols = useDocumentStore((s) => s.doc.symbols);
  const hasSelection = useDocumentStore((s) => s.selection.length > 0);
  const selectedIsInstance = useDocumentStore((s) => {
    const id = s.selection[0];
    return id ? s.doc.nodes[id]?.type === "symbolInstance" : false;
  });
  const createSymbolFromSelection = useDocumentStore((s) => s.createSymbolFromSelection);
  const placeSymbol = useDocumentStore((s) => s.placeSymbol);
  const detachSymbol = useDocumentStore((s) => s.detachSymbol);
  const deleteSymbol = useDocumentStore((s) => s.deleteSymbol);
  const list = Object.values(symbols ?? {});

  return (
    <Panel
      title="Symbols"
      actions={
          <Button
            variant="ghost"
            disabled={!hasSelection}
            title={hasSelection ? "Create a symbol from the selection" : "Select objects to create a symbol"}
            onClick={() => {
            createSymbolFromSelection();
            useUiStore.getState().markDirty();
          }}
        >
          +
        </Button>
      }
    >
        <div className="syms" data-list-root>
        <div className="syms__actions">
          <Button
            variant="subtle"
            disabled={!hasSelection}
            title={hasSelection ? "Create a symbol from the selection" : "Select objects to create a symbol"}
            onClick={() => {
              createSymbolFromSelection();
              useUiStore.getState().markDirty();
            }}
          >
            Create from selection
          </Button>
          <Button
            variant="subtle"
            disabled={!selectedIsInstance}
            title={selectedIsInstance ? "Detach the selected instance" : "Select a symbol instance to detach"}
            onClick={() => {
              detachSymbol();
              useUiStore.getState().markDirty();
            }}
          >
            Detach instance
          </Button>
        </div>
        {!list.length && <p className="sv-empty">No symbols yet</p>}
        {list.map((sym) => (
          <div key={sym.id} className="syms__row">
            <button
              type="button"
              className="syms__name"
              data-list-row
              data-id={sym.id}
              aria-label={`Place ${sym.name}`}
              onClick={() => {
                placeSymbol(sym.id);
                useUiStore.getState().markDirty();
              }}
              onKeyDown={(event) => {
                if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                event.preventDefault();
                focusListSibling(event.currentTarget, event.key === "ArrowDown" ? 1 : -1);
              }}
              title="Place instance"
            >
              <span>{sym.name}</span>
              <em>
                {Math.round(sym.width)}×{Math.round(sym.height)}
              </em>
            </button>
            <button
              type="button"
              className="syms__del"
              title="Delete symbol definition"
              onClick={() => {
                deleteSymbol(sym.id);
                useUiStore.getState().markDirty();
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <style>{`
        .syms { display: grid; gap: 0.35rem; }
        .syms__actions { display: grid; gap: 0.35rem; margin-bottom: 0.35rem; }
        .syms__row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 0.25rem;
          align-items: center;
        }
        .syms__name {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 0.35rem;
          align-items: center;
          text-align: left;
          padding: 0.4rem 0.45rem;
          border-radius: 6px;
          border: 0;
          background: transparent;
          color: var(--fg-0);
          font-size: 0.8rem;
          cursor: pointer;
        }
        .syms__name:hover { background: rgba(184,255,60,0.1); }
        .syms__name em {
          font-style: normal;
          color: var(--fg-1);
          font-size: 0.68rem;
        }
        .syms__del {
          border: 0;
          background: transparent;
          color: var(--fg-1);
          width: 1.2rem;
          padding: 0;
        }
        .empty { font-size: 0.78rem; padding: 0.35rem; }
        .sv-panel__head .sv-btn { padding: 0.15rem 0.45rem; min-width: 28px; }
      `}</style>
    </Panel>
  );
}
