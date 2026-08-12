import { describe, expect, it } from "vitest";
import {
  patternStampsAlong,
  polylineLength,
  scatterStampsAlong,
} from "./brushStamps";

describe("brushStamps", () => {
  const line = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ];

  it("measures polyline length", () => {
    expect(polylineLength(line)).toBe(100);
  });

  it("places pattern stamps at spacing", () => {
    const stamps = patternStampsAlong(line, 20);
    expect(stamps.length).toBe(5);
    expect(stamps[0].x).toBeCloseTo(20);
    expect(stamps[0].angle).toBeCloseTo(0);
  });

  it("scatters with deterministic seed", () => {
    const a = scatterStampsAlong(line, {
      spacing: 25,
      jitter: 8,
      scaleMin: 0.5,
      scaleMax: 1.5,
      seed: 0.33,
    });
    const b = scatterStampsAlong(line, {
      spacing: 25,
      jitter: 8,
      scaleMin: 0.5,
      scaleMax: 1.5,
      seed: 0.33,
    });
    expect(a).toEqual(b);
    expect(a.some((s) => Math.abs(s.y) > 0.01)).toBe(true);
  });
});
