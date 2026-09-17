import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import iconUrl from "../../assets/icon.svg";
import { adjacentIndex } from "../../shared/ui/keyboard";

interface Props {
  documentTitle: string;
  modified: boolean;
  saveLabel: string;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
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
  onExportDiagnostics: () => void;
  onAbout: () => void;
}

type MenuId = "file" | "edit" | "object" | "view" | "help";
const MENU_IDS: MenuId[] = ["file", "edit", "object", "view", "help"];

function menuItems(root: HTMLElement | null, id: MenuId) {
  return [...(root?.querySelectorAll<HTMLElement>(`#menu-${id} [role="menuitem"]`) ?? [])];
}

function menuButton(root: HTMLElement | null, id: MenuId) {
  return root?.querySelector<HTMLButtonElement>(`[data-menubar-button][data-menu="${id}"]`);
}

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
      data-menu={id}
      onMouseEnter={() => {
        if (open) onOpen(id);
      }}
    >
      <button
        type="button"
        data-menubar-button
        data-menu={id}
        role="menuitem"
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-controls={`menu-${id}`}
        onClick={(e) => {
          e.stopPropagation();
          onOpen(isOpen ? null : id);
        }}
      >
        {label}
      </button>
      <div className="menu__fly" role="menu" id={`menu-${id}`}>
        {children}
      </div>
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  onFocus,
  onMouseEnter,
  onMouseLeave,
}: {
  children: ReactNode;
  onClick: () => void;
  onFocus?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      onFocus={onFocus}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </button>
  );
}

export function TitleBar({
  documentTitle,
  modified,
  saveLabel,
  onNew,
  onOpen,
  onSave,
  onSaveAs,
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
  onExportDiagnostics,
  onAbout,
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
    menuItems(navRef.current, open)[0]?.focus();
  }, [open]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (navRef.current?.contains(e.target as Node)) return;
      close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F10") {
        e.preventDefault();
        menuButton(navRef.current, "file")?.focus();
        return;
      }
      if (e.key !== "Escape" || !open) return;
      e.preventDefault();
      const current = open;
      close();
      menuButton(navRef.current, current)?.focus();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const nav = navRef.current;

    if (open) {
      const items = menuItems(nav, open);
      const index = items.indexOf(target);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        items[adjacentIndex(index < 0 ? 0 : index, event.key === "ArrowDown" ? 1 : -1, items.length)]?.focus();
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        items[0]?.focus();
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        items[items.length - 1]?.focus();
        return;
      }
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        onBooleanPreview?.(null);
        const next = MENU_IDS[adjacentIndex(MENU_IDS.indexOf(open), event.key === "ArrowRight" ? 1 : -1, MENU_IDS.length)];
        setOpen(next);
        return;
      }
      if (event.key === "Tab") {
        close();
      }
      return;
    }

    if (!target.matches("[data-menubar-button]")) return;
    const id = target.getAttribute("data-menu") as MenuId | null;
    if (!id) return;
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(id);
      return;
    }
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const next = MENU_IDS[adjacentIndex(MENU_IDS.indexOf(id), event.key === "ArrowRight" ? 1 : -1, MENU_IDS.length)];
      menuButton(nav, next)?.focus();
    }
  };

  return (
    <header className="titlebar">
      <div className="titlebar__brand">
        <img src={iconUrl} alt="" width={22} height={22} />
        <span className="wordmark">SaVaGe</span>
      </div>
      <nav
        ref={navRef}
        className="titlebar__menu"
        aria-label="Application menu"
        role="menubar"
        onKeyDown={onMenuKeyDown}
      >
        <Menu id="file" label="File" open={open} onOpen={setOpen}>
          <MenuItem onClick={run(onNew)}>New</MenuItem>
          <MenuItem onClick={run(onOpen)}>Open…</MenuItem>
          <MenuItem onClick={run(onSave)}>Save</MenuItem>
          <MenuItem onClick={run(onSaveAs)}>Save As…</MenuItem>
          <MenuItem onClick={run(onExportSvg)}>Export SVG…</MenuItem>
          <MenuItem onClick={run(onExportPng)}>Export PNG…</MenuItem>
        </Menu>
        <Menu id="edit" label="Edit" open={open} onOpen={setOpen}>
          <MenuItem onClick={run(onUndo)}>Undo</MenuItem>
          <MenuItem onClick={run(onRedo)}>Redo</MenuItem>
          <MenuItem onClick={run(onCopy)}>Copy</MenuItem>
          <MenuItem onClick={run(onPaste)}>Paste</MenuItem>
        </Menu>
        <Menu id="object" label="Object" open={open} onOpen={setOpen}>
          <MenuItem onClick={run(onGroup)}>Group</MenuItem>
          <MenuItem onClick={run(onUngroup)}>Ungroup</MenuItem>
          <MenuItem
            onMouseEnter={() => onBooleanPreview?.("union")}
            onMouseLeave={() => onBooleanPreview?.(null)}
            onFocus={() => onBooleanPreview?.("union")}
            onClick={run(() => onBoolean("union"))}
          >
            Unite
          </MenuItem>
          <MenuItem
            onMouseEnter={() => onBooleanPreview?.("intersect")}
            onMouseLeave={() => onBooleanPreview?.(null)}
            onFocus={() => onBooleanPreview?.("intersect")}
            onClick={run(() => onBoolean("intersect"))}
          >
            Intersect
          </MenuItem>
          <MenuItem
            onMouseEnter={() => onBooleanPreview?.("subtract")}
            onMouseLeave={() => onBooleanPreview?.(null)}
            onFocus={() => onBooleanPreview?.("subtract")}
            onClick={run(() => onBoolean("subtract"))}
          >
            Subtract
          </MenuItem>
          <MenuItem
            onMouseEnter={() => onBooleanPreview?.("exclude")}
            onMouseLeave={() => onBooleanPreview?.(null)}
            onFocus={() => onBooleanPreview?.("exclude")}
            onClick={run(() => onBoolean("exclude"))}
          >
            Exclude
          </MenuItem>
          <MenuItem onClick={run(onSimplify)}>Simplify Path</MenuItem>
          <MenuItem onClick={run(onConvertOutlines)}>Convert Text to Outlines</MenuItem>
          <MenuItem onClick={run(onApplyClip)}>Make Clip Mask</MenuItem>
          <MenuItem onClick={run(onReleaseClip)}>Release Clip Mask</MenuItem>
          <MenuItem onClick={run(onCreateSymbol)}>Create Symbol</MenuItem>
          <MenuItem onClick={run(onDetachSymbol)}>Detach Symbol</MenuItem>
          <MenuItem onClick={run(onCommitShapeBuilder)}>Commit Shape Builder</MenuItem>
          <MenuItem onClick={run(onAddArtboard)}>New Artboard</MenuItem>
        </Menu>
        <Menu id="view" label="View" open={open} onOpen={setOpen}>
          <MenuItem onClick={run(onFitArtboard)}>Fit Artboard</MenuItem>
          <MenuItem onClick={run(onFitAllArtboards)}>Fit All Artboards</MenuItem>
          <MenuItem onClick={run(onFitSelection)}>Fit Selection</MenuItem>
          <MenuItem onClick={run(() => onZoom(0.5))}>Zoom 50%</MenuItem>
          <MenuItem onClick={run(() => onZoom(1))}>Zoom 100%</MenuItem>
          <MenuItem onClick={run(() => onZoom(2))}>Zoom 200%</MenuItem>
        </Menu>
        <Menu id="help" label="Help" open={open} onOpen={setOpen}>
          <MenuItem onClick={run(onOpenManual)}>User Manual (PDF)…</MenuItem>
          <MenuItem onClick={run(onExportDiagnostics)}>Export Diagnostics…</MenuItem>
          <MenuItem onClick={run(onAbout)}>About SaVaGe</MenuItem>
        </Menu>
      </nav>
      <div
        className="titlebar__document"
        title={`${documentTitle} — ${saveLabel}`}
        aria-label={`${documentTitle}, ${saveLabel}`}
      >
        <span className="titlebar__name">{documentTitle}</span>
        <span className={modified ? "titlebar__save titlebar__save--dirty" : "titlebar__save"}>
          {saveLabel}
        </span>
      </div>
      <style>{`
        .titlebar {
          min-height: var(--titlebar-h);
          height: auto;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem 1rem;
          padding: 0.2rem 0.75rem;
          background: linear-gradient(180deg, var(--bg-2) 0%, var(--bg-1) 100%);
          border-bottom: 1px solid var(--border);
          z-index: 2;
        }
        .titlebar__brand,
        .titlebar__menu { flex-shrink: 0; }
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
          flex-wrap: wrap;
          gap: 0.15rem;
          min-width: 0;
        }
        .titlebar__document {
          margin-left: auto;
          min-width: 8rem;
          flex: 1 1 10rem;
          max-width: 100%;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 0.45rem;
          color: var(--fg-1);
          font-size: 0.78rem;
        }
        .titlebar__name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .titlebar__save {
          flex-shrink: 0;
          font-size: 0.7rem;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .titlebar__save--dirty { color: var(--warn); }
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
        .menu__fly button:hover,
        .menu__fly button:focus-visible { background: rgba(184,255,60,0.1); }
      `}</style>
    </header>
  );
}
