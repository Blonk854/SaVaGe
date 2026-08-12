import { describe, expect, it } from "vitest";
import { pointInContours, pointInPolygon } from "./pointInPolygon";

describe("pointInPolygon", () => {
  const square: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];

  it("detects inside and outside", () => {
    expect(pointInPolygon(5, 5, square)).toBe(true);
    expect(pointInPolygon(15, 5, square)).toBe(false);
  });

  it("uses even-odd across contours", () => {
    const hole: [number, number][] = [
      [3, 3],
      [7, 3],
      [7, 7],
      [3, 7],
    ];
    expect(pointInContours(5, 5, [[square, hole]])).toBe(false);
    expect(pointInContours(1, 1, [[square, hole]])).toBe(true);
  });
});
