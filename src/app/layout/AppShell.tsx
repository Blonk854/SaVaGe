import { useEffect, useState } from "react";
import { TitleBar } from "./TitleBar";
import { Toolbar } from "./Toolbar";
import { StatusBar } from "./StatusBar";
import { ToolsRail } from "../../features/tools/ToolsRail";
import { ConverterView } from "../../features/converter/ConverterView";
import { EditorViewport } from "../../features/editor/EditorViewport";
import { LayersPanel } from "../../features/layers/LayersPanel";
import { PropertiesPanel } from "../../features/properties/PropertiesPanel";
import { ArtboardsPanel } from "../../features/artboards/ArtboardsPanel";
import { SymbolsPanel } from "../../features/symbols/SymbolsPanel";
import { PluginsPanel } from "../../shared/plugins/PluginsPanel";
import {
  registerBuiltinPlugins,
  setPluginNotifier,
} from "../../shared/plugins/api";
import { fitAllArtboards } from "../../features/editor/camera";
import { useUiStore } from "../../shared/stores/uiStore";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { exportPng, exportSvg, openFile, saveProject } from "../../features/editor/fileIo";
import { copySelection, pasteClipboard } from "../../features/editor/clipboard";
import { alignSelection } from "../../features/tools/align";
import {
  clearBooleanPreview,
  previewBooleanOp,
  runBooleanOp,
  type BooleanOp,
} from "../../features/tools/booleanOps";
import { commitShapeBuilder } from "../../features/tools/shapeBuilderTool";
import { openUserManual } from "../../features/editor/openManual";
import { simplifySelection } from "../../features/tools/simplifyPath";
import { convertTextToOutlines } from "../../features/tools/textToOutlines";
import { fitToArtboard, fitToSelection, setZoomCentered } from "../../features/editor/camera";
import { Button } from "../../shared/ui/Button";
import clsx from "clsx";

function viewportSize() {
  const el = document.querySelector(".shell__main") as HTMLElement | null;
  return { w: el?.clientWidth ?? 1200, h: el?.clientHeight ?? 800 };
}

export function AppShell() {
  const mode = useUiStore((s) => s.mode);
  const rightTab = useUiStore((s) => s.rightTab);
  const setRightTab = useUiStore((s) => s.setRightTab);
  const temporal = useDocumentStore.temporal;
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const flash = (msg: string) => {
    setStatusMsg(msg);
    window.setTimeout(() => setStatusMsg(null), 2800);
  };

  useEffect(() => {
    registerBuiltinPlugins();
    setPluginNotifier(flash);
  }, []);

  const onBoolean = async (op: BooleanOp) => {
    try {
      await runBooleanOp(op);
      flash(`Boolean ${op} applied`);
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="shell">
      <TitleBar
        onOpen={() => void openFile()}
        onSave={() => void saveProject()}
        onExportSvg={() => void exportSvg()}
        onExportPng={() =>
          void exportPng().catch((e) => flash(e instanceof Error ? e.message : String(e)))
        }
        onUndo={() => {
          temporal.getState().undo();
          useUiStore.getState().markDirty();
        }}
        onRedo={() => {
          temporal.getState().redo();
          useUiStore.getState().markDirty();
        }}
        onCopy={() => void copySelection()}
        onPaste={() => void pasteClipboard()}
        onBoolean={(op) => void onBoolean(op)}
        onBooleanPreview={(op) => {
          if (!op) clearBooleanPreview();
          else void previewBooleanOp(op);
        }}
        onSimplify={() => {
          simplifySelection();
          flash("Simplified selected paths");
        }}
        onGroup={() => {
          useDocumentStore.getState().groupSelection();
          useUiStore.getState().markDirty();
        }}
        onUngroup={() => {
          const sel = useDocumentStore.getState().selection[0];
          if (sel) useDocumentStore.getState().ungroup(sel);
          useUiStore.getState().markDirty();
        }}
        onConvertOutlines={() => {
          const sel = useDocumentStore.getState().selection[0];
          if (!sel) {
            flash("Select a text object first");
            return;
          }
          try {
            convertTextToOutlines(sel);
            flash("Converted text to outlines");
          } catch (e) {
            flash(e instanceof Error ? e.message : String(e));
          }
        }}
        onFitArtboard={() => {
          const { w, h } = viewportSize();
          fitToArtboard(w, h);
        }}
        onFitAllArtboards={() => {
          const { w, h } = viewportSize();
          fitAllArtboards(w, h);
        }}
        onFitSelection={() => {
          const { w, h } = viewportSize();
          fitToSelection(w, h);
        }}
        onZoom={(z) => {
          const { w, h } = viewportSize();
          setZoomCentered(z, w, h);
        }}
        onApplyClip={() => {
          useDocumentStore.getState().applyClipMask();
          useUiStore.getState().markDirty();
          flash("Clip mask applied (last selected = mask)");
        }}
        onReleaseClip={() => {
          useDocumentStore.getState().releaseClipMask();
          useUiStore.getState().markDirty();
          flash("Clip mask released");
        }}
        onAddArtboard={() => {
          useDocumentStore.getState().addArtboard();
          useUiStore.getState().markDirty();
          const { w, h } = viewportSize();
          fitToArtboard(w, h);
          flash("Artboard added");
        }}
        onCreateSymbol={() => {
          const before = useDocumentStore.getState().selection.length;
          if (!before) {
            flash("Select objects to create a symbol");
            return;
          }
          useDocumentStore.getState().createSymbolFromSelection();
          useUiStore.getState().markDirty();
          flash("Symbol created");
        }}
        onDetachSymbol={() => {
          const { doc, selection } = useDocumentStore.getState();
          const id = selection[0];
          if (!id || doc.nodes[id]?.type !== "symbolInstance") {
            flash("Select a symbol instance to detach");
            return;
          }
          useDocumentStore.getState().detachSymbol(id);
          useUiStore.getState().markDirty();
          flash("Symbol detached");
        }}
        onCommitShapeBuilder={() => {
          void commitShapeBuilder().then(() => flash("Shape builder committed"));
        }}
        onOpenManual={() => {
          void openUserManual()
            .then(() => flash("Opened user manual"))
            .catch((e) =>
              flash(e instanceof Error ? e.message : "Could not open user manual"),
            );
        }}
      />
      <Toolbar />
      <div className="shell__body">
        <ToolsRail />
        <main className="shell__main">
          {mode === "convert" ? <ConverterView /> : <EditorViewport />}
          {statusMsg && <div className="toast">{statusMsg}</div>}
        </main>
        {mode === "edit" && (
          <aside className="shell__right panel-enter">
            <div className="right-tabs">
              <button
                type="button"
                className={clsx(rightTab === "layers" && "active")}
                onClick={() => setRightTab("layers")}
              >
                Layers
              </button>
              <button
                type="button"
                className={clsx(rightTab === "properties" && "active")}
                onClick={() => setRightTab("properties")}
              >
                Props
              </button>
              <button
                type="button"
                className={clsx(rightTab === "artboards" && "active")}
                onClick={() => setRightTab("artboards")}
              >
                Boards
              </button>
              <button
                type="button"
                className={clsx(rightTab === "symbols" && "active")}
                onClick={() => setRightTab("symbols")}
              >
                Symbols
              </button>
              <button
                type="button"
                className={clsx(rightTab === "plugins" && "active")}
                onClick={() => setRightTab("plugins")}
              >
                Plug
              </button>
            </div>
            <div className="right-body">
              {rightTab === "layers" && <LayersPanel />}
              {rightTab === "properties" && <PropertiesPanel />}
              {rightTab === "artboards" && <ArtboardsPanel />}
              {rightTab === "symbols" && <SymbolsPanel />}
              {rightTab === "plugins" && <PluginsPanel onNotify={flash} />}
            </div>
            <div className="ops-bar">
              <span className="ops-label">Align</span>
              <div className="align-bar">
                <Button variant="ghost" onClick={() => alignSelection("left")}>L</Button>
                <Button variant="ghost" onClick={() => alignSelection("center")}>C</Button>
                <Button variant="ghost" onClick={() => alignSelection("right")}>R</Button>
                <Button variant="ghost" onClick={() => alignSelection("top")}>T</Button>
                <Button variant="ghost" onClick={() => alignSelection("middle")}>M</Button>
                <Button variant="ghost" onClick={() => alignSelection("bottom")}>B</Button>
              </div>
              <span className="ops-label">Boolean</span>
              <div
                className="bool-bar"
                onMouseLeave={() => clearBooleanPreview()}
              >
                {(
                  [
                    ["union", "Unite"],
                    ["intersect", "Inter"],
                    ["subtract", "Sub"],
                    ["exclude", "Xor"],
                  ] as const
                ).map(([op, label]) => (
                  <Button
                    key={op}
                    variant="ghost"
                    onMouseEnter={() => void previewBooleanOp(op)}
                    onFocus={() => void previewBooleanOp(op)}
                    onClick={() => void onBoolean(op)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <Button
                variant="subtle"
                onClick={() => {
                  void commitShapeBuilder().then(() => flash("Shape builder committed"));
                }}
              >
                Commit Shape Builder
              </Button>
            </div>
          </aside>
        )}
      </div>
      <StatusBar />
      <style>{`
        .shell {
          height: 100%;
          display: grid;
          grid-template-rows: var(--titlebar-h) var(--toolbar-h) 1fr var(--statusbar-h);
          background: var(--bg-0);
        }
        .shell__body {
          display: grid;
          grid-template-columns: var(--tool-rail-w) 1fr ${mode === "edit" ? "var(--right-panel-w)" : "0px"};
          min-height: 0;
        }
        .shell__main {
          position: relative;
          min-width: 0;
          min-height: 0;
          overflow: hidden;
        }
        .toast {
          position: absolute;
          left: 50%;
          bottom: 1rem;
          transform: translateX(-50%);
          background: var(--bg-2);
          border: 1px solid var(--border);
          color: var(--fg-0);
          padding: 0.45rem 0.85rem;
          border-radius: 8px;
          font-size: 0.8rem;
          z-index: 5;
          box-shadow: var(--shadow-soft);
          animation: panelIn 180ms ease-out;
        }
        .shell__right {
          display: grid;
          grid-template-rows: auto 1fr auto;
          gap: 0.5rem;
          padding: 0.5rem;
          background: var(--bg-1);
          border-left: 1px solid var(--border);
          min-height: 0;
        }
        .right-tabs {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 0.25rem;
          background: var(--bg-2);
          padding: 3px;
          border-radius: 8px;
          border: 1px solid var(--border);
        }
        .right-tabs button {
          border: 0;
          background: transparent;
          color: var(--fg-1);
          border-radius: 6px;
          padding: 0.35rem;
          font-size: 0.78rem;
          font-weight: 600;
        }
        .right-tabs button.active {
          background: rgba(184,255,60,0.14);
          color: var(--accent);
        }
        .right-body { min-height: 0; }
        .right-body .sv-panel { height: 100%; }
        .ops-bar { display: grid; gap: 0.35rem; }
        .ops-label {
          font-size: 0.68rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--fg-1);
        }
        .align-bar, .bool-bar {
          display: grid;
          gap: 0.25rem;
        }
        .align-bar { grid-template-columns: repeat(6, 1fr); }
        .bool-bar { grid-template-columns: repeat(2, 1fr); }
        .ops-bar .sv-btn { padding: 0.35rem 0; font-size: 0.72rem; }
      `}</style>
    </div>
  );
}
