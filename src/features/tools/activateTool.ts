import { useUiStore, type ToolId } from "../../shared/stores/uiStore";
import { beginShapeBuilder } from "./shapeBuilderTool";
import { finishEditorTool } from "./registry";

/** Switch tools with session cleanup (in-progress pen, shape builder, mid-drag). */
export function activateEditorTool(next: ToolId) {
  const ui = useUiStore.getState();
  if (ui.activeTool !== next) finishEditorTool(ui.activeTool);
  ui.setActiveTool(next);
  if (next === "shapeBuilder") void beginShapeBuilder();
}
