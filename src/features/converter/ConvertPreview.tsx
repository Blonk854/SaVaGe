import { useEffect, useState } from "react";

interface Props {
  rasterUrl: string | null;
  svgMarkup: string | null;
  rasterLabel?: string;
  converting?: boolean;
  stale?: boolean;
}

export function ConvertPreview({
  rasterUrl,
  svgMarkup,
  rasterLabel,
  converting = false,
  stale = false,
}: Props) {
  const [svgUrl, setSvgUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!svgMarkup) {
      setSvgUrl(null);
      return;
    }
    const url = URL.createObjectURL(new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" }));
    setSvgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [svgMarkup]);

  const svgCaption = converting
    ? "SVG"
    : stale && svgUrl
      ? "SVG (previous options)"
      : "SVG";

  return (
    <div className="preview">
      <div className="preview__pane">
        <span>Raster</span>
        {rasterUrl ? (
          <img src={rasterUrl} alt={rasterLabel || "Selected image"} />
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
          <img src={svgUrl} alt="Traced SVG preview" />
        ) : (
          <div className="ph ph--status sv-empty">Convert to see the SVG</div>
        )}
      </div>
      <style>{`
        .preview {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.75rem;
          min-height: 240px;
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
        }
        .preview__pane--stale {
          border-color: rgba(255, 193, 74, 0.55);
        }
        .preview__pane > span {
          font-size: 0.7rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--fg-1);
        }
        .preview__pane img, .ph {
          width: 100%;
          height: 220px;
          object-fit: contain;
          border-radius: 8px;
          background:
            linear-gradient(45deg, #1a1f27 25%, transparent 25%),
            linear-gradient(-45deg, #1a1f27 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #1a1f27 75%),
            linear-gradient(-45deg, transparent 75%, #1a1f27 75%);
          background-size: 16px 16px;
          background-position: 0 0, 0 8px, 8px -8px, -8px 0;
          background-color: #0f1217;
        }
        .ph--status {
          display: grid;
          place-items: center;
          color: var(--fg-1);
          font-size: 0.82rem;
          object-fit: unset;
        }
      `}</style>
    </div>
  );
}
