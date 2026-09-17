import { describe, expect, it } from "vitest";
import {
  displayName,
  firstRasterPath,
  formatBytes,
  formatSourceMetadata,
  inspectDroppedPaths,
  isRasterPath,
  parseImagePreview,
} from "./rasterFiles";

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

  it("explains why a drop cannot be converted", () => {
    expect(inspectDroppedPaths([])).toEqual({
      kind: "rejected",
      message: expect.stringContaining("Nothing was dropped"),
    });
    expect(inspectDroppedPaths(["C:\\docs\\notes.svg"])).toEqual({
      kind: "rejected",
      message: "notes.svg is a .svg file. Drop PNG, JPEG, GIF, WEBP, BMP, or TIFF.",
    });
    expect(inspectDroppedPaths(["readme.txt", "notes.pdf"])).toMatchObject({
      kind: "rejected",
      message: expect.stringContaining("none are supported raster images"),
    });
    expect(inspectDroppedPaths(["readme.txt", "mark.jpg"])).toEqual({
      kind: "raster",
      path: "mark.jpg",
    });
    expect(displayName("C:\\Users\\me\\secret\\logo.png")).toBe("logo.png");
  });

  it("formats source metadata without the full path", () => {
    expect(formatBytes(800)).toBe("800 B");
    expect(formatBytes(12_288)).toBe("12 KB");
    expect(formatSourceMetadata("logo.png", {
      format: "png",
      width: 1200,
      height: 800,
      byteSize: 1_572_864,
    })).toBe("logo.png · PNG · 1200×800 · 1.5 MB");
  });

  it("rejects preview payloads that are not bounded image metadata", () => {
    expect(() => parseImagePreview("data:image/png;base64,abc")).toThrow("invalid metadata");
    expect(
      parseImagePreview({
        dataUrl: "data:image/png;base64,abc",
        width: 64,
        height: 32,
        byteSize: 1200,
        format: "PNG",
      }),
    ).toMatchObject({ width: 64, height: 32, format: "PNG" });
  });
});
