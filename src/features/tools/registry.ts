import type { ToolId } from "../../shared/stores/uiStore";
import type { Tool, ToolEvent } from "./types";
import { selectTool } from "./selectTool";
import { directSelectTool } from "./directSelectTool";
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
import { shapeBuilderTool, clearShapeBuilderSession } from "./shapeBuilderTool";
import { panTool, zoomTool, resumeHistory } from "./cameraTools";

export const IDLE_TOOL_EVENT: ToolEvent = {
  sx: 0,
  sy: 0,
  wx: 0,
  wy: 0,
  shiftKey: false,
  altKey: false,
  button: 0,
  buttons: 0,
};

export function getEditorTool(id: string): Tool {
  switch (id) {
    case "directSelect":
      return directSelectTool;
    case "pan":
      return panTool;
    case "zoom":
      return zoomTool;
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

/** End the current tool's pointer gesture and any session it owns. */
export function finishEditorTool(id: ToolId) {
  getEditorTool(id).onPointerUp(IDLE_TOOL_EVENT);
  if (id === "pen") resetPenTool();
  if (id === "shapeBuilder") clearShapeBuilderSession();
  resumeHistory();
}

export const FREEHAND_TOOLS = new Set<string>([
  "pencil",
  "brush",
  "patternBrush",
  "scatterBrush",
]);
