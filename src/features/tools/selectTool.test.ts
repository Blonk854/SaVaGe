import { describe, expect, it } from "vitest";
import { applyResizeHandle } from "./selectTool";
import type { Bounds } from "../../shared/geometry/bounds";

const bounds: Bounds = { x: 100, y: 50, w: 80, h: 40 };
const t0 = { x: 100, y: 50, rotation: 0, scaleX: 1, scaleY: 1 };

describe("applyResizeHandle", () => {
  it("keeps the east edge fixed when dragging west", () => {
    const next = applyResizeHandle(t0, bounds, "w", -20, 0, false);
    expect(next.x).toBeCloseTo(80);
    expect(next.y).toBeCloseTo(50);
    expect(next.scaleX).toBeCloseTo(1.25);
    expect(next.scaleY).toBeCloseTo(1);
  });

  it("keeps the south edge fixed when dragging north", () => {
    const next = applyResizeHandle(t0, bounds, "n", 0, -10, false);
    expect(next.y).toBeCloseTo(40);
    expect(next.scaleY).toBeCloseTo(1.25);
    expect(next.x).toBeCloseTo(100);
  });

  it("grows from the opposite corner on south-east", () => {
    const next = applyResizeHandle(t0, bounds, "se", 20, 10, false);
    expect(next.x).toBeCloseTo(100);
    expect(next.y).toBeCloseTo(50);
    expect(next.scaleX).toBeCloseTo(1.25);
    expect(next.scaleY).toBeCloseTo(1.25);
  });
});
