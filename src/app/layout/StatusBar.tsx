import { useEffect, useRef, useState } from "react";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { useUiStore } from "../../shared/stores/uiStore";
import { useProjectSaveLabel } from "../../shared/stores/projectSaveLabel";

export function StatusBar() {
  const zoomPercent = useUiStore((s) => Math.round(s.zoom * 100));
  const mode = useUiStore((s) => s.mode);
  const activeTool = useUiStore((s) => s.activeTool);
  const frameMs = useUiStore((s) => s.frameMs);
  const selectionCount = useDocumentStore((s) => s.selection.length);
  const selectionKey = useDocumentStore((s) => s.selection.join("\0"));
  const saveLabel = useProjectSaveLabel();
  const [announcement, setAnnouncement] = useState("");
  const lastSelectionKey = useRef<string | null>(null);

  useEffect(() => {
    if (lastSelectionKey.current === null) {
      lastSelectionKey.current = selectionKey;
      return;
    }
    if (lastSelectionKey.current === selectionKey) return;
    lastSelectionKey.current = selectionKey;
    const { doc, selection } = useDocumentStore.getState();
    setAnnouncement(
      selectionCount === 0
        ? "Nothing selected"
        : selectionCount === 1
          ? `${doc.nodes[selection[0]]?.name ?? "Object"} selected`
          : `${selectionCount} objects selected`,
    );
  }, [selectionCount, selectionKey]);

  return (
    <footer className="statusbar" aria-label="Status">
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
      <span>{zoomPercent}%</span>
      <span className="sep" />
      <span>{selectionCount} selected</span>
      <span className="sep" />
      <span className="muted">{mode} · {activeTool}</span>
      <span className="spacer" />
      <span className={saveLabel === "Saved" ? "muted" : "warn"}>{saveLabel}</span>
      <span className="sep" />
      <span className={frameMs > 16 ? "warn" : "muted"}>{frameMs.toFixed(1)} ms</span>
      <style>{`
        .statusbar {
          min-height: var(--statusbar-h);
          height: auto;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.35rem 0.55rem;
          padding: 0.15rem 0.75rem;
          background: var(--bg-0);
          border-top: 1px solid var(--border);
          font-size: var(--text-xs);
          color: var(--fg-1);
          z-index: 2;
        }
        .statusbar > :not(.spacer) { flex-shrink: 0; }
        .statusbar .sep {
          width: 1px;
          height: 12px;
          background: var(--border);
        }
        .statusbar .spacer { flex: 1 1 4rem; min-width: 0.25rem; }
        .statusbar .warn { color: var(--warn); }
      `}</style>
    </footer>
  );
}
