import { describe, expect, it } from "vitest";
import {
  defaultMeshGradient,
  meshIndex,
  parseHexColor,
  sampleMeshCell,
} from "./mesh";

describe("mesh", () => {
  it("indexes grid points by column/row", () => {
    expect(meshIndex(2, 0, 0)).toBe(0);
    expect(meshIndex(2, 2, 0)).toBe(2);
    expect(meshIndex(2, 0, 1)).toBe(3);
  });

  it("parses hex colors", () => {
    expect(parseHexColor("#B8FF3C")).toEqual({ r: 184, g: 255, b: 60 });
    expect(parseHexColor("#fff")).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("bilinear-samples cell center between corners", () => {
    const mesh = defaultMeshGradient(100, 100);
    const c = sampleMeshCell(mesh, 0, 0, 0.5, 0.5);
    expect(c.r).toBeGreaterThan(0);
    expect(c.g).toBeGreaterThan(0);
    expect(c.a).toBeCloseTo(1);
  });

  it("returns corner color at u=v=0", () => {
    const mesh = defaultMeshGradient(100, 100);
    const c = sampleMeshCell(mesh, 0, 0, 0, 0);
    const expected = parseHexColor(mesh.points[0].color);
    expect(c.r).toBe(expected.r);
    expect(c.g).toBe(expected.g);
    expect(c.b).toBe(expected.b);
  });
});
