import { describe, expect, it } from "vitest";
import {
  COMPACT_LAYOUT_MAX_WIDTH,
  WINDOW_MIN,
  canvasBackingStore,
  isCompactLayout,
} from "./windowLayout";

describe("window layout", () => {
  it("keeps the native minimum at or below a 1080p display at 200% scaling", () => {
    expect(WINDOW_MIN.width).toBeLessThanOrEqual(960);
    expect(WINDOW_MIN.height).toBeLessThanOrEqual(600);
  });

  it("treats 1100 CSS pixels as compact so Convert can stack", () => {
    expect(isCompactLayout(COMPACT_LAYOUT_MAX_WIDTH)).toBe(true);
    expect(isCompactLayout(COMPACT_LAYOUT_MAX_WIDTH + 1)).toBe(false);
  });

  it("sizes the canvas backing store for integer device pixels", () => {
    expect(canvasBackingStore(800, 600, 2)).toEqual({ width: 1600, height: 1200, dpr: 2 });
    expect(canvasBackingStore(100, 50, 1.5)).toEqual({ width: 150, height: 75, dpr: 1.5 });
    expect(canvasBackingStore(0, 0, 0).dpr).toBe(1);
  });
});
