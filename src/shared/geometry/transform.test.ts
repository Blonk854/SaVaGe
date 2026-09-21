import { describe, expect, it } from "vitest";
import {
  applyMat,
  identity,
  invertMat,
  matrixToTransform,
  transformForNewParent,
  transformToMatrix,
} from "./transform";
import { defaultTransform } from "../document/types";
import { transformForWorldSize } from "./bounds";

describe("invertMat", () => {
  it("inverts translation and scale", () => {
    const m = transformToMatrix({ ...defaultTransform(12, -4), scaleX: 2, scaleY: 0.5 });
    const inv = invertMat(m);
    expect(inv).toBeTruthy();
    const p = applyMat(m, 3, 8);
    const back = applyMat(inv!, p.x, p.y);
    expect(back.x).toBeCloseTo(3);
    expect(back.y).toBeCloseTo(8);
  });

  it("returns identity for identity", () => {
    const inv = invertMat(identity());
    expect(inv).toBeTruthy();
    expect(applyMat(inv!, 4, -3)).toEqual({ x: 4, y: -3 });
  });
});

describe("transformToMatrix", () => {
  it("matches the serialized translate-scale-skew order", () => {
    const matrix = transformToMatrix({
      ...defaultTransform(10, -2),
      scaleX: 2,
      scaleY: 3,
      skewX: 45,
    });

    // skewX(45) maps (1, 2) to (3, 2), then scale and translation map it to (16, 4).
    const point = applyMat(matrix, 1, 2);
    expect(point.x).toBeCloseTo(16);
    expect(point.y).toBeCloseTo(4);
  });
});

describe("matrixToTransform", () => {
  it("round-trips translation, rotation, scale, and skewX", () => {
    const source = {
      ...defaultTransform(12, -8),
      rotation: 35,
      scaleX: 2,
      scaleY: 0.5,
      skewX: 20,
    };
    const recovered = matrixToTransform(transformToMatrix(source));
    expect(recovered).toBeTruthy();
    const point = applyMat(transformToMatrix(source), 3, 7);
    expect(applyMat(transformToMatrix(recovered!), 3, 7).x).toBeCloseTo(point.x);
    expect(applyMat(transformToMatrix(recovered!), 3, 7).y).toBeCloseTo(point.y);
  });

  it("recovers a parent-relative local for mixed rotation and scale", () => {
    const parent = transformToMatrix({ ...defaultTransform(), rotation: 90, scaleX: 2, scaleY: 1 });
    const world = transformToMatrix({ ...defaultTransform(10, 0) });
    const local = transformForNewParent(world, parent);
    expect(local).toBeTruthy();
    const composed = transformToMatrix(local!);
    const again = {
      a: parent.a * composed.a + parent.c * composed.b,
      b: parent.b * composed.a + parent.d * composed.b,
      c: parent.a * composed.c + parent.c * composed.d,
      d: parent.b * composed.c + parent.d * composed.d,
      e: parent.a * composed.e + parent.c * composed.f + parent.e,
      f: parent.b * composed.e + parent.d * composed.f + parent.f,
    };
    expect(applyMat(again, 0, 0).x).toBeCloseTo(applyMat(world, 0, 0).x);
    expect(applyMat(again, 0, 0).y).toBeCloseTo(applyMat(world, 0, 0).y);
  });
});

describe("transformForWorldSize", () => {
  it("scales so world bounds match the requested size", () => {
    const t = defaultTransform(0, 0);
    const next = transformForWorldSize(t, { x: 0, y: 0, w: 50, h: 20 }, 100, 10);
    expect(next.scaleX).toBeCloseTo(2);
    expect(next.scaleY).toBeCloseTo(0.5);
  });
});
