import { describe, expect, it, vi } from "vitest";
import { useUiStore } from "./uiStore";

describe("uiStore dirty flag", () => {
  it("notifies once when markDirty is repeated before a paint", () => {
    useUiStore.setState({ dirty: false });
    const listener = vi.fn();
    const stop = useUiStore.subscribe(listener);
    useUiStore.getState().markDirty();
    useUiStore.getState().markDirty();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(useUiStore.getState().dirty).toBe(true);
    stop();
    useUiStore.getState().clearDirty();
  });

  it("does not notify when pan, zoom, or hover are unchanged", () => {
    useUiStore.setState({ panX: 10, panY: 20, zoom: 1, hoverNodeId: null, frameMs: 1, dirty: false });
    const listener = vi.fn();
    const stop = useUiStore.subscribe(listener);
    useUiStore.getState().setPan(10, 20);
    useUiStore.getState().setZoom(1);
    useUiStore.getState().setHoverNodeId(null);
    useUiStore.getState().setFrameMs(1.04);
    useUiStore.getState().setFrameMs(1);
    expect(listener).not.toHaveBeenCalled();
    stop();
  });
});
