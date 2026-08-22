import { describe, expect, it } from "vitest";
import { parsePathD } from "./deserialize";

describe("parsePathD", () => {
  it("parses cubic, smooth cubic, and quadratic commands", () => {
    const [cubic] = parsePathD("M 0 0 C 0 10 10 10 10 0");
    expect(cubic.points).toHaveLength(2);
    expect(cubic.points[0].handleOut).toEqual({ x: 0, y: 10 });
    expect(cubic.points[1].handleIn).toEqual({ x: 10, y: 10 });

    const [smooth] = parsePathD("M 0 0 C 0 8 8 8 8 0 S 16 8 16 0");
    expect(smooth.points).toHaveLength(3);
    expect(smooth.points[1].handleOut?.x).toBeCloseTo(8);
    expect(smooth.points[1].handleOut?.y).toBeCloseTo(-8);

    const [quad] = parsePathD("M 0 0 Q 10 10 20 0");
    expect(quad.points).toHaveLength(2);
    expect(quad.points[0].handleOut).toBeTruthy();
    expect(quad.points[1].x).toBe(20);
  });

  it("keeps arc endpoints instead of dropping the segment", () => {
    const [arc] = parsePathD("M 0 0 A 10 10 0 0 1 20 0");
    expect(arc.points.map((p) => [p.x, p.y])).toEqual([
      [0, 0],
      [20, 0],
    ]);
  });

  it("closes subpaths on Z", () => {
    const [sp] = parsePathD("M 0 0 L 10 0 L 10 10 Z");
    expect(sp.closed).toBe(true);
    expect(sp.points).toHaveLength(3);
  });
});
