/** Idle hover does not drive tools, snapping, or store writes. */
export function pointerMoveNeedsToolUpdate(buttons: number, panning: boolean): boolean {
  return panning || buttons !== 0;
}
