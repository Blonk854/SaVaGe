import { describe, expect, it } from "vitest";
import { svgStringToDocument } from "../../shared/document/deserialize";
import { docToCode } from "./codeSync";
import { byteLength, formatNumber, minify, prettify, roundNumbers } from "./svgFormat";

const GROUP_SRC =
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">' +
  '<g id="g1">' +
  '<rect id="r1" x="1" y="2" width="30" height="40" fill="#ff0000"/>' +
  '<text id="t1" x="5" y="6" font-family="Inter" font-size="12">Hello</text>' +
  "</g></svg>";

describe("prettify", () => {
  it("indents two spaces per depth and keeps text elements inline", () => {
    const doc = svgStringToDocument(GROUP_SRC, "fmt", { preserveIds: true });
    const code = docToCode(doc);
    const pretty = prettify(code);
    expect(pretty).not.toBeNull();
    // <svg> depth 0, <g> depth 1, <rect> depth 2 → four spaces.
    expect(pretty).toContain("\n    <rect");
    expect(pretty).toContain("\n  <g");

    const xml = new DOMParser().parseFromString(code, "image/svg+xml");
    const textEl = xml.querySelector("text");
    expect(textEl).not.toBeNull();
    const inline = new XMLSerializer().serializeToString(textEl as Element);
    expect(pretty).toContain(`\n    ${inline}`);

    // Round trip: the prettified text parses back to the same SVG.
    const reparsed = svgStringToDocument(pretty as string, "fmt", { preserveIds: true });
    expect(docToCode(reparsed)).toBe(code);
  });

  it("keeps the XML declaration", () => {
    const pretty = prettify('<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(pretty?.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg')).toBe(true);
  });

  it("returns null for invalid XML", () => {
    expect(prettify("<svg")).toBeNull();
  });
});

describe("minify", () => {
  it("removes inter-tag whitespace and leaves text content intact", () => {
    const src =
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">\n' +
      '  <rect id="r1" x="1" y="1" width="5" height="5"/>\n' +
      '  <text id="t1" x="0" y="0" font-family="Inter" font-size="12">a b</text>\n' +
      "</svg>";
    const mini = minify(src);
    expect(mini).not.toBeNull();
    expect(mini).not.toContain(">\n<");
    expect(mini).toContain(">a b</text>");

    const original = docToCode(svgStringToDocument(src, "m", { preserveIds: true }));
    const reparsed = docToCode(svgStringToDocument(mini as string, "m", { preserveIds: true }));
    expect(reparsed).toBe(original);
  });
});

describe("roundNumbers", () => {
  it("rounds only whitelisted numeric attributes", () => {
    const out = roundNumbers(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect id="r1.5" data-name="n 2.25" x="1.23456" fill="#123456" d="M 1.11111 2.22222" width="3.99999"/></svg>',
      1,
    );
    expect(out).toContain('x="1.2"');
    expect(out).toContain('d="M 1.1 2.2"');
    expect(out).toContain('width="4"');
    expect(out).toContain('id="r1.5"');
    expect(out).toContain('data-name="n 2.25"');
    expect(out).toContain('fill="#123456"');
  });

  it("clamps the precision to 0–4", () => {
    const src = '<svg xmlns="http://www.w3.org/2000/svg"><rect x="1.23456789"/></svg>';
    expect(roundNumbers(src, 99)).toContain('x="1.2346"');
    expect(roundNumbers(src, -2)).toContain('x="1"');
  });

  it("returns null for invalid XML", () => {
    expect(roundNumbers("<svg", 1)).toBeNull();
  });
});

describe("formatNumber", () => {
  it("normalizes negative zero and rounds half up", () => {
    expect(formatNumber(-0.00001, 2)).toBe("0");
    expect(formatNumber(2.5, 0)).toBe("3");
    expect(formatNumber(1e-7, 4)).toBe("0");
  });
});

describe("byteLength", () => {
  it("counts UTF-8 bytes, not UTF-16 code units", () => {
    expect(byteLength("abc")).toBe(3);
    expect(byteLength("→")).toBe(3);
  });
});
