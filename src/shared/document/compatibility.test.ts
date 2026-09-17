import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { applyMat, transformToMatrix } from "../geometry/transform";
import { svgStringToDocument } from "./deserialize";
import { documentToSvgString } from "./serialize";
import {
  PROJECT_READER_WRITER,
  PROJECT_SCHEMA_VERSION,
  SVG_SUPPORT,
  UNSUPPORTED_SVG_TAGS,
} from "./compatibility";
import { parseSavageDocument, unsupportedProjectVersionMessage } from "./parseSavage";
import { SKIP_TAGS } from "./svgPaints";

const fixtures = resolve(__dirname, "../../../fixtures/compatibility");

function readFixture(name: string) {
  return readFileSync(join(fixtures, name), "utf8");
}

function copyFixture(name: string) {
  const dir = mkdtempSync(join(tmpdir(), "savage-compat-"));
  const dest = join(dir, name);
  copyFileSync(join(fixtures, name), dest);
  return dest;
}

describe("format compatibility matrix", () => {
  it("documents reader/writer policy for schema 1 and unknown future versions", () => {
    expect(PROJECT_SCHEMA_VERSION).toBe(1);
    expect(PROJECT_READER_WRITER.some((row) => row.format.includes("schema 1"))).toBe(true);
    expect(
      PROJECT_READER_WRITER.find((row) => row.format.includes("≥2"))?.reader,
    ).toBe("unsupported");
    expect(SVG_SUPPORT.find((row) => row.format.includes("script"))?.reader).toBe("unsupported");
    for (const tag of UNSUPPORTED_SVG_TAGS) {
      expect(SKIP_TAGS.has(tag)).toBe(true);
    }
  });

  it("loads a copy of a legacy version-1 project without rewriting the fixture", () => {
    const original = readFixture("legacy-v1.savage");
    const copyPath = copyFixture("legacy-v1.savage");
    const doc = parseSavageDocument(readFileSync(copyPath, "utf8"));
    expect(doc.version).toBe(1);
    expect(doc.name).toBe("Legacy Poster");
    expect(doc.nodes.mark?.type).toBe("rect");
    expect(readFileSync(copyPath, "utf8")).toBe(original);
    expect(readFixture("legacy-v1.savage")).toBe(original);
  });

  it("preserves nested skew from the corrected-transform fixture", () => {
    const original = readFixture("skew-nested.savage");
    const copyPath = copyFixture("skew-nested.savage");
    const doc = parseSavageDocument(readFileSync(copyPath, "utf8"));
    const outer = doc.nodes.outer;
    expect(outer?.type).toBe("group");
    if (outer?.type !== "group") return;
    expect(outer.transform.skewX).toBe(45);
    expect(outer.transform.scaleX).toBe(2);
    expect(outer.transform.scaleY).toBe(3);
    const point = applyMat(transformToMatrix(outer.transform), 1, 2);
    expect(point.x).toBeCloseTo(16);
    expect(point.y).toBeCloseTo(4);
    expect(readFileSync(copyPath, "utf8")).toBe(original);
  });

  it("rejects a future project version without repairing it", () => {
    const original = readFixture("future-v2.savage");
    const copyPath = copyFixture("future-v2.savage");
    expect(() => parseSavageDocument(readFileSync(copyPath, "utf8"))).toThrow(
      unsupportedProjectVersionMessage(2),
    );
    expect(readFileSync(copyPath, "utf8")).toBe(original);
    expect(original).toContain("experimental");
  });

  it("does not treat a future recovery envelope as a readable project", () => {
    const original = readFixture("future-recovery.json");
    const envelope = JSON.parse(original) as { formatVersion: number; contents: string };
    expect(envelope.formatVersion).toBe(2);
    expect(() => parseSavageDocument(envelope.contents)).toThrow(/version 2/);
    expect(readFixture("future-recovery.json")).toBe(original);
  });

  it("drops unsupported SVG constructs instead of claiming a round trip", () => {
    const original = readFixture("unsupported.svg");
    const copyPath = copyFixture("unsupported.svg");
    const doc = svgStringToDocument(readFileSync(copyPath, "utf8"), "Hostile");
    const svg = documentToSvgString(doc);
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("foreignObject");
    expect(svg).not.toContain("example.com");
    expect(svg.toLowerCase()).not.toContain("<use");
    const node = doc.nodes[doc.rootChildIds[0]];
    expect(node?.type).toBe("rect");
    if (node?.type === "rect") {
      expect(node.width).toBe(12);
      expect(node.height).toBe(6);
    }
    expect(readFileSync(copyPath, "utf8")).toBe(original);
  });
});
