import { useEffect, useRef, useState } from "react";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { useUiStore } from "../../shared/stores/uiStore";
import { screenToWorld } from "../../shared/geometry/transform";
import { drawDocument, drawGrid, drawOverlays } from "./renderer/drawDocument";
import { drawSelectionChrome } from "./renderer/drawHandles";
import { selectTool, setSelectHandles, setSelectHitContext } from "../tools/selectTool";
import {
  ellipseTool,
  lineTool,
  polygonTool,
  rectTool,
  starTool,
} from "../tools/shapeTools";
import { penTool } from "../tools/penTool";
import { pencilTool } from "../tools/pencilTool";
import { brushTool } from "../tools/brushTool";
import {
  patternBrushTool,
  scatterBrushTool,
} from "../tools/patternScatterBrushes";
import {
  shapeBuilderTool,
  clearShapeBuilderSession,
  beginShapeBuilder,
} from "../tools/shapeBuilderTool";
import { directSelectTool } from "../tools/directSelectTool";
import type { Tool, ToolEvent } from "../tools/types";
import { nanoid } from "nanoid";
import {
  defaultStroke,
  defaultTransform,
  solidFill,
  type TextNode,
} from "../../shared/document/types";
import { copySelection, pasteClipboard } from "./clipboard";
import { TextEditOverlay } from "./TextEditOverlay";
import { fitToArtboard, fitToSelection, setZoomCentered } from "./camera";
import { hitTestTopNode } from "../../shared/geometry/hitTest";
import { snapToPerspective } from "../../shared/geometry/perspective";

function getTool(id: string): Tool {
  switch (id) {
    case "directSelect":
      return directSelectTool;
    case "rect":
      return rectTool;
    case "ellipse":
      return ellipseTool;
    case "line":
      return lineTool;
    case "polygon":
      return polygonTool;
    case "star":
      return starTool;
    case "pen":
      return penTool;
    case "pencil":
      return pencilTool;
    case "brush":
      return brushTool;
    case "patternBrush":
      return patternBrushTool;
    case "scatterBrush":
      return scatterBrushTool;
    case "shapeBuilder":
      return shapeBuilderTool;
    default:
      return selectTool;
  }
}

export function EditorViewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handlesRef = useRef<ReturnType<typeof drawSelectionChrome>>([]);
  const spacePan = useRef(false);
  const panning = useRef(false);
  const lastPan = useRef({ x: 0, y: 0 });
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setSelectHitContext(ctx);

    let raf = 0;
    const loop = () => {
      const ui = useUiStore.getState();
      const { doc, selection } = useDocumentStore.getState();
      if (!ui.dirty) {
        raf = requestAnimationFrame(loop);
        return;
      }
      const t0 = performance.now();
      const parent = canvas.parentElement;
      const w = parent?.clientWidth ?? 800;
      const h = parent?.clientHeight ?? 600;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#0B0D10";
      ctx.fillRect(0, 0, w, h);
      if (ui.showGrid) drawGrid(ctx, w, h, ui.zoom, ui.panX, ui.panY);
      drawDocument(ctx, doc, ui.zoom, ui.panX, ui.panY);
      drawOverlays(ctx, ui.zoom, ui.panX, ui.panY, ui.booleanPreview, ui.perspective);
      handlesRef.current = drawSelectionChrome(
        ctx,
        doc,
        selection,
        ui.zoom,
        ui.panX,
        ui.panY,
        ui.activeTool === "directSelect",
      );
      setSelectHandles(handlesRef.current);
      ui.setFrameMs(performance.now() - t0);
      ui.clearDirty();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const unsubDoc = useDocumentStore.subscribe(() => useUiStore.getState().markDirty());
    const unsubUi = useUiStore.subscribe((s, p) => {
      if (
        s.zoom !== p.zoom ||
        s.panX !== p.panX ||
        s.panY !== p.panY ||
        s.showGrid !== p.showGrid ||
        s.activeTool !== p.activeTool ||
        s.perspective !== p.perspective
      ) {
        useUiStore.getState().markDirty();
      }
    });

    return () => {
      cancelAnimationFrame(raf);
      unsubDoc();
      unsubUi();
    };
  }, []);

  const toEvent = (e: React.PointerEvent): ToolEvent => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const ui = useUiStore.getState();
    let world = screenToWorld(sx, sy, ui.zoom, ui.panX, ui.panY);
    if (ui.snap && ui.perspective.mode !== "off") {
      world = snapToPerspective(world.x, world.y, ui.perspective, 16 / ui.zoom);
    }
    return {
      sx,
      sy,
      wx: world.x,
      wy: world.y,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      button: e.button,
      buttons: e.buttons,
    };
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const store = useDocumentStore.getState();
      const ui = useUiStore.getState();
      const temporal = useDocumentStore.temporal.getState();

      if (e.code === "Space") spacePan.current = true;
      if (e.key === "Delete" || e.key === "Backspace") {
        if ((e.target as HTMLElement)?.tagName === "INPUT") return;
        store.deleteNodes(store.selection);
      }
      if (e.ctrlKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) temporal.redo();
        else temporal.undo();
        ui.markDirty();
      }
      if (e.ctrlKey && e.key.toLowerCase() === "y") {
        e.preventDefault();
        temporal.redo();
        ui.markDirty();
      }
      if (e.ctrlKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        store.selectAll();
      }
      if (e.ctrlKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        store.duplicateSelection();
      }
      if (e.ctrlKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        void copySelection();
      }
      if (e.ctrlKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        void pasteClipboard();
      }
      if (e.ctrlKey && e.key === "0") {
        e.preventDefault();
        const parent = canvasRef.current?.parentElement;
        if (parent) fitToArtboard(parent.clientWidth, parent.clientHeight);
      }
      if (e.ctrlKey && e.key === "1") {
        e.preventDefault();
        const parent = canvasRef.current?.parentElement;
        if (parent) setZoomCentered(1, parent.clientWidth, parent.clientHeight);
      }
      if (e.ctrlKey && e.key === "2") {
        e.preventDefault();
        const parent = canvasRef.current?.parentElement;
        if (parent) fitToSelection(parent.clientWidth, parent.clientHeight);
      }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        store.nudgeSelection(dx, dy);
      }
      const toolMap: Record<string, typeof ui.activeTool> = {
        v: "select",
        a: "directSelect",
        h: "pan",
        r: "rect",
        o: "ellipse",
        l: "line",
        p: "pen",
        b: "brush",
        t: "text",
        s: "shapeBuilder",
      };
      if (!e.ctrlKey && toolMap[e.key.toLowerCase()]) {
        const next = toolMap[e.key.toLowerCase()];
        if (ui.activeTool === "shapeBuilder" && next !== "shapeBuilder") {
          clearShapeBuilderSession();
        }
        ui.setActiveTool(next);
        if (next === "shapeBuilder") void beginShapeBuilder();
      }
      getTool(ui.activeTool).onKeyDown?.(e);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") spacePan.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  return (
    <div className="viewport">
      <canvas
        ref={canvasRef}
        onPointerDown={(e) => {
          const ui = useUiStore.getState();
          if (e.button === 1 || spacePan.current || ui.activeTool === "pan") {
            panning.current = true;
            lastPan.current = { x: e.clientX, y: e.clientY };
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            return;
          }
          if (ui.activeTool === "text") {
            const ev = toEvent(e);
            const node: TextNode = {
              id: nanoid(10),
              name: "Text",
              type: "text",
              visible: true,
              locked: false,
              opacity: 1,
              blendMode: "normal",
              transform: defaultTransform(ev.wx, ev.wy),
              content: "Text",
              fontFamily: "DM Sans Variable",
              fontSize: 32,
              fontWeight: 600,
              letterSpacing: 0,
              lineHeight: 1.2,
              fill: solidFill("#F2F4F7"),
              stroke: defaultStroke("#000000", 0),
            };
            node.stroke.paint = { type: "none" };
            useDocumentStore.getState().addNode(node);
            ui.setActiveTool("select");
            setEditingTextId(node.id);
            return;
          }
          getTool(ui.activeTool).onPointerDown(toEvent(e));
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          ui.markDirty();
        }}
        onDoubleClick={(e) => {
          const ctx = canvasRef.current?.getContext("2d");
          if (!ctx) return;
          const ev = toEvent(e as unknown as React.PointerEvent);
          const hit = hitTestTopNode(
            ctx,
            useDocumentStore.getState().doc,
            ev.wx,
            ev.wy,
            1,
          );
          if (!hit) return;
          const node = useDocumentStore.getState().doc.nodes[hit];
          if (node?.type === "text") {
            useDocumentStore.getState().setSelection([hit]);
            setEditingTextId(hit);
          }
        }}
        onPointerMove={(e) => {
          const ui = useUiStore.getState();
          if (panning.current) {
            const dx = e.clientX - lastPan.current.x;
            const dy = e.clientY - lastPan.current.y;
            lastPan.current = { x: e.clientX, y: e.clientY };
            ui.setPan(ui.panX + dx, ui.panY + dy);
            return;
          }
          getTool(ui.activeTool).onPointerMove(toEvent(e));
          ui.markDirty();
        }}
        onPointerUp={(e) => {
          panning.current = false;
          getTool(useUiStore.getState().activeTool).onPointerUp(toEvent(e));
          useUiStore.getState().markDirty();
        }}
        onWheel={(e) => {
          e.preventDefault();
          const ui = useUiStore.getState();
          const rect = canvasRef.current!.getBoundingClientRect();
          const sx = e.clientX - rect.left;
          const sy = e.clientY - rect.top;
          const before = screenToWorld(sx, sy, ui.zoom, ui.panX, ui.panY);
          const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
          const nextZoom = Math.min(64, Math.max(0.05, ui.zoom * factor));
          const panX = sx - before.x * nextZoom;
          const panY = sy - before.y * nextZoom;
          ui.setZoom(nextZoom);
          ui.setPan(panX, panY);
        }}
      />
      <TextEditOverlay nodeId={editingTextId} onClose={() => setEditingTextId(null)} />
      <style>{`
        .viewport {
          position: relative;
          width: 100%;
          height: 100%;
          min-height: 0;
          overflow: hidden;
          background: var(--bg-0);
        }
        .viewport canvas {
          display: block;
          width: 100%;
          height: 100%;
          touch-action: none;
          cursor: crosshair;
        }
        .text-edit {
          position: absolute;
          z-index: 6;
          margin: 0;
          padding: 0.1rem 0.25rem;
          border: 1px solid var(--accent);
          border-radius: 4px;
          background: rgba(11, 13, 16, 0.92);
          color: var(--fg-0);
          outline: none;
          box-shadow: 0 0 0 2px rgba(184, 255, 60, 0.2);
        }
      `}</style>
    </div>
  );
}
