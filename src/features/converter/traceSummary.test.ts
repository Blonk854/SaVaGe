import { describe, expect, it } from "vitest";
import { PRESETS } from "./convertApi";
import {
  complexityWarning,
  COMPLEX_BYTE_LIMIT,
  COMPLEX_SHAPE_LIMIT,
  formatTraceSummary,
  parseStoredConvertOptions,
  sourceCaution,
  summarizeTrace,
  writeLastConvertOptions,
  readLastConvertOptions,
} from "./traceSummary";

describe("trace summary", () => {
  it("counts shapes and reads numeric svg dimensions", () => {
    const svg = `<svg width="64px" height="32" viewBox="0 0 1 1"><rect width="1" height="1"/><path d="M0 0"/></svg>`;
    const summary = summarizeTrace(svg, 840);
    expect(summary.shapeCount).toBe(2);
    expect(summary.width).toBe(64);
    expect(summary.height).toBe(32);
    expect(formatTraceSummary(summary)).toMatch(/^64×32 · 2 shapes · .+ · 840 ms$/);
  });

  it("falls back to the viewBox when width and height are not lengths", () => {
    const summary = summarizeTrace(`<svg width="100%" viewBox="0 0 10 20"><path d="M0 0"/></svg>`, 20);
    expect(summary.width).toBe(10);
    expect(summary.height).toBe(20);
    expect(formatTraceSummary({ ...summary, durationMs: 1500 })).toContain("1.5 s");
  });

  it("warns on heavy traces and large sources without rejecting them", () => {
    expect(complexityWarning({ shapeCount: COMPLEX_SHAPE_LIMIT, byteSize: 10 })).toMatch(/Filter speckle/);
    expect(complexityWarning({ shapeCount: 1, byteSize: COMPLEX_BYTE_LIMIT })).toMatch(/Simplify/);
    expect(complexityWarning({ shapeCount: 1, byteSize: 100 })).toBeNull();
    expect(sourceCaution({ width: 32, height: 16, byteSize: 128 })).toBeNull();
    expect(sourceCaution({ width: 4096, height: 100, byteSize: 10 })).toMatch(/16,384/);
    expect(sourceCaution({ width: 4000, height: 2000, byteSize: 16 * 1024 * 1024 })).toMatch(/64 MB/);
  });

  it("restores only complete finite option objects", () => {
    const storage = new MemoryStorage();
    expect(readLastConvertOptions(storage)).toBeNull();
    writeLastConvertOptions(PRESETS.line, storage);
    expect(readLastConvertOptions(storage)).toEqual(PRESETS.line);
    expect(parseStoredConvertOptions("{")).toBeNull();
    expect(parseStoredConvertOptions(JSON.stringify({ ...PRESETS.logo, color_precision: Number.NaN }))).toBeNull();
  });
});

class MemoryStorage implements Pick<Storage, "getItem" | "setItem"> {
  private values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}
