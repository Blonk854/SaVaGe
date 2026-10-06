import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  compareMediaStyle,
  comparePan,
  nextCompareZoom,
  type CompareMode,
} from "./compareView";

interface Props {
  rasterUrl: string | null;
  svgMarkup: string | null;
  rasterLabel?: string;
  converting?: boolean;
  stale?: boolean;
}

const MODES: { id: CompareMode; label: string }[] = [
  { id: "split", label: "Split view" },
  { id: "overlay", label: "Overlay" },
  { id: "wipe", label: "Before / after" },
];

export function ConvertPreview({
  rasterUrl,
  svgMarkup,
  rasterLabel,
  converting = false,
  stale = false,
}: Props) {
  const [svgUrl, setSvgUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<CompareMode>("split");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0.55);
  const [wipe, setWipe] = useState(0.5);
  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!svgMarkup) {
      setSvgUrl(null);
      return;
    }
    const url = URL.createObjectURL(new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" }));
    setSvgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [svgMarkup]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onWheel = (event: WheelEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, button, select")) return;
      event.preventDefault();
      setZoom((current) => nextCompareZoom(current, event.deltaY));
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, []);

  const svgCaption = converting ? "SVG" : stale && svgUrl ? "SVG (previous options)" : "SVG";
  const interactive = Boolean(rasterUrl && svgUrl && !converting);
  const shownMode: CompareMode = interactive ? mode : "split";
  const mediaStyle = compareMediaStyle(zoom, pan.x, pan.y);

  const stageHandlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { x: event.clientX, y: event.clientY };
    },
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!drag.current) return;
      const dx = event.clientX - drag.current.x;
      const dy = event.clientY - drag.current.y;
      drag.current = { x: event.clientX, y: event.clientY };
      setPan((current) => comparePan(current.x, current.y, dx, dy));
    },
    onPointerUp: () => {
      drag.current = null;
    },
    onPointerCancel: () => {
      drag.current = null;
    },
  };

  return (
    <div className="preview" ref={rootRef}>
      {interactive && (
        <div className="preview__modes" role="group" aria-label="Compare mode">
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={shownMode === item.id}
              className={shownMode === item.id ? "active" : undefined}
              onClick={() => setMode(item.id)}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          >
            Reset view
          </button>
        </div>
      )}
      {shownMode === "split" ? (
        <>
          <div className="preview__pane">
            <span>Raster</span>
            {rasterUrl ? (
              <div className="preview__stage" {...stageHandlers}>
                <img src={rasterUrl} alt={rasterLabel || "Selected image"} style={mediaStyle} />
              </div>
            ) : (
              <div className="ph ph--status sv-empty">Drop or open an image</div>
            )}
          </div>
          <div className={`preview__pane ${stale && svgUrl && !converting ? "preview__pane--stale" : ""}`}>
            <span>{svgCaption}</span>
            {converting ? (
              <div className="ph ph--status sv-empty" aria-live="polite">
                Tracing…
              </div>
            ) : svgUrl ? (
              <div className="preview__stage" {...stageHandlers}>
                <img src={svgUrl} alt="Traced SVG preview" style={mediaStyle} />
              </div>
            ) : (
              <div className="ph ph--status sv-empty">Convert to see the SVG</div>
            )}
          </div>
        </>
      ) : (
        <div className="preview__pane preview__pane--single">
          <span>{shownMode === "overlay" ? "Overlay" : "Before / after"}</span>
          <div className="preview__stage" {...stageHandlers}>
            {rasterUrl && <img src={rasterUrl} alt={rasterLabel || "Selected image"} style={mediaStyle} />}
            {svgUrl && (
              <img
                src={svgUrl}
                alt="Traced SVG preview"
                className="preview__top"
                style={{
                  ...mediaStyle,
                  opacity: shownMode === "overlay" ? opacity : 1,
                  clipPath: shownMode === "wipe" ? `inset(0 ${(1 - wipe) * 100}% 0 0)` : undefined,
                }}
              />
            )}
          </div>
          {shownMode === "overlay" ? (
            <label className="preview__slider">
              SVG opacity
              <input
                aria-label="SVG opacity"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={opacity}
                onChange={(event) => setOpacity(Number(event.target.value))}
              />
            </label>
          ) : (
            <label className="preview__slider">
              Reveal SVG
              <input
                aria-label="Before and after split"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={wipe}
                onChange={(event) => setWipe(Number(event.target.value))}
              />
            </label>
          )}
        </div>
      )}
      <style>{`
        .preview {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.75rem;
          min-height: 240px;
        }
        .preview__modes { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 0.35rem; }
        .preview__modes button {
          border: 1px solid var(--border);
          background: var(--bg-2);
          border-radius: 8px;
          padding: 0.3rem 0.55rem;
          font-size: var(--text-xs);
        }
        .preview__modes button.active,
        .preview__modes button[aria-pressed="true"] {
          border-color: rgba(184,255,60,0.5);
          color: var(--selection-fg);
          background: var(--selection-fill);
        }
        .preview__pane {
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 0.5rem;
          display: grid;
          grid-template-rows: auto 1fr;
          gap: 0.4rem;
          min-height: 0;
          overflow: hidden;
        }
        .preview__pane--single { grid-column: 1 / -1; }
        .preview__pane--stale { border-color: rgba(255, 193, 74, 0.55); }
        .preview__pane > span {
          font-size: var(--text-xs);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--fg-1);
        }
        .preview__stage {
          position: relative;
          height: 220px;
          overflow: hidden;
          border-radius: 8px;
          touch-action: none;
          background:
            linear-gradient(45deg, #1a1f27 25%, transparent 25%),
            linear-gradient(-45deg, #1a1f27 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #1a1f27 75%),
            linear-gradient(-45deg, transparent 75%, #1a1f27 75%);
          background-size: 16px 16px;
          background-position: 0 0, 0 8px, 8px -8px, -8px 0;
          background-color: #0f1217;
        }
        .preview__stage img, .ph {
          width: 100%;
          height: 220px;
          object-fit: contain;
          border-radius: 8px;
        }
        .preview__top {
          position: absolute;
          inset: 0;
        }
        .ph--status {
          display: grid;
          place-items: center;
          color: var(--fg-1);
          font-size: var(--text-sm);
          background:
            linear-gradient(45deg, #1a1f27 25%, transparent 25%),
            linear-gradient(-45deg, #1a1f27 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #1a1f27 75%),
            linear-gradient(-45deg, transparent 75%, #1a1f27 75%);
          background-size: 16px 16px;
          background-position: 0 0, 0 8px, 8px -8px, -8px 0;
          background-color: #0f1217;
        }
        .preview__slider {
          display: grid;
          gap: 0.25rem;
          font-size: var(--text-xs);
          color: var(--fg-1);
        }
      `}</style>
    </div>
  );
}
