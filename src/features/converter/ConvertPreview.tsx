interface Props {
  rasterUrl: string | null;
  svgMarkup: string | null;
  rasterLabel?: string;
}

export function ConvertPreview({ rasterUrl, svgMarkup, rasterLabel }: Props) {
  if (!rasterUrl && !svgMarkup) return null;
  return (
    <div className="preview">
      <div className="preview__pane">
        <span>Raster</span>
        {rasterUrl ? (
          <img src={rasterUrl} alt={rasterLabel || "Selected image"} />
        ) : (
          <div className="ph" />
        )}
      </div>
      <div className="preview__pane">
        <span>SVG</span>
        {svgMarkup ? (
          <div className="svg-wrap" dangerouslySetInnerHTML={{ __html: svgMarkup }} />
        ) : (
          <div className="ph" />
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
        .preview__pane > span {
          font-size: 0.7rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--fg-1);
        }
        .preview__pane img, .svg-wrap, .ph {
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
        .svg-wrap svg {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
      `}</style>
    </div>
  );
}
