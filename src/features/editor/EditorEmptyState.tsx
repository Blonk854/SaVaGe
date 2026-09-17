import { Button } from "../../shared/ui/Button";
import { useUiStore } from "../../shared/stores/uiStore";
import { activateEditorTool } from "../tools/activateTool";
import { openFile } from "./fileIo";

export function EditorEmptyState() {
  return (
    <div className="empty-artboard">
      <div className="empty-artboard__card">
        <p className="empty-artboard__title">This artboard is empty</p>
        <p className="muted">Convert an image, draw a shape, or open a project.</p>
        <div className="empty-artboard__actions">
          <Button variant="primary" onClick={() => useUiStore.getState().setMode("convert")}>
            Convert an image
          </Button>
          <Button
            variant="ghost"
            onClick={() => activateEditorTool("rect")}
          >
            Draw a rectangle
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              void openFile().catch(() => undefined);
            }}
          >
            Open a project
          </Button>
        </div>
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
          max-width: 360px;
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
        .empty-artboard__actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 0.4rem;
        }
      `}</style>
    </div>
  );
}
