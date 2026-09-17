import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
import {
  exportPng,
  exportSvg,
  confirmDocumentReplacement,
  newProject,
  openFile,
  saveProject,
} from "../../features/editor/fileIo";
import { copySelection, pasteClipboard } from "../../features/editor/clipboard";
import { AlignBooleanBar } from "../../features/tools/AlignBooleanBar";
import {
  clearBooleanPreview,
  previewBooleanOp,
  runBooleanOp,
  type BooleanOp,
} from "../../features/tools/booleanOps";
import { commitShapeBuilder } from "../../features/tools/shapeBuilderTool";
import { openUserManual } from "../../features/editor/openManual";
import { exportDiagnostics } from "../../shared/diagnostics";
import { simplifySelection } from "../../features/tools/simplifyPath";
import { convertTextToOutlines } from "../../features/tools/textToOutlines";
import { fitToArtboard, fitToSelection, setZoomCentered } from "../../features/editor/camera";
import { isTypingTarget } from "../../shared/ui/keyboard";
import type { NoticeKind } from "../../shared/ui/notice";
import {
  useProjectSessionStore,
} from "../../shared/stores/projectSessionStore";
import { useProjectSaveLabel } from "../../shared/stores/projectSaveLabel";
import clsx from "clsx";
import {
  offerRecoveryOnStartup,
  startRecoveryScheduler,
} from "../../features/editor/recovery";

function viewportSize() {
  const el = document.querySelector(".shell__main") as HTMLElement | null;
  return { w: el?.clientWidth ?? 1200, h: el?.clientHeight ?? 800 };
}

export function AppShell() {
  const mode = useUiStore((s) => s.mode);
  const rightTab = useUiStore((s) => s.rightTab);
  const setRightTab = useUiStore((s) => s.setRightTab);
  const temporal = useDocumentStore.temporal;
  const displayName = useProjectSessionStore((s) => s.displayName);
  const saveLabel = useProjectSaveLabel();
  const modified = saveLabel !== "Saved";
  const [toast, setToast] = useState<{ message: string; kind: NoticeKind } | null>(null);

  const flash = (message: string, kind: NoticeKind = "info") => {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), 2800);
  };

  useEffect(() => {
    registerBuiltinPlugins();
    setPluginNotifier(flash);
  }, []);

  useEffect(() => startRecoveryScheduler((message) => flash(message)), []);

  useEffect(() => {
    void offerRecoveryOnStartup((message) => flash(message, "warn")).catch((error) =>
      flash(error instanceof Error ? error.message : String(error), "error"),
    );
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onCloseRequested(async (event) => {
        if (!(await confirmDocumentReplacement())) event.preventDefault();
      })
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const runSave = (saveAs = false) => {
    void saveProject(saveAs)
      .then((result) => {
        if (result === "saved") flash("Project saved", "success");
      })
      .catch((error) => flash(error instanceof Error ? error.message : String(error), "error"));
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key !== "s" && key !== "n" && key !== "o") return;
      event.preventDefault();
      if (key === "s") runSave(event.shiftKey);
      else if (key === "n") void newProject();
      else void openFile().catch((error) => flash(error instanceof Error ? error.message : String(error), "error"));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const onBoolean = async (op: BooleanOp) => {
    try {
      await runBooleanOp(op);
      flash(`Boolean ${op} applied`, "success");
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), "error");
    }
  };

  return (
    <div className="shell">
      <TitleBar
        documentTitle={displayName}
        modified={modified}
        saveLabel={saveLabel}
        onNew={() => void newProject()}
        onOpen={() =>
          void openFile().catch((e) => flash(e instanceof Error ? e.message : String(e), "error"))
        }
        onSave={() => runSave()}
        onSaveAs={() => runSave(true)}
        onExportSvg={() => void exportSvg()}
        onExportPng={() =>
          void exportPng().catch((e) => flash(e instanceof Error ? e.message : String(e), "error"))
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
          flash("Simplified selected paths", "success");
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
            flash("Select a text object first", "warn");
            return;
          }
          void convertTextToOutlines(sel)
            .then(() => flash("Converted text to outlines", "success"))
            .catch((e) => flash(e instanceof Error ? e.message : String(e), "error"));
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
          const ok = useDocumentStore.getState().applyClipMask();
          useUiStore.getState().markDirty();
          flash(ok ? "Clip mask applied (last selected = mask)" : "Select objects, then the mask last", ok ? "success" : "warn");
        }}
        onReleaseClip={() => {
          const ok = useDocumentStore.getState().releaseClipMask();
          useUiStore.getState().markDirty();
          flash(ok ? "Clip mask released" : "No clip mask on the selection", ok ? "success" : "warn");
        }}
        onAddArtboard={() => {
          useDocumentStore.getState().addArtboard();
          useUiStore.getState().markDirty();
          const { w, h } = viewportSize();
          fitToArtboard(w, h);
          flash("Artboard added", "success");
        }}
        onCreateSymbol={() => {
          const before = useDocumentStore.getState().selection.length;
          if (!before) {
            flash("Select objects to create a symbol", "warn");
            return;
          }
          useDocumentStore.getState().createSymbolFromSelection();
          useUiStore.getState().markDirty();
          flash("Symbol created", "success");
        }}
        onDetachSymbol={() => {
          const { doc, selection } = useDocumentStore.getState();
          const id = selection[0];
          if (!id || doc.nodes[id]?.type !== "symbolInstance") {
            flash("Select a symbol instance to detach", "warn");
            return;
          }
          useDocumentStore.getState().detachSymbol(id);
          useUiStore.getState().markDirty();
          flash("Symbol detached", "success");
        }}
        onCommitShapeBuilder={() => {
          void commitShapeBuilder().then(() => flash("Shape builder committed", "success"));
        }}
        onOpenManual={() => {
          void openUserManual()
            .then(() => flash("Opened user manual", "success"))
            .catch((e) =>
              flash(e instanceof Error ? e.message : "Could not open user manual", "error"),
            );
        }}
        onExportDiagnostics={() => {
          void exportDiagnostics()
            .then((path) => {
              if (path) flash("Diagnostics exported", "success");
            })
            .catch((e) =>
              flash(e instanceof Error ? e.message : "Could not export diagnostics", "error"),
            );
        }}
      />
      <Toolbar />
      <div className="shell__body">
        <ToolsRail />
        <main className="shell__main">
          {mode === "convert" ? <ConverterView /> : <EditorViewport />}
          {toast && (
            <div
              className={`sv-toast sv-toast--${toast.kind}`}
              role={toast.kind === "error" ? "alert" : "status"}
            >
              {toast.message}
            </div>
          )}
        </main>
        {mode === "edit" && (
          <aside className="shell__right panel-enter">
            <div className="right-tabs">
              <button
                type="button"
                className={clsx(rightTab === "layers" && "active")}
                aria-label="Layers"
                onClick={() => setRightTab("layers")}
              >
                Layers
              </button>
              <button
                type="button"
                className={clsx(rightTab === "properties" && "active")}
                aria-label="Properties"
                onClick={() => setRightTab("properties")}
              >
                Properties
              </button>
              <button
                type="button"
                className={clsx(rightTab === "artboards" && "active")}
                aria-label="Artboards"
                onClick={() => setRightTab("artboards")}
              >
                Artboards
              </button>
              <button
                type="button"
                className={clsx(rightTab === "symbols" && "active")}
                aria-label="Symbols"
                onClick={() => setRightTab("symbols")}
              >
                Symbols
              </button>
              <button
                type="button"
                className={clsx(rightTab === "plugins" && "active")}
                aria-label="Plugins"
                onClick={() => setRightTab("plugins")}
              >
                Plugins
              </button>
            </div>
            <div className="right-body">
              {rightTab === "layers" && <LayersPanel />}
              {rightTab === "properties" && <PropertiesPanel />}
              {rightTab === "artboards" && <ArtboardsPanel />}
              {rightTab === "symbols" && <SymbolsPanel />}
              {rightTab === "plugins" && <PluginsPanel onNotify={(message) => flash(message, "error")} />}
            </div>
            <AlignBooleanBar onNotify={flash} />
          </aside>
        )}
      </div>
      <StatusBar />
      <style>{`
        .shell {
          height: 100%;
          display: grid;
          grid-template-rows: auto auto minmax(0, 1fr) auto;
          background: var(--bg-0);
          min-width: 0;
        }
        .shell__body {
          display: grid;
          grid-template-columns: var(--tool-rail-w) minmax(0, 1fr) ${mode === "edit" ? "minmax(0, var(--right-panel-w))" : "0px"};
          min-height: 0;
          min-width: 0;
        }
        .shell__main {
          position: relative;
          min-width: 0;
          min-height: 0;
          overflow: hidden;
        }
        .shell__right {
          display: grid;
          grid-template-rows: auto minmax(0, 1fr) auto;
          gap: 0.5rem;
          padding: 0.5rem;
          background: var(--bg-1);
          border-left: 1px solid var(--border);
          min-height: 0;
          min-width: 0;
          overflow: auto;
        }
        .right-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 0.25rem;
          background: var(--bg-2);
          padding: 3px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border);
        }
        .right-tabs button {
          flex: 1 1 auto;
          min-width: min(100%, 5.2rem);
          border: 0;
          background: transparent;
          color: var(--fg-1);
          border-radius: 6px;
          padding: 0.35rem 0.4rem;
          font-size: 0.72rem;
          font-weight: 600;
          white-space: nowrap;
        }
        .right-tabs button.active {
          background: var(--selection-fill);
          color: var(--selection-fg);
        }
        .right-body { min-height: 0; min-width: 0; overflow: auto; }
        .right-body .sv-panel { height: 100%; }
      `}</style>
    </div>
  );
}
