import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  outlineCommandsToSubpaths,
  pickOutlineFontUrl,
} from "./fontOutlines";
import dmSans400 from "../../assets/fonts/dm-sans-latin-400-normal.woff?url";
import dmSans500 from "../../assets/fonts/dm-sans-latin-500-normal.woff?url";
import dmSans700 from "../../assets/fonts/dm-sans-latin-700-normal.woff?url";
import syne400 from "../../assets/fonts/syne-latin-400-normal.woff?url";
import syne700 from "../../assets/fonts/syne-latin-700-normal.woff?url";

const outlineFonts = [
  "dm-sans-latin-400-normal.woff",
  "dm-sans-latin-500-normal.woff",
  "dm-sans-latin-700-normal.woff",
  "syne-latin-400-normal.woff",
  "syne-latin-700-normal.woff",
];

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

describe("outline font assets", () => {
  it("keeps the measured latin weights used for glyph conversion", () => {
    expect(pickOutlineFontUrl("DM Sans Variable", 400)).toBe(dmSans400);
    expect(pickOutlineFontUrl("DM Sans", 500)).toBe(dmSans500);
    expect(pickOutlineFontUrl("DM Sans Variable", 700)).toBe(dmSans700);
    expect(pickOutlineFontUrl("Syne Variable", 400)).toBe(syne400);
    expect(pickOutlineFontUrl("Syne", 700)).toBe(syne700);
  });

  it("loads opentype through the existing dynamic import", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "textToOutlines.ts"),
      "utf8",
    );
    expect(src).toContain('await import("./fontOutlines")');
  });

  it("keeps each outline WOFF in the 12–24 KiB latin-normal band", () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), "../../assets/fonts");
    for (const name of outlineFonts) {
      const path = join(dir, name);
      expect(existsSync(path), path).toBe(true);
      const bytes = statSync(path).size;
      expect(bytes).toBeGreaterThan(12_000);
      expect(bytes).toBeLessThan(24_000);
    }
  });
});

