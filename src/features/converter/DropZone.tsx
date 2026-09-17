import { useCallback, useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Button } from "../../shared/ui/Button";
import {
  displayName,
  inspectDroppedPaths,
  parseGrantedImageSource,
  type GrantedImageSource,
} from "./rasterFiles";

interface Props {
  disabled?: boolean;
  onFile: (source: GrantedImageSource) => void;
  onReject: (message: string, kind: "drop" | "native") => void;
  attachedPath?: string | null;
}

export function DropZone({ disabled, onFile, onReject, attachedPath }: Props) {
  const [over, setOver] = useState(false);

  const pick = useCallback(async () => {
    try {
      const selected = await invoke<unknown>("pick_image_source");
      if (selected) onFile(parseGrantedImageSource(selected));
    } catch (error) {
      onReject(error instanceof Error ? error.message : String(error), "native");
    }
  }, [onFile, onReject]);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    try {
      void getCurrentWebview()
        .onDragDropEvent((event) => {
          switch (event.payload.type) {
            case "enter":
            case "over":
              if (!disabled) setOver(true);
              break;
            case "leave":
              setOver(false);
              break;
            case "drop": {
              setOver(false);
              if (disabled) {
                onReject("Wait until conversion finishes before dropping another image.", "drop");
                return;
              }
              const inspected = inspectDroppedPaths(event.payload.paths);
              if (inspected.kind === "rejected") {
                onReject(inspected.message, "drop");
                return;
              }
              void invoke<unknown>("claim_dropped_image", { path: inspected.path })
                .then((source) => onFile(parseGrantedImageSource(source)))
                .catch((error) => {
                  onReject(error instanceof Error ? error.message : String(error), "native");
                });
              break;
            }
          }
        })
        .then((fn) => {
          if (cancelled) fn();
          else unlisten = fn;
        })
        .catch(() => {
          /* Native drop events are unavailable outside the WebView. */
        });
    } catch {
      /* getCurrentWebview throws in a plain browser before any promise exists. */
    }
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [disabled, onFile, onReject]);

  return (
    <div className={`dropzone ${over ? "over" : ""} ${disabled ? "dropzone--busy" : ""}`} aria-busy={disabled || undefined}>
      <p className="dropzone__title">
        {attachedPath ? displayName(attachedPath) : "Drop an image to vectorize"}
      </p>
      <p className="muted">
        {disabled
          ? "Drop is paused until the current conversion finishes"
          : attachedPath
            ? "Ready to convert — or drop another image"
            : "PNG, JPEG, GIF, WEBP, BMP, TIFF"}
      </p>
      <Button variant="primary" disabled={disabled} onClick={pick}>
        Open Image…
      </Button>
      <style>{`
        .dropzone {
          border: 1px dashed rgba(184,255,60,0.35);
          border-radius: 16px;
          min-height: 220px;
          display: grid;
          place-content: center;
          gap: 0.55rem;
          text-align: center;
          padding: 2rem;
          background: rgba(18,21,26,0.72);
          backdrop-filter: blur(6px);
          transition: border-color 160ms ease, background 160ms ease;
          pointer-events: auto;
        }
        .dropzone.over {
          border-color: var(--accent);
          background: rgba(184,255,60,0.08);
        }
        .dropzone--busy {
          border-style: solid;
          border-color: rgba(184, 255, 60, 0.22);
        }
        .dropzone__title {
          margin: 0;
          font-family: var(--font-display);
          font-size: 1.2rem;
        }
      `}</style>
    </div>
  );
}
