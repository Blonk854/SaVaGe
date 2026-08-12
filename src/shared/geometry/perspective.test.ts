import { describe, expect, it } from "vitest";
import {
  defaultPerspectiveGrid,
  perspectiveRays,
  snapToPerspective,
} from "./perspective";

describe("perspective", () => {
  it("returns no rays when off", () => {
    const grid = defaultPerspectiveGrid();
    expect(perspectiveRays(grid)).toHaveLength(0);
  });

  it("builds 1-point fan including horizon", () => {
    const grid = { ...defaultPerspectiveGrid(), mode: "1point" as const };
    const rays = perspectiveRays(grid);
    expect(rays.length).toBeGreaterThan(5);
    const horizon = rays.find((r) => r.y1 === r.y2);
    expect(horizon).toBeTruthy();
  });

  it("snaps near a ray", () => {
    const grid = {
      ...defaultPerspectiveGrid({ x: 0, y: 0, w: 400, h: 400 }),
      mode: "1point" as const,
      vp1: { x: 200, y: 100 },
      horizonY: 100,
      groundY: 400,
      rays: 4,
    };
    const near = snapToPerspective(200, 250, grid, 40);
    // Should stay near the vertical ray under the VP
    expect(Math.abs(near.x - 200)).toBeLessThan(5);
  });

  it("leaves far points alone", () => {
    const grid = { ...defaultPerspectiveGrid(), mode: "1point" as const };
    const p = snapToPerspective(9999, 9999, grid, 5);
    expect(p.x).toBe(9999);
  });
});
