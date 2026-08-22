import { useEffect, useRef, useState, type ReactNode } from "react";
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

type MenuId = "file" | "edit" | "object" | "view" | "help";

function Menu({
  id,
  label,
  open,
  onOpen,
  children,
}: {
  id: MenuId;
  label: string;
  open: MenuId | null;
  onOpen: (id: MenuId | null) => void;
  children: ReactNode;
}) {
  const isOpen = open === id;
  return (
    <div
      className={`menu${isOpen ? " menu--open" : ""}`}
      onMouseEnter={() => {
        if (open) onOpen(id);
      }}
    >
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="true"
        onClick={(e) => {
          e.stopPropagation();
          onOpen(isOpen ? null : id);
        }}
      >
        {label}
      </button>
      <div className="menu__fly" role="menu">
        {children}
      </div>
    </div>
  );
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
  const [open, setOpen] = useState<MenuId | null>(null);
  const navRef = useRef<HTMLElement>(null);

  const close = () => {
    setOpen(null);
    onBooleanPreview?.(null);
  };

  const run = (fn: () => void) => () => {
    close();
    fn();
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (navRef.current?.contains(e.target as Node)) return;
      close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <header className="titlebar">
      <div className="titlebar__brand">
        <img src={iconUrl} alt="" width={22} height={22} />
        <span className="wordmark">SaVaGe</span>
      </div>
      <nav ref={navRef} className="titlebar__menu" aria-label="Application menu">
        <Menu id="file" label="File" open={open} onOpen={setOpen}>
          <button type="button" onClick={run(onOpen)}>Open…</button>
          <button type="button" onClick={run(onSave)}>Save Project…</button>
          <button type="button" onClick={run(onExportSvg)}>Export SVG…</button>
          <button type="button" onClick={run(onExportPng)}>Export PNG…</button>
        </Menu>
        <Menu id="edit" label="Edit" open={open} onOpen={setOpen}>
          <button type="button" onClick={run(onUndo)}>Undo</button>
          <button type="button" onClick={run(onRedo)}>Redo</button>
          <button type="button" onClick={run(onCopy)}>Copy</button>
          <button type="button" onClick={run(onPaste)}>Paste</button>
        </Menu>
        <Menu id="object" label="Object" open={open} onOpen={setOpen}>
          <button type="button" onClick={run(onGroup)}>Group</button>
          <button type="button" onClick={run(onUngroup)}>Ungroup</button>
          <button
            type="button"
            onMouseEnter={() => onBooleanPreview?.("union")}
            onMouseLeave={() => onBooleanPreview?.(null)}
            onClick={run(() => onBoolean("union"))}
          >
            Unite
          </button>
          <button
            type="button"
            onMouseEnter={() => onBooleanPreview?.("intersect")}
            onMouseLeave={() => onBooleanPreview?.(null)}
            onClick={run(() => onBoolean("intersect"))}
          >
            Intersect
          </button>
          <button
            type="button"
            onMouseEnter={() => onBooleanPreview?.("subtract")}
            onMouseLeave={() => onBooleanPreview?.(null)}
            onClick={run(() => onBoolean("subtract"))}
          >
            Subtract
          </button>
          <button
            type="button"
            onMouseEnter={() => onBooleanPreview?.("exclude")}
            onMouseLeave={() => onBooleanPreview?.(null)}
            onClick={run(() => onBoolean("exclude"))}
          >
            Exclude
          </button>
          <button type="button" onClick={run(onSimplify)}>Simplify Path</button>
          <button type="button" onClick={run(onConvertOutlines)}>Convert Text to Outlines</button>
          <button type="button" onClick={run(onApplyClip)}>Make Clip Mask</button>
          <button type="button" onClick={run(onReleaseClip)}>Release Clip Mask</button>
          <button type="button" onClick={run(onCreateSymbol)}>Create Symbol</button>
          <button type="button" onClick={run(onDetachSymbol)}>Detach Symbol</button>
          <button type="button" onClick={run(onCommitShapeBuilder)}>Commit Shape Builder</button>
          <button type="button" onClick={run(onAddArtboard)}>New Artboard</button>
        </Menu>
        <Menu id="view" label="View" open={open} onOpen={setOpen}>
          <button type="button" onClick={run(onFitArtboard)}>Fit Artboard</button>
          <button type="button" onClick={run(onFitAllArtboards)}>Fit All Artboards</button>
          <button type="button" onClick={run(onFitSelection)}>Fit Selection</button>
          <button type="button" onClick={run(() => onZoom(0.5))}>Zoom 50%</button>
          <button type="button" onClick={run(() => onZoom(1))}>Zoom 100%</button>
          <button type="button" onClick={run(() => onZoom(2))}>Zoom 200%</button>
        </Menu>
        <Menu id="help" label="Help" open={open} onOpen={setOpen}>
          <button type="button" onClick={run(onOpenManual)}>
            User Manual (PDF)…
          </button>
        </Menu>
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
        .menu > button:hover,
        .menu--open > button {
          background: rgba(255,255,255,0.05);
          color: var(--fg-0);
        }
        .menu__fly {
          display: none;
          position: absolute;
          top: 100%;
          left: 0;
          min-width: 220px;
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.25rem;
          box-shadow: var(--shadow-soft);
          z-index: 40;
        }
        .menu--open .menu__fly { display: grid; }
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
