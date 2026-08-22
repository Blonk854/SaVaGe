import { describe, expect, it } from "vitest";
import { firstRasterPath, isRasterPath } from "./rasterFiles";

describe("rasterFiles", () => {
  it("detects common raster extensions", () => {
    expect(isRasterPath("C:\\art\\logo.PNG")).toBe(true);
    expect(isRasterPath("/tmp/photo.webp")).toBe(true);
    expect(isRasterPath("notes.svg")).toBe(false);
  });

  it("picks the first raster among dropped paths", () => {
    expect(firstRasterPath(["readme.txt", "mark.jpg", "other.png"])).toBe("mark.jpg");
    expect(firstRasterPath(["a.svg"])).toBeNull();
  });
});
