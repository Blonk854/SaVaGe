import { useState } from "react";
import { Button } from "../../shared/ui/Button";
import { useWelcomeVisible, WelcomeNote } from "../../shared/ui/WelcomeNote";
import { useUiStore } from "../../shared/stores/uiStore";
import { activateEditorTool } from "../tools/activateTool";
import { newProject, openFile } from "./fileIo";
import { pasteClipboard } from "./clipboard";
import {
  DOCUMENT_PRESETS,
  parseArtboardSize,
  resizeActiveArtboard,
} from "./documentPresets";

function viewportSize() {
  const el = document.querySelector(".viewport") as HTMLElement | null;
  return { w: el?.clientWidth ?? 0, h: el?.clientHeight ?? 0 };
}

export function EditorEmptyState() {
  const welcome = useWelcomeVisible();
  const [width, setWidth] = useState("1920");
  const [height, setHeight] = useState("1080");
  const [sizeError, setSizeError] = useState<string | null>(null);

  const applySize = (nextWidth: number, nextHeight: number) => {
    resizeActiveArtboard(nextWidth, nextHeight, viewportSize());
    setSizeError(null);
  };

  return (
    <div className="empty-artboard">
      <div className="empty-artboard__card">
        <p className="empty-artboard__title">This artboard is empty</p>
        <p className="muted">Convert an image, draw a shape, paste, or open a project.</p>
        {welcome && <WelcomeNote />}
        <div className="empty-artboard__actions">
          <Button variant="primary" onClick={() => useUiStore.getState().setMode("convert")}>
            Convert an image
          </Button>
          <Button variant="ghost" title="Switch to the rectangle tool" onClick={() => activateEditorTool("rect")}>
            Draw a rectangle
          </Button>
          <Button
            variant="ghost"
            title="Open a .savage project"
            onClick={() => {
              void openFile().catch(() => undefined);
            }}
          >
            Open a project
          </Button>
          <Button
            variant="ghost"
            title="Open an SVG file into the editor"
            onClick={() => {
              void openFile().catch(() => undefined);
            }}
          >
            Import SVG
          </Button>
          <Button
            variant="ghost"
            title="Paste shapes from the clipboard"
            onClick={() => {
              void pasteClipboard().catch(() => undefined);
            }}
          >
            Paste
          </Button>
          <Button
            variant="ghost"
            title="Start a blank document"
            onClick={() => {
              void newProject().catch(() => undefined);
            }}
          >
            New document
          </Button>
        </div>
        <div className="empty-artboard__sizes" role="group" aria-label="Artboard size">
          {DOCUMENT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applySize(preset.width, preset.height)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <form
          className="empty-artboard__custom"
          onSubmit={(event) => {
            event.preventDefault();
            const parsed = parseArtboardSize(width, height);
            if (!parsed) {
              setSizeError("Use whole pixels from 1 to 16384.");
              return;
            }
            applySize(parsed.width, parsed.height);
          }}
        >
          <label>
            Width
            <input
              aria-label="Artboard width"
              inputMode="numeric"
              value={width}
              onChange={(event) => setWidth(event.target.value)}
            />
          </label>
          <label>
            Height
            <input
              aria-label="Artboard height"
              inputMode="numeric"
              value={height}
              onChange={(event) => setHeight(event.target.value)}
            />
          </label>
          <Button variant="ghost" type="submit">
            Apply size
          </Button>
        </form>
        {sizeError && <p className="empty-artboard__error">{sizeError}</p>}
      </div>
      <style>{`
        .empty-artboard {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: start center;
          padding-top: 0.75rem;
          pointer-events: none;
          z-index: 3;
        }
        .empty-artboard__card {
          pointer-events: auto;
          max-width: 440px;
          text-align: center;
          display: grid;
          gap: 0.65rem;
          padding: 1rem 1.15rem;
          border: 1px solid var(--border);
          border-radius: 14px;
          background: rgba(18, 21, 26, 0.88);
          backdrop-filter: blur(8px);
        }
        .empty-artboard__title {
          margin: 0;
          font-family: var(--font-display);
          font-size: 1.05rem;
        }
        .empty-artboard__actions, .empty-artboard__sizes, .empty-artboard__custom {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 0.4rem;
        }
        .empty-artboard__sizes button, .empty-artboard__custom input {
          border: 1px solid var(--border);
          background: var(--bg-2);
          border-radius: 8px;
          padding: 0.3rem 0.5rem;
          color: var(--fg-0);
          font-size: var(--text-xs);
        }
        .empty-artboard__custom label {
          display: grid;
          gap: 0.2rem;
          font-size: var(--text-xs);
          color: var(--fg-1);
        }
        .empty-artboard__custom input { width: 5.5rem; }
        .empty-artboard__error {
          margin: 0;
          color: var(--warn);
          font-size: var(--text-xs);
        }
      `}</style>
    </div>
  );
}
