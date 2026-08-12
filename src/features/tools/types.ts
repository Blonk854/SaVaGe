import type { ToolId } from "../../shared/stores/uiStore";

export interface ToolEvent {
  sx: number;
  sy: number;
  wx: number;
  wy: number;
  shiftKey: boolean;
  altKey: boolean;
  button: number;
  buttons: number;
}

export interface Tool {
  id: ToolId;
  onPointerDown(e: ToolEvent): void;
  onPointerMove(e: ToolEvent): void;
  onPointerUp(e: ToolEvent): void;
  onKeyDown?(e: KeyboardEvent): void;
}
