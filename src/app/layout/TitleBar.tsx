import iconUrl from "../../assets/icon.svg";

interface Props {
  onOpen: () => void;
  onSave: () => void;
  onExportSvg: () => void;
  onExportPng: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onBoolean: (op: "union" | "intersect" | "subtract" | "exclude") => void;
  onBooleanPreview?: (op: "union" | "intersect" | "subtract" | "exclude" | null) => void;
  onSimplify: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onConvertOutlines: () => void;
  onFitArtboard: () => void;
  onFitAllArtboards: () => void;
  onFitSelection: () => void;
  onZoom: (z: number) => void;
  onApplyClip: () => void;
  onReleaseClip: () => void;
  onAddArtboard: () => void;
  onCreateSymbol: () => void;
  onDetachSymbol: () => void;
  onCommitShapeBuilder: () => void;
  onOpenManual: () => void;
}

export function TitleBar({
  onOpen,
  onSave,
  onExportSvg,
  onExportPng,
  onUndo,
  onRedo,
  onCopy,
  onPaste,
  onBoolean,
  onBooleanPreview,
  onSimplify,
  onGroup,
  onUngroup,
  onConvertOutlines,
  onFitArtboard,
  onFitAllArtboards,
  onFitSelection,
  onZoom,
  onApplyClip,
  onReleaseClip,
  onAddArtboard,
  onCreateSymbol,
  onDetachSymbol,
  onCommitShapeBuilder,
  onOpenManual,
}: Props) {
  return (
    <header className="titlebar">
      <div className="titlebar__brand">
        <img src={iconUrl} alt="" width={22} height={22} />
        <span className="wordmark">SaVaGe</span>
      </div>
      <nav className="titlebar__menu" aria-label="Application menu">
        <div className="menu">
          <button type="button">File</button>
          <div className="menu__fly">
            <button type="button" onClick={onOpen}>Open…</button>
            <button type="button" onClick={onSave}>Save Project…</button>
            <button type="button" onClick={onExportSvg}>Export SVG…</button>
            <button type="button" onClick={onExportPng}>Export PNG…</button>
          </div>
        </div>
        <div className="menu">
          <button type="button">Edit</button>
          <div className="menu__fly">
            <button type="button" onClick={onUndo}>Undo</button>
            <button type="button" onClick={onRedo}>Redo</button>
            <button type="button" onClick={onCopy}>Copy</button>
            <button type="button" onClick={onPaste}>Paste</button>
          </div>
        </div>
        <div className="menu">
          <button type="button">Object</button>
          <div className="menu__fly">
            <button type="button" onClick={onGroup}>Group</button>
            <button type="button" onClick={onUngroup}>Ungroup</button>
            <button
              type="button"
              onMouseEnter={() => onBooleanPreview?.("union")}
              onMouseLeave={() => onBooleanPreview?.(null)}
              onClick={() => onBoolean("union")}
            >
              Unite
            </button>
            <button
              type="button"
              onMouseEnter={() => onBooleanPreview?.("intersect")}
              onMouseLeave={() => onBooleanPreview?.(null)}
              onClick={() => onBoolean("intersect")}
            >
              Intersect
            </button>
            <button
              type="button"
              onMouseEnter={() => onBooleanPreview?.("subtract")}
              onMouseLeave={() => onBooleanPreview?.(null)}
              onClick={() => onBoolean("subtract")}
            >
              Subtract
            </button>
            <button
              type="button"
              onMouseEnter={() => onBooleanPreview?.("exclude")}
              onMouseLeave={() => onBooleanPreview?.(null)}
              onClick={() => onBoolean("exclude")}
            >
              Exclude
            </button>
            <button type="button" onClick={onSimplify}>Simplify Path</button>
            <button type="button" onClick={onConvertOutlines}>Convert Text to Outlines</button>
            <button type="button" onClick={onApplyClip}>Make Clip Mask</button>
            <button type="button" onClick={onReleaseClip}>Release Clip Mask</button>
            <button type="button" onClick={onCreateSymbol}>Create Symbol</button>
            <button type="button" onClick={onDetachSymbol}>Detach Symbol</button>
            <button type="button" onClick={onCommitShapeBuilder}>Commit Shape Builder</button>
            <button type="button" onClick={onAddArtboard}>New Artboard</button>
          </div>
        </div>
        <div className="menu">
          <button type="button">View</button>
          <div className="menu__fly">
            <button type="button" onClick={onFitArtboard}>Fit Artboard</button>
            <button type="button" onClick={onFitAllArtboards}>Fit All Artboards</button>
            <button type="button" onClick={onFitSelection}>Fit Selection</button>
            <button type="button" onClick={() => onZoom(0.5)}>Zoom 50%</button>
            <button type="button" onClick={() => onZoom(1)}>Zoom 100%</button>
            <button type="button" onClick={() => onZoom(2)}>Zoom 200%</button>
          </div>
        </div>
        <div className="menu">
          <button type="button">Help</button>
          <div className="menu__fly">
            <button type="button" onClick={onOpenManual}>
              User Manual (PDF)…
            </button>
          </div>
        </div>
      </nav>
      <style>{`
        .titlebar {
          height: var(--titlebar-h);
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0 0.75rem;
          background: linear-gradient(180deg, #151922 0%, var(--bg-1) 100%);
          border-bottom: 1px solid var(--border);
          z-index: 2;
        }
        .titlebar__brand {
          display: flex;
          align-items: center;
          gap: 0.45rem;
        }
        .titlebar__brand .wordmark {
          font-size: 0.95rem;
        }
        .titlebar__brand img {
          filter: drop-shadow(0 0 8px rgba(184,255,60,0.25));
        }
        .titlebar__menu {
          display: flex;
          gap: 0.15rem;
        }
        .menu { position: relative; }
        .menu > button {
          background: transparent;
          border: 0;
          color: var(--fg-1);
          padding: 0.3rem 0.55rem;
          border-radius: 6px;
        }
        .menu > button:hover { background: rgba(255,255,255,0.05); color: var(--fg-0); }
        .menu__fly {
          display: none;
          position: absolute;
          top: 100%;
          left: 0;
          min-width: 180px;
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.25rem;
          box-shadow: var(--shadow-soft);
          z-index: 20;
        }
        .menu:hover .menu__fly, .menu:focus-within .menu__fly { display: grid; }
        .menu__fly button {
          text-align: left;
          background: transparent;
          border: 0;
          padding: 0.45rem 0.6rem;
          border-radius: 6px;
          color: var(--fg-0);
        }
        .menu__fly button:hover { background: rgba(184,255,60,0.1); }
      `}</style>
    </header>
  );
}
