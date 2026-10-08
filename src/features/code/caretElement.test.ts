import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "../../shared/document/emptyDocument";
import {
  defaultStroke,
  defaultTransform,
  solidFill,
  type RectNode,
  type SvgDocument,
} from "../../shared/document/types";
import { docToCode } from "./codeSync";
import {
  elementIdAtOffset,
  lineOfElementId,
  lineOfOffset,
  offsetOfLine,
} from "./caretElement";

const SAMPLE = [
  `<svg xmlns="http://www.w3.org/2000/svg">`,
  `  <g id="g1">`,
  `    <rect id="a" width="10" height="10"/>`,
  `    <rect width="1"/>`,
  `    <rect id="b" width="4" height="4"/>`,
  `  </g>`,
  `</svg>`,
].join("\n");

function offsetOf(text: string, needle: string, from = 0): number {
  const idx = text.indexOf(needle, from);
  if (idx < 0) throw new Error(`needle not found: ${needle}`);
  return idx;
}

function rect(id: string, x: number): RectNode {
  return {
    id,
    name: id,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: defaultTransform(x, 0),
    type: "rect",
    width: 10,
    height: 10,
    rx: 0,
    ry: 0,
    fill: solidFill("#ff0000"),
    stroke: defaultStroke(),
  };
}

function twoRectDoc(): SvgDocument {
  const doc = createEmptyDocument(100, 100, "Two Rects");
  const r1 = rect("r1", 0);
  const r2 = rect("r2", 20);
  doc.nodes[r1.id] = r1;
  doc.nodes[r2.id] = r2;
  doc.rootChildIds = [r1.id, r2.id];
  return doc;
}

describe("elementIdAtOffset", () => {
  it("returns the id of the element whose tag holds the caret", () => {
    expect(elementIdAtOffset(SAMPLE, offsetOf(SAMPLE, 'id="a"'))).toBe("a");
  });

  it("returns the group id when the caret is on the group start tag", () => {
    expect(elementIdAtOffset(SAMPLE, offsetOf(SAMPLE, '<g id="g1">'))).toBe("g1");
  });

  it("returns the enclosing group id for whitespace between children", () => {
    const between = offsetOf(SAMPLE, '<rect width="1"') - 1;
    expect(elementIdAtOffset(SAMPLE, between)).toBe("g1");
  });

  it("prefers the innermost element with an id", () => {
    expect(elementIdAtOffset(SAMPLE, offsetOf(SAMPLE, 'id="b"'))).toBe("b");
  });

  it("returns null before the root element", () => {
    expect(elementIdAtOffset(SAMPLE, 0)).toBe(null);
  });

  it("skips elements without an id", () => {
    expect(elementIdAtOffset(SAMPLE, offsetOf(SAMPLE, '<rect width="1"'))).toBe("g1");
  });
});

describe("lineOfElementId", () => {
  it("returns distinct lines for elements in a serialized document", () => {
    const text = docToCode(twoRectDoc());
    const l1 = lineOfElementId(text, "r1");
    const l2 = lineOfElementId(text, "r2");
    expect(l1).not.toBe(null);
    expect(l2).not.toBe(null);
    expect(l1).not.toBe(l2);
  });

  it("returns null for unknown ids", () => {
    expect(lineOfElementId(SAMPLE, "nope")).toBe(null);
  });

  it("finds single-quoted ids", () => {
    expect(lineOfElementId(`<svg>\n<rect id='x'/>\n</svg>`, "x")).toBe(2);
  });
});

describe("line/offset helpers", () => {
  it("offsetOfLine(lineOfOffset(k)) never passes k", () => {
    const text = "one\ntwo\nthree\nfour";
    for (const k of [0, 2, 4, 7, 9, 14, text.length]) {
      expect(offsetOfLine(text, lineOfOffset(text, k))).toBeLessThanOrEqual(k);
    }
  });

  it("offsetOfLine of line 1 is 0", () => {
    expect(offsetOfLine("a\nb\nc", 1)).toBe(0);
  });

  it("lineOfOffset counts newlines before the offset", () => {
    expect(lineOfOffset("a\nb\nc", 0)).toBe(1);
    expect(lineOfOffset("a\nb\nc", 2)).toBe(2);
    expect(lineOfOffset("a\nb\nc", 4)).toBe(3);
  });
});
