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

  it("folds skewY into rotation and scale when the first column wins", () => {
    const source = {
      ...defaultTransform(4, 6),
      rotation: 30,
      skewY: 45,
    };
    const m = transformToMatrix(source);

    // R(30) * skewY(45): hypot(a, b) = sqrt(2) must beat hypot(c, d) = 1,
    // so decomposition takes the first-column branch.
    expect(Math.hypot(m.a, m.b)).toBeGreaterThan(Math.hypot(m.c, m.d));

    const recovered = matrixToTransform(m);
    expect(recovered).toBeTruthy();
    // skewY folds away: rotation shifts to 75 and skewX absorbs the shear.
    expect(recovered!.rotation).toBeCloseTo(75);
    expect(recovered!.scaleX).toBeCloseTo(Math.SQRT2);
    expect(recovered!.scaleY).toBeCloseTo(Math.SQRT1_2);
    expect(recovered!.skewX).toBeCloseTo((Math.atan(0.5) * 180) / Math.PI);
    expect(recovered!.skewY).toBe(0);

    const rebuilt = transformToMatrix(recovered!);
    for (const [px, py] of [
      [0, 0],
      [3, 7],
      [-2, 5],
    ]) {
      expect(applyMat(rebuilt, px, py).x).toBeCloseTo(applyMat(m, px, py).x);
      expect(applyMat(rebuilt, px, py).y).toBeCloseTo(applyMat(m, px, py).y);
    }
  });

  it("recovers rotation from the second axis when scaleX collapses the first column", () => {
    const source = {
      ...defaultTransform(5, -3),
      rotation: 40,
      scaleX: 0,
      scaleY: 2,
    };
    const m = transformToMatrix(source);

    // R(40) * scale(0, 2): the first column vanishes, so decomposition must
    // take the else branch and read rotation off the second column.
    expect(Math.hypot(m.a, m.b)).toBeLessThan(1e-12);

    const recovered = matrixToTransform(m);
    expect(recovered).toBeTruthy();
    expect(recovered!.x).toBeCloseTo(5);
    expect(recovered!.y).toBeCloseTo(-3);
    expect(recovered!.rotation).toBeCloseTo(40);
    expect(recovered!.scaleX).toBe(0);
    expect(recovered!.scaleY).toBeCloseTo(2);
    expect(recovered!.skewX).toBe(0);
    expect(recovered!.skewY).toBe(0);

    const rebuilt = transformToMatrix(recovered!);
    for (const [px, py] of [
      [0, 0],
      [3, 7],
      [-2, 5],
    ]) {
      expect(applyMat(rebuilt, px, py).x).toBeCloseTo(applyMat(m, px, py).x);
      expect(applyMat(rebuilt, px, py).y).toBeCloseTo(applyMat(m, px, py).y);
    }
  });

  it("returns the zero transform when both columns vanish", () => {
    const source = {
      ...defaultTransform(5, -3),
      rotation: 40,
      scaleX: 0,
      scaleY: 0,
    };
    const m = transformToMatrix(source);

    // R(40) * scale(0, 0): both columns vanish, so rotation is unrecoverable
    // and decomposition must fall through to the zero-transform guard.
    expect(Math.hypot(m.a, m.b)).toBeLessThan(1e-12);
    expect(Math.hypot(m.c, m.d)).toBeLessThan(1e-12);

    const recovered = matrixToTransform(m);
    expect(recovered).toBeTruthy();
    // Translation survives; rotation drops to 0 and both scales read zero.
    expect(recovered!.x).toBeCloseTo(5);
    expect(recovered!.y).toBeCloseTo(-3);
    expect(recovered!.rotation).toBe(0);
    expect(recovered!.scaleX).toBe(0);
    expect(recovered!.scaleY).toBe(0);
    expect(recovered!.skewX).toBe(0);
    expect(recovered!.skewY).toBe(0);

    // Rebuilding reproduces the original matrix: every point maps to (5, -3).
    const rebuilt = transformToMatrix(recovered!);
    for (const [px, py] of [
      [0, 0],
      [3, 7],
      [-2, 5],
    ]) {
      expect(applyMat(rebuilt, px, py).x).toBeCloseTo(applyMat(m, px, py).x);
      expect(applyMat(rebuilt, px, py).y).toBeCloseTo(applyMat(m, px, py).y);
    }
  });

  it("round-trips a reflection by folding the flip into a negative scaleY", () => {
    // scaleX: -1 has determinant -1, but decomposition absorbs the flip as
    // rotation 180 + scaleY -1, so the matricesClose guard accepts it.
    const m = transformToMatrix({ ...defaultTransform(3, 4), scaleX: -1, scaleY: 1 });
    expect(m.a * m.d - m.b * m.c).toBeLessThan(0);

    const recovered = matrixToTransform(m);
    expect(recovered).toBeTruthy();
    expect(recovered!.x).toBeCloseTo(3);
    expect(recovered!.y).toBeCloseTo(4);
    expect(Math.abs(recovered!.rotation)).toBeCloseTo(180);
    expect(recovered!.scaleX).toBeCloseTo(1);
    expect(recovered!.scaleY).toBeCloseTo(-1);

    const rebuilt = transformToMatrix(recovered!);
    for (const [px, py] of [
      [0, 0],
      [3, 7],
      [-2, 5],
    ]) {
      expect(applyMat(rebuilt, px, py).x).toBeCloseTo(applyMat(m, px, py).x);
      expect(applyMat(rebuilt, px, py).y).toBeCloseTo(applyMat(m, px, py).y);
    }
  });

  it("returns null when extreme shear exceeds the reconstruction guard", () => {
    // u12/scaleX = 1e12 pushes skewX to within float noise of 90 degrees, so
    // the atan -> tan round-trip cannot rebuild c within the 1e-6 epsilon.
    const m = { a: 1, b: 0, c: 1e12, d: 1, e: 5, f: -3 };
    expect(matrixToTransform(m)).toBeNull();
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
