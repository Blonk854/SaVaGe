import { useCallback, useState, type DragEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "../../shared/ui/Button";

interface Props {
  disabled?: boolean;
  onFile: (path: string) => void;
}

const RASTER_FILTERS = [
  {
    name: "Images",
    extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff"],
  },
];

export function DropZone({ disabled, onFile }: Props) {
  const [over, setOver] = useState(false);

  const pick = useCallback(async () => {
    const selected = await open({
      multiple: false,
      filters: RASTER_FILTERS,
    });
    if (typeof selected === "string") onFile(selected);
  }, [onFile]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    // Tauri drag-drop exposes path on File in desktop webview
    const path = (file as File & { path?: string })?.path;
    if (path) onFile(path);
  };

  return (
    <div
      className={`dropzone ${over ? "over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <p className="dropzone__title">Drop an image to vectorize</p>
      <p className="muted">PNG, JPEG, GIF, WEBP, BMP, TIFF</p>
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
