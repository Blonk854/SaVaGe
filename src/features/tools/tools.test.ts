import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyDocument } from "../../shared/document/emptyDocument";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { useUiStore } from "../../shared/stores/uiStore";
import type { ToolEvent } from "./types";
import {
  ellipseTool,
  lineTool,
  polygonTool,
  rectTool,
  starTool,
} from "./shapeTools";
import { penTool, resetPenTool } from "./penTool";
import { pencilTool } from "./pencilTool";
import { brushTool } from "./brushTool";
import { patternBrushTool, scatterBrushTool } from "./patternScatterBrushes";
import { activateEditorTool } from "./activateTool";
import { zoomTool } from "./cameraTools";

function evt(wx: number, wy: number, extra: Partial<ToolEvent> = {}): ToolEvent {
  return {
    sx: wx,
    sy: wy,
    wx,
    wy,
    shiftKey: false,
    altKey: false,
    button: 0,
    buttons: 1,
    ...extra,
  };
}

function resetDoc() {
  useDocumentStore.setState({ doc: createEmptyDocument(), selection: [] });
  useUiStore.setState({ zoom: 1, snap: false });
  resetPenTool();
}

describe("drawing tools", () => {
  beforeEach(resetDoc);

  it("draws a rectangle from drag and discards a click", () => {
    rectTool.onPointerDown(evt(10, 20));
    rectTool.onPointerMove(evt(50, 60));
    rectTool.onPointerUp(evt(50, 60));
    const ids = useDocumentStore.getState().doc.rootChildIds;
    expect(ids).toHaveLength(1);
    const node = useDocumentStore.getState().doc.nodes[ids[0]];
    expect(node.type).toBe("rect");
    if (node.type === "rect") {
      expect(node.width).toBe(40);
      expect(node.height).toBe(40);
      expect(node.transform.x).toBe(10);
      expect(node.transform.y).toBe(20);
    }

    resetDoc();
    rectTool.onPointerDown(evt(0, 0));
    rectTool.onPointerUp(evt(0, 0));
    expect(useDocumentStore.getState().doc.rootChildIds).toHaveLength(0);
  });

  it("draws an ellipse from center with Alt", () => {
    ellipseTool.onPointerDown(evt(100, 100, { altKey: true }));
    ellipseTool.onPointerMove(evt(140, 120, { altKey: true }));
    ellipseTool.onPointerUp(evt(140, 120, { altKey: true }));
    const node = Object.values(useDocumentStore.getState().doc.nodes)[0];
    expect(node.type).toBe("ellipse");
    if (node.type === "ellipse") {
      expect(node.rx).toBe(40);
      expect(node.ry).toBe(20);
      expect(node.transform.x).toBe(100);
      expect(node.transform.y).toBe(100);
    }
  });

  it("constrains a line to 45° with Shift", () => {
    lineTool.onPointerDown(evt(0, 0));
    lineTool.onPointerMove(evt(40, 5, { shiftKey: true }));
    lineTool.onPointerUp(evt(40, 5, { shiftKey: true }));
    const node = Object.values(useDocumentStore.getState().doc.nodes)[0];
    expect(node.type).toBe("line");
    if (node.type === "line") {
      expect(node.y2).toBeCloseTo(0, 5);
      expect(node.x2).toBeCloseTo(Math.hypot(40, 5), 5);
    }
  });

  it("grows a polygon and star by drag radius", () => {
    polygonTool.onPointerDown(evt(0, 0));
    polygonTool.onPointerMove(evt(30, 0));
    polygonTool.onPointerUp(evt(30, 0));
    const poly = Object.values(useDocumentStore.getState().doc.nodes)[0];
    expect(poly.type).toBe("path");
    if (poly.type === "path") {
      expect(poly.subpaths[0].closed).toBe(true);
      expect(poly.subpaths[0].points).toHaveLength(6);
      expect(Math.hypot(poly.subpaths[0].points[0].x, poly.subpaths[0].points[0].y)).toBeCloseTo(30, 5);
    }

    resetDoc();
    starTool.onPointerDown(evt(0, 0));
    starTool.onPointerMove(evt(20, 0));
    starTool.onPointerUp(evt(20, 0));
    const star = Object.values(useDocumentStore.getState().doc.nodes)[0];
    expect(star.type).toBe("path");
    if (star.type === "path") {
      expect(star.subpaths[0].points).toHaveLength(10);
    }
  });

  it("discards a click-sized polygon", () => {
    polygonTool.onPointerDown(evt(8, 8));
    polygonTool.onPointerUp(evt(8, 8));
    expect(useDocumentStore.getState().doc.rootChildIds).toHaveLength(0);
  });

  it("creates a pen path, drops the last point, then closes on the first", () => {
    penTool.onPointerDown(evt(0, 0));
    penTool.onPointerUp(evt(0, 0));
    penTool.onPointerDown(evt(20, 0));
    penTool.onPointerUp(evt(20, 0));
    penTool.onPointerDown(evt(20, 20));
    penTool.onPointerUp(evt(20, 20));
    penTool.onKeyDown?.(new KeyboardEvent("keydown", { key: "Backspace" }));
    let path = Object.values(useDocumentStore.getState().doc.nodes)[0];
    expect(path.type).toBe("path");
    if (path.type === "path") expect(path.subpaths[0].points).toHaveLength(2);

    penTool.onPointerDown(evt(0, 20));
    penTool.onPointerUp(evt(0, 20));
    penTool.onPointerDown(evt(1, 1));
    penTool.onPointerUp(evt(1, 1));
    path = Object.values(useDocumentStore.getState().doc.nodes)[0];
    expect(path.type).toBe("path");
    if (path.type === "path") {
      expect(path.subpaths[0].closed).toBe(true);
      expect(path.subpaths[0].points.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps a pencil stroke and discards a click", () => {
    pencilTool.onPointerDown(evt(0, 0));
    pencilTool.onPointerMove(evt(12, 4));
    pencilTool.onPointerMove(evt(24, 0));
    pencilTool.onPointerUp(evt(24, 0));
    const node = Object.values(useDocumentStore.getState().doc.nodes)[0];
    expect(node.type).toBe("path");
    if (node.type === "path") {
      expect(node.subpaths[0].closed).toBe(false);
      expect(node.subpaths[0].points.length).toBeGreaterThanOrEqual(2);
    }

    resetDoc();
    pencilTool.onPointerDown(evt(0, 0));
    pencilTool.onPointerUp(evt(0, 0));
    expect(useDocumentStore.getState().doc.rootChildIds).toHaveLength(0);
  });

  it("builds a closed calligraphy brush ribbon", () => {
    brushTool.onPointerDown(evt(0, 0));
    brushTool.onPointerMove(evt(16, 4));
    brushTool.onPointerMove(evt(32, 0));
    brushTool.onPointerUp(evt(32, 0));
    const node = Object.values(useDocumentStore.getState().doc.nodes)[0];
    expect(node.type).toBe("path");
    if (node.type === "path") {
      expect(node.subpaths[0].closed).toBe(true);
      expect(node.subpaths[0].points.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("pattern and scatter brushes stamp groups along a stroke", () => {
    patternBrushTool.onPointerDown(evt(0, 0));
    patternBrushTool.onPointerMove(evt(40, 0));
    patternBrushTool.onPointerUp(evt(40, 0));
    const afterPattern = useDocumentStore.getState();
    expect(afterPattern.doc.rootChildIds.length).toBe(1);
    const group = afterPattern.doc.nodes[afterPattern.doc.rootChildIds[0]];
    expect(group.type).toBe("group");
    if (group.type === "group") expect(group.children.length).toBeGreaterThan(0);

    resetDoc();
    scatterBrushTool.onPointerDown(evt(0, 0));
    scatterBrushTool.onPointerMove(evt(50, 10));
    scatterBrushTool.onPointerUp(evt(50, 10));
    const scatter = Object.values(useDocumentStore.getState().doc.nodes).find((n) => n.type === "group");
    expect(scatter?.type).toBe("group");
  });

  it("does not stamp pattern brushes from a click", () => {
    patternBrushTool.onPointerDown(evt(0, 0));
    patternBrushTool.onPointerUp(evt(0, 0));
    expect(useDocumentStore.getState().doc.rootChildIds).toHaveLength(0);
  });

  it("finishes an in-progress shape when switching tools", () => {
    useUiStore.setState({ activeTool: "rect" });
    rectTool.onPointerDown(evt(10, 10));
    rectTool.onPointerMove(evt(50, 50));
    activateEditorTool("select");
    rectTool.onPointerMove(evt(400, 400));
    const node = Object.values(useDocumentStore.getState().doc.nodes)[0];
    expect(node.type).toBe("rect");
    if (node.type === "rect") {
      expect(node.width).toBe(40);
      expect(node.height).toBe(40);
    }
    expect(useUiStore.getState().activeTool).toBe("select");
  });
});

describe("zoom tool", () => {
  it("zooms in around the cursor", () => {
    useUiStore.setState({ zoom: 1, panX: 0, panY: 0 });
    zoomTool.onPointerDown(evt(100, 40));
    expect(useUiStore.getState().zoom).toBeCloseTo(1.25);
    expect(useUiStore.getState().panX).toBeCloseTo(100 - 100 * 1.25);
  });
});
