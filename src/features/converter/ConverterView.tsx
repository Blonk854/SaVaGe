import { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import wordmarkUrl from "../../assets/logo.svg";
import bssMarkUrl from "../../assets/bss-mark.svg";
import { Button } from "../../shared/ui/Button";
import { Panel } from "../../shared/ui/Panel";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { useUiStore } from "../../shared/stores/uiStore";
import { ConvertOptionsForm } from "./ConvertOptionsForm";
import { ConvertPreview } from "./ConvertPreview";
import { DropZone } from "./DropZone";
import {
  convertImageToSvg,
  PRESETS,
  type ConvertOptions,
  type ConvertPreset,
} from "./convertApi";

export function ConverterView() {
  const [path, setPath] = useState<string | null>(null);
  const [rasterUrl, setRasterUrl] = useState<string | null>(null);
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const [preset, setPreset] = useState<ConvertPreset>("logo");
  const [options, setOptions] = useState<ConvertOptions>(PRESETS.logo);
  const [error, setError] = useState<string | null>(null);

  const converting = useUiStore((s) => s.converting);
  const setConverting = useUiStore((s) => s.setConverting);
  const setMode = useUiStore((s) => s.setMode);
  const replaceFromSvg = useDocumentStore((s) => s.replaceFromSvg);

  const onFile = async (filePath: string) => {
    setPath(filePath);
    setError(null);
    setSvgMarkup(null);
    // convertFileSrc for preview when available
    try {
      setRasterUrl(convertFileSrc(filePath));
    } catch {
      setRasterUrl(null);
    }
  };

  const runConvert = async () => {
    if (!path) return;
    setError(null);
    setConverting(true, "Tracing…");
    try {
      const svg = await convertImageToSvg(path, options);
      setSvgMarkup(svg);
      replaceFromSvg(svg, path.split(/[/\\]/).pop() || "Converted");
      setMode("edit");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="converter">
      <div className="converter__hero">
        <div className="converter__brand">
          <img
            src={wordmarkUrl}
            alt="SaVaGe"
            className="converter__wordmark"
          />
        </div>
        <DropZone disabled={converting} onFile={onFile} />
        {converting && <div className="progress-shimmer" aria-label="Converting" />}
        {error && <p className="err">{error}</p>}
        <div className="converter__actions">
          <Button variant="primary" disabled={!path || converting} onClick={runConvert}>
            Convert to SVG
          </Button>
          {svgMarkup && (
            <Button variant="ghost" onClick={() => setMode("edit")}>
              Open in Editor
            </Button>
          )}
        </div>
        <ConvertPreview rasterUrl={rasterUrl} svgMarkup={svgMarkup} />
        <div className="converter__credit">
          <img
            src={bssMarkUrl}
            alt="Powered by BigSoy Studios"
            className="converter__bss"
          />
        </div>
      </div>
      <aside className="converter__side">
        <Panel title="Trace options">
          <ConvertOptionsForm
            options={options}
            preset={preset}
            disabled={converting}
            onPreset={setPreset}
            onChange={setOptions}
          />
        </Panel>
      </aside>
      <style>{`
        .converter {
          display: grid;
          grid-template-columns: 1fr 300px;
          gap: 1rem;
          height: 100%;
          min-height: 0;
          padding: 1.25rem;
          background:
            radial-gradient(ellipse at 20% 10%, rgba(184,255,60,0.08), transparent 45%),
            radial-gradient(ellipse at 80% 0%, rgba(34,211,238,0.06), transparent 40%),
            var(--bg-0);
        }
        .converter__hero {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          min-width: 0;
          overflow: auto;
        }
        .converter__brand {
          display: grid;
          justify-items: start;
        }
        .converter__wordmark {
          display: block;
          width: min(100%, 520px);
          height: auto;
          border-radius: 14px;
          filter: drop-shadow(0 12px 32px rgba(0,0,0,0.4));
        }
        .converter__actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .converter__credit {
          margin-top: auto;
          padding-top: 0.75rem;
          display: flex;
          justify-content: flex-end;
          align-items: center;
          opacity: 0.72;
          transition: opacity 160ms ease;
        }
        .converter__credit:hover { opacity: 1; }
        .converter__bss {
          height: 42px;
          width: auto;
          max-width: min(280px, 100%);
          display: block;
          filter: drop-shadow(0 4px 12px rgba(0,0,0,0.25));
        }
        .converter__side { min-height: 0; }
        .err { color: var(--danger); margin: 0; font-size: 0.85rem; }
        @media (max-width: 1280px) {
          .converter { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
