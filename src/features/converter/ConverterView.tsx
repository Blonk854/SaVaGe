import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { nanoid } from "nanoid";
import { StatusBanner } from "../../shared/ui/StatusBanner";
import { Button } from "../../shared/ui/Button";
import { Panel } from "../../shared/ui/Panel";
import iconUrl from "../../assets/icon.svg";
import bssMarkUrl from "../../assets/bss-mark.svg";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { useUiStore } from "../../shared/stores/uiStore";
import { useProjectSessionStore } from "../../shared/stores/projectSessionStore";
import { ConvertOptionsForm } from "./ConvertOptionsForm";
import { ConvertPreview } from "./ConvertPreview";
import { DropZone } from "./DropZone";
import {
  displayName,
  formatSourceMetadata,
  parseImagePreview,
  type GrantedImageSource,
  type ImagePreview,
} from "./rasterFiles";
import {
  cancelConvertJob,
  convertImageToSvg,
  isCancelledConversion,
  PRESETS,
  sameConvertOptions,
  type ConvertOptions,
} from "./convertApi";
import { recordDiagnostic } from "../../shared/diagnostics";

export function ConverterView() {
  const [source, setSource] = useState<GrantedImageSource | null>(null);
  const [preview, setPreview] = useState<ImagePreview | null>(null);
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const [options, setOptions] = useState<ConvertOptions>(PRESETS.logo);
  const [convertedOptions, setConvertedOptions] = useState<ConvertOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sourceRevision = useRef(0);

  const converting = useUiStore((s) => s.converting);
  const convertProgressLabel = useUiStore((s) => s.convertProgressLabel);
  const pendingConvertPath = useUiStore((s) => s.pendingConvertPath);
  const setConverting = useUiStore((s) => s.setConverting);
  const setMode = useUiStore((s) => s.setMode);
  const replaceFromSvg = useDocumentStore((s) => s.replaceFromSvg);
  const activeJobId = useRef<string | null>(null);

  const onReject = useCallback((message: string, kind: "drop" | "native") => {
    setError(message);
    if (kind === "native") {
      recordDiagnostic({
        level: "error",
        code: "source_rejected",
        operation: "preview",
        sessionId: useProjectSessionStore.getState().sessionId,
        message,
      });
    }
  }, []);

  const onFile = useCallback(async (nextSource: GrantedImageSource) => {
    sourceRevision.current += 1;
    setSource(nextSource);
    setError(null);
    setSvgMarkup(null);
    setConvertedOptions(null);
    setPreview(null);
    try {
      const nextPreview = parseImagePreview(
        await invoke<unknown>("read_image_preview", {
          sourceGrantId: nextSource.grantId,
        }),
      );
      setPreview(nextPreview);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      recordDiagnostic({
        level: "error",
        code: "preview_failed",
        operation: "preview",
        sessionId: useProjectSessionStore.getState().sessionId,
        message,
      });
      setError(message);
    }
  }, []);

  useEffect(() => {
    if (!pendingConvertPath) return;
    const pendingSource = pendingConvertPath;
    useUiStore.getState().setPendingConvertPath(null);
    void onFile(pendingSource);
  }, [pendingConvertPath, onFile]);

  const runConvert = async () => {
    if (!source) return;
    const jobId = nanoid();
    activeJobId.current = jobId;
    setError(null);
    setConverting(true, "Tracing…");
    try {
      const sessionId = useProjectSessionStore.getState().sessionId;
      const revision = sourceRevision.current;
      const result = await convertImageToSvg(
        source.grantId,
        options,
        sessionId,
        revision,
        invoke,
        jobId,
      );
      if (
        result.sessionId !== useProjectSessionStore.getState().sessionId ||
        result.sourceRevision !== sourceRevision.current
      ) {
        recordDiagnostic({
          level: "warn",
          code: "stale_result",
          operation: "convert",
          jobId: result.jobId,
          sessionId: result.sessionId,
          stage: "commit",
          message: "Conversion result was discarded because the project or source changed",
        });
        setError("Conversion result was discarded because the project or source changed");
        return;
      }
      setSvgMarkup(result.svg);
      setConvertedOptions(options);
      replaceFromSvg(result.svg, displayName(source.path) || "Converted");
    } catch (e) {
      if (isCancelledConversion(e)) {
        setError("Conversion cancelled. Tracing stops after the current stage finishes.");
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      activeJobId.current = null;
      setConverting(false);
    }
  };

  const requestCancel = () => {
    const jobId = activeJobId.current;
    if (!jobId) return;
    setConverting(true, "Stopping after the current stage…");
    void cancelConvertJob(jobId).catch((e) => {
      if (!isCancelledConversion(e)) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const fileName = source ? displayName(source.path) : undefined;
  const sourceMeta =
    source && preview ? formatSourceMetadata(fileName || "Image", preview) : null;
  const stale = Boolean(svgMarkup && convertedOptions && !sameConvertOptions(convertedOptions, options));
  const convertDisabledReason = converting
    ? "Wait for the current conversion to finish"
    : source
      ? undefined
      : "Attach an image first";

  return (
    <div className="converter">
      <div className="converter__hero">
        <div className="converter__brand">
          <img src={iconUrl} alt="" width={36} height={36} />
          <div>
            <p className="wordmark">SaVaGe</p>
            <p className="muted converter__tag">Trace an image, then edit the vectors.</p>
          </div>
        </div>
        <DropZone
          disabled={converting}
          onFile={onFile}
          onReject={onReject}
          attachedPath={source?.path}
        />
        {sourceMeta && <p className="converter__meta">{sourceMeta}</p>}
        {converting && (
          <StatusBanner kind="loading">
            <div className="progress-shimmer" aria-hidden="true" />
            <p>{convertProgressLabel || "Tracing…"}</p>
          </StatusBanner>
        )}
        {stale && !converting && (
          <StatusBanner kind="warn">Trace options changed. Convert again to update the SVG.</StatusBanner>
        )}
        {error && (
          <StatusBanner
            kind={/cancelled|discarded/i.test(error) ? "warn" : "error"}
            onDismiss={() => setError(null)}
          >
            {error}
          </StatusBanner>
        )}
        <div className="converter__actions">
          <Button
            variant="primary"
            disabled={!source || converting}
            title={convertDisabledReason}
            onClick={runConvert}
          >
            {svgMarkup ? "Convert again" : "Convert to SVG"}
          </Button>
          {converting && (
            <Button
              variant="ghost"
              onClick={requestCancel}
              aria-label="Stop conversion after the current stage"
            >
              Cancel
            </Button>
          )}
          {svgMarkup && (
            <Button variant="ghost" onClick={() => setMode("edit")}>
              Open in Editor
            </Button>
          )}
        </div>
        <ConvertPreview
          rasterUrl={preview?.dataUrl ?? null}
          svgMarkup={svgMarkup}
          rasterLabel={fileName}
          converting={converting}
          stale={stale}
        />
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
          <ConvertOptionsForm options={options} disabled={converting} onChange={setOptions} />
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
            radial-gradient(ellipse at 18% 8%, rgba(184,255,60,0.08), transparent 42%),
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
          display: flex;
          align-items: center;
          gap: 0.7rem;
        }
        .converter__brand img {
          filter: drop-shadow(0 0 10px rgba(184,255,60,0.28));
        }
        .converter__brand .wordmark {
          margin: 0;
          font-size: 1.35rem;
        }
        .converter__tag { margin: 0.15rem 0 0; font-size: var(--text-sm); }
        .converter__actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .converter__meta {
          margin: 0;
          font-size: var(--text-sm);
          color: var(--fg-1);
        }
        .converter__credit {
          margin-top: auto;
          padding-top: 0.75rem;
          display: flex;
          justify-content: flex-end;
          align-items: center;
          opacity: 0.42;
        }
        .converter__bss {
          height: 22px;
          width: auto;
          max-width: min(180px, 100%);
          display: block;
        }
        .converter .sv-status--loading .progress-shimmer { margin-bottom: 0.4rem; }
        .converter__side { min-height: 0; }
        @media (max-width: 1100px) {
          .converter { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
