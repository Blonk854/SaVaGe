import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Button } from "../../shared/ui/Button";
import { firstRasterPath, RASTER_EXTENSIONS } from "./rasterFiles";

interface Props {
  disabled?: boolean;
  onFile: (path: string) => void;
  attachedPath?: string | null;
}

const RASTER_FILTERS = [
  {
    name: "Images",
    extensions: [...RASTER_EXTENSIONS],
  },
];

export function DropZone({ disabled, onFile, attachedPath }: Props) {
  const [over, setOver] = useState(false);

  const pick = useCallback(async () => {
    const selected = await open({
      multiple: false,
      filters: RASTER_FILTERS,
    });
    if (typeof selected === "string") onFile(selected);
  }, [onFile]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (disabled) return;
        switch (event.payload.type) {
          case "enter":
          case "over":
            setOver(true);
            break;
          case "leave":
            setOver(false);
            break;
          case "drop": {
            setOver(false);
            const path = firstRasterPath(event.payload.paths);
            if (path) onFile(path);
            break;
          }
        }
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {
        /* Browser / non-Tauri preview — HTML5 drop is unused on Windows WebView. */
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [disabled, onFile]);

  return (
    <div className={`dropzone ${over ? "over" : ""}`}>
      <p className="dropzone__title">
        {attachedPath
          ? attachedPath.split(/[/\\]/).pop()
          : "Drop an image to vectorize"}
      </p>
      <p className="muted">
        {attachedPath
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
        .dropzone__title {
          margin: 0;
          font-family: var(--font-display);
          font-size: 1.35rem;
        }
      `}</style>
    </div>
  );
}
