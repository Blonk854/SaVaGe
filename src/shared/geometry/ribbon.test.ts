import { describe, expect, it } from "vitest";
import {
  hasVariableWidths,
  ribbonOutline,
  samplesFromPolyline,
} from "./ribbon";

describe("ribbon", () => {
  it("builds a closed outline with left and right sides", () => {
    const outline = ribbonOutline([
      { x: 0, y: 0, width: 10 },
      { x: 100, y: 0, width: 10 },
      { x: 100, y: 50, width: 4 },
    ]);
    expect(outline.length).toBe(6);
    // Left bank for L→R segment sits on +Y (screen-down) side
    expect(outline[0].y).toBeGreaterThan(0);
    // Right bank (after reverse) sits on −Y
    expect(outline[outline.length - 1].y).toBeLessThan(0);
  });

  it("detects variable widths vs uniform", () => {
    expect(hasVariableWidths([2, 2, 2], 2)).toBe(false);
    expect(hasVariableWidths([2, 8, 2], 2)).toBe(true);
    expect(hasVariableWidths(undefined, 2)).toBe(false);
  });

  it("falls back to default width when missing", () => {
    const samples = samplesFromPolyline(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      [undefined, 6],
      3,
    );
    expect(samples[0].width).toBe(3);
    expect(samples[1].width).toBe(6);
  });
});
