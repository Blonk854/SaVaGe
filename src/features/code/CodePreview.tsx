import { useMemo, useState } from "react";

interface CodePreviewProps {
  svg: string;
  width: number;
  height: number;
}

const CHECKER =
  "linear-gradient(45deg, rgba(128,128,128,.25) 25%, transparent 25%), linear-gradient(-45deg, rgba(128,128,128,.25) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(128,128,128,.25) 75%), linear-gradient(-45deg, transparent 75%, rgba(128,128,128,.25) 75%)";

/** Sandboxed preview: an img data URI cannot run scripts or load external SVG resources. */
export function CodePreview({ svg, width, height }: CodePreviewProps) {
  const src = useMemo(() => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg), [svg]);
  const [fit, setFit] = useState(true);
  const [dark, setDark] = useState(false);

  return (
    <div className="code-preview">
      <div className="code-preview__bar">
        <div role="group" aria-label="Preview zoom">
          <button type="button" aria-pressed={fit} onClick={() => setFit(true)}>
            Fit
          </button>
          <button type="button" aria-pressed={!fit} onClick={() => setFit(false)}>
            100%
          </button>
        </div>
        <div role="group" aria-label="Preview background">
          <button type="button" aria-pressed={!dark} onClick={() => setDark(false)}>
            Light
          </button>
          <button type="button" aria-pressed={dark} onClick={() => setDark(true)}>
            Dark
          </button>
        </div>
      </div>
      <div
        className="code-preview__stage"
        style={{
          backgroundColor: dark ? "#1b1e23" : "#ffffff",
          backgroundImage: CHECKER,
        }}
      >
        <img
          alt="SVG preview"
          src={src}
          draggable={false}
          style={fit ? { maxWidth: "100%", maxHeight: "100%" } : { width, height }}
        />
      </div>
      <style>{`
        .code-preview {
          height: 100%;
          min-height: 0;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .code-preview__bar {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
        }
        .code-preview__bar [role="group"] {
          display: flex;
          gap: 0.35rem;
        }
        .code-preview__bar button {
          border: 1px solid var(--border);
          background: var(--bg-2);
          border-radius: 8px;
          padding: 0.3rem 0.55rem;
          font-size: var(--text-xs);
        }
        .code-preview__bar button[aria-pressed="true"] {
          border-color: rgba(184,255,60,0.5);
          color: var(--selection-fg);
          background: var(--selection-fill);
        }
        .code-preview__stage {
          overflow: auto;
          flex: 1;
          min-height: 0;
          height: 100%;
          display: grid;
          place-items: center;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          background-size: 16px 16px;
          background-position: 0 0, 0 8px, 8px -8px, -8px 0;
        }
        .code-preview__stage img {
          display: block;
          min-width: 0;
          min-height: 0;
        }
      `}</style>
    </div>
  );
}
