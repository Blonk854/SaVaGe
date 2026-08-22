import { describe, expect, it } from "vitest";
import { outlineCommandsToSubpaths } from "../../features/tools/fontOutlines";

describe("outlineCommandsToSubpaths", () => {
  it("converts TrueType-style quadratic commands to cubic subpaths", () => {
    const subs = outlineCommandsToSubpaths([
      { type: "M", x: 0, y: 0 },
      { type: "Q", x1: 10, y1: 0, x: 10, y: 10 },
      { type: "L", x: 0, y: 10 },
      { type: "Z" },
    ]);
    expect(subs).toHaveLength(1);
    expect(subs[0].closed).toBe(true);
    expect(subs[0].points.length).toBeGreaterThanOrEqual(3);
    expect(subs[0].points[0].handleOut).toBeTruthy();
    expect(subs[0].points[1].handleIn).toBeTruthy();
  });

  it("keeps cubic CFF commands", () => {
    const subs = outlineCommandsToSubpaths([
      { type: "M", x: 0, y: 0 },
      { type: "C", x1: 0, y1: 5, x2: 5, y2: 10, x: 10, y: 10 },
      { type: "Z" },
    ]);
    expect(subs[0].points).toHaveLength(2);
    expect(subs[0].points[0].handleOut).toEqual({ x: 0, y: 5 });
    expect(subs[0].points[1].handleIn).toEqual({ x: 5, y: 10 });
  });
});
