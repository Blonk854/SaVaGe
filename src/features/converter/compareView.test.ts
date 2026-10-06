import { describe, expect, it } from "vitest";
import { COMPARE_ZOOM_MAX, COMPARE_ZOOM_MIN, comparePan, nextCompareZoom } from "./compareView";

describe("compare view", () => {
  it("zooms both panes together and clamps the range", () => {
    expect(nextCompareZoom(1, -1)).toBeCloseTo(1.1);
    expect(nextCompareZoom(2, 1)).toBeCloseTo(2 / 1.1);
    expect(nextCompareZoom(COMPARE_ZOOM_MIN, 10)).toBe(COMPARE_ZOOM_MIN);
    expect(nextCompareZoom(COMPARE_ZOOM_MAX, -10)).toBe(COMPARE_ZOOM_MAX);
  });

  it("applies the same pan delta to the shared view", () => {
    expect(comparePan(4, 5, 2, -3)).toEqual({ x: 6, y: 2 });
  });
});
