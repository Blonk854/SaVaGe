import { useUiStore } from "../../shared/stores/uiStore";
import { fitToArtboard, setZoomCentered } from "../../features/editor/camera";
import clsx from "clsx";

function viewportSize() {
  const el = document.querySelector(".shell__main") as HTMLElement | null;
  return {
    w: el?.clientWidth ?? 1200,
    h: el?.clientHeight ?? 800,
  };
}

export function Toolbar() {
  const mode = useUiStore((s) => s.mode);
  const setMode = useUiStore((s) => s.setMode);
  const showGrid = useUiStore((s) => s.showGrid);
  const setShowGrid = useUiStore((s) => s.setShowGrid);
  const snap = useUiStore((s) => s.snap);
  const setSnap = useUiStore((s) => s.setSnap);
  const perspective = useUiStore((s) => s.perspective);
  const setPerspectiveMode = useUiStore((s) => s.setPerspectiveMode);
  const zoom = useUiStore((s) => s.zoom);

  return (
    <div className="toolbar panel-enter">
      <div className="mode-switch" role="tablist" aria-label="Workspace mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "convert"}
          className={clsx(mode === "convert" && "active")}
          onClick={() => setMode("convert")}
        >
          Convert
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "edit"}
          className={clsx(mode === "edit" && "active")}
          onClick={() => setMode("edit")}
        >
          Edit
        </button>
      </div>

      {mode === "edit" && (
        <div className="zoom-ctrl">
          <button
            type="button"
            onClick={() => {
              const { w, h } = viewportSize();
              setZoomCentered(zoom / 1.25, w, h);
            }}
          >
            −
          </button>
          <button
            type="button"
            className="zoom-ctrl__label"
            onClick={() => {
              const { w, h } = viewportSize();
              setZoomCentered(1, w, h);
            }}
            title="Reset zoom to 100%"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={() => {
              const { w, h } = viewportSize();
              setZoomCentered(zoom * 1.25, w, h);
            }}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => {
              const { w, h } = viewportSize();
              fitToArtboard(w, h);
            }}
          >
            Fit
          </button>
        </div>
      )}

      <div className="toolbar__spacer" />
      <label className="chk">
        <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
        Grid
      </label>
      <label className="chk">
        <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
        Snap
      </label>
      <label className="chk">
        <span>Persp</span>
        <select
          value={perspective.mode}
          onChange={(e) =>
            setPerspectiveMode(e.target.value as typeof perspective.mode)
          }
        >
          <option value="off">Off</option>
          <option value="1point">1-pt</option>
          <option value="2point">2-pt</option>
        </select>
      </label>
      <style>{`
        .toolbar {
          height: var(--toolbar-h);
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0 0.75rem;
          background: var(--bg-1);
          border-bottom: 1px solid var(--border);
        }
        .mode-switch {
          display: flex;
          padding: 3px;
          border-radius: 999px;
          background: var(--bg-2);
          border: 1px solid var(--border);
        }
        .mode-switch button {
          border: 0;
          background: transparent;
          color: var(--fg-1);
          padding: 0.35rem 0.95rem;
          border-radius: 999px;
          font-weight: 600;
          font-size: 0.85rem;
        }
        .mode-switch button.active {
          background: var(--accent);
          color: var(--accent-ink);
        }
        .zoom-ctrl {
          display: flex;
          align-items: center;
          gap: 0.2rem;
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 2px;
        }
        .zoom-ctrl button {
          border: 0;
          background: transparent;
          color: var(--fg-1);
          min-width: 28px;
          height: 28px;
          border-radius: 6px;
          font-size: 0.8rem;
        }
        .zoom-ctrl button:hover { background: rgba(255,255,255,0.05); color: var(--fg-0); }
        .zoom-ctrl__label { min-width: 52px !important; font-variant-numeric: tabular-nums; }
        .toolbar__spacer { flex: 1; }
        .chk {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          color: var(--fg-1);
          font-size: 0.8rem;
        }
        .chk input { accent-color: var(--accent); }
        .chk select {
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: 6px;
          color: var(--fg-0);
          padding: 0.15rem 0.3rem;
          font-size: 0.75rem;
        }
      `}</style>
    </div>
  );
}
