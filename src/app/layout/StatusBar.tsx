import { useDocumentStore } from "../../shared/stores/documentStore";
import { useUiStore } from "../../shared/stores/uiStore";

export function StatusBar() {
  const zoom = useUiStore((s) => s.zoom);
  const mode = useUiStore((s) => s.mode);
  const activeTool = useUiStore((s) => s.activeTool);
  const frameMs = useUiStore((s) => s.frameMs);
  const selection = useDocumentStore((s) => s.selection);

  return (
    <footer className="statusbar">
      <span>{Math.round(zoom * 100)}%</span>
      <span className="sep" />
      <span>{selection.length} selected</span>
      <span className="sep" />
      <span className="muted">{mode} · {activeTool}</span>
      <span className="spacer" />
      <span className={frameMs > 16 ? "warn" : "muted"}>{frameMs.toFixed(1)} ms</span>
      <style>{`
        .statusbar {
          height: var(--statusbar-h);
          display: flex;
          align-items: center;
          gap: 0.55rem;
          padding: 0 0.75rem;
          background: #0e1116;
          border-top: 1px solid var(--border);
          font-size: 0.72rem;
          color: var(--fg-1);
          z-index: 2;
        }
        .statusbar .sep {
          width: 1px;
          height: 12px;
          background: var(--border);
        }
        .statusbar .spacer { flex: 1; }
        .statusbar .warn { color: var(--warn); }
      `}</style>
    </footer>
  );
}
