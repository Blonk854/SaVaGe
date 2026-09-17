import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "./emptyDocument";
import { parseSavageDocument, validateSavageDocument } from "./parseSavage";
import { defaultTransform, type GroupNode, type RectNode } from "./types";

function rect(id: string): RectNode {
  return {
    id,
    name: id,
    type: "rect",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: defaultTransform(),
    width: 10,
    height: 10,
    rx: 0,
    ry: 0,
    fill: { type: "none" },
    stroke: {
      paint: { type: "none" },
      width: 0,
      lineCap: "butt",
      lineJoin: "miter",
      miterLimit: 4,
      dashArray: [],
      dashOffset: 0,
      align: "center",
    },
  };
}

describe("parseSavageDocument", () => {
  it("loads a valid project", () => {
    const src = createEmptyDocument(400, 300, "Poster");
    const doc = parseSavageDocument(JSON.stringify(src));
    expect(doc.name).toBe("Poster");
    expect(doc.width).toBe(400);
    expect(doc.rootChildIds).toEqual([]);
  });

  it("rejects truncated JSON and non-documents", () => {
    expect(() => parseSavageDocument("{")).toThrow(/JSON/);
    expect(() => parseSavageDocument(JSON.stringify({ hello: true }))).toThrow(/Unrecognized/);
  });

  it("rejects node-map keys that disagree with node ids", () => {
    const doc = createEmptyDocument();
    doc.nodes.key = rect("different-id");
    doc.rootChildIds = ["key"];

    expect(() => parseSavageDocument(JSON.stringify(doc))).toThrow(/key.*id/i);
  });

  it("rejects nodes with more than one scene owner", () => {
    const doc = createEmptyDocument();
    const group: GroupNode = {
      id: "group",
      name: "group",
      type: "group",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      transform: defaultTransform(),
      children: ["shape"],
    };
    doc.nodes.group = group;
    doc.nodes.shape = rect("shape");
    doc.rootChildIds = ["group", "shape"];

    expect(() => parseSavageDocument(JSON.stringify(doc))).toThrow(/more than one owner/i);
  });

  it("rejects unreachable ownership cycles and missing clip references", () => {
    const cyclic = createEmptyDocument();
    const groupA = {
      ...rect("a"),
      type: "group" as const,
      children: ["b"],
    };
    const groupB = {
      ...rect("b"),
      type: "group" as const,
      children: ["a"],
    };
    cyclic.nodes = { a: groupA, b: groupB };
    expect(() => parseSavageDocument(JSON.stringify(cyclic))).toThrow(/unreachable/i);

    const missingClip = createEmptyDocument();
    missingClip.nodes.shape = { ...rect("shape"), clipPathId: "missing" };
    missingClip.rootChildIds = ["shape"];
    expect(() => parseSavageDocument(JSON.stringify(missingClip))).toThrow(/missing clip/i);
  });

  it("rejects recursive symbol expansion", () => {
    const doc = createEmptyDocument();
    const symbolNode = {
      ...rect("instance"),
      type: "symbolInstance" as const,
      symbolId: "recursive",
      width: 10,
      height: 10,
    };
    doc.symbols.recursive = {
      id: "recursive",
      name: "Recursive",
      width: 10,
      height: 10,
      rootChildIds: ["instance"],
      nodes: { instance: symbolNode },
    };

    expect(() => parseSavageDocument(JSON.stringify(doc))).toThrow(/recursive symbol/i);
  });

  it("validates an in-memory document at the same commit boundary", () => {
    const src = createEmptyDocument(400, 300, "Poster");
    expect(validateSavageDocument(src).name).toBe("Poster");
    src.nodes.key = rect("different-id");
    src.rootChildIds = ["key"];
    expect(() => validateSavageDocument(src)).toThrow(/key.*id/i);
  });
});
