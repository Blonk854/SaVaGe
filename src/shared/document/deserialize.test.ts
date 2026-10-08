import { describe, expect, it } from "vitest";
import {
  describeParserError,
  svgStringToDocument,
  SvgParseError,
  type DropReport,
} from "./deserialize";
import { documentToSvgString, safeEmbeddedImageHref } from "./serialize";
import { isSafePaintColor } from "./svgPaints";
import { createEmptyDocument } from "./emptyDocument";
import { defaultStroke, defaultTransform, type ImageNode, type PathNode } from "./types";

function svg(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">${body}</svg>`;
}

describe("svg import hardening", () => {
  it("drops remote and executable paint instead of storing it", () => {
    const doc = svgStringToDocument(
      svg(
        `<rect width="10" height="10" fill="url(https://evil.example/x)" stroke="javascript:alert(1)"/>`,
      ),
    );
    const node = doc.nodes[doc.rootChildIds[0]];
    expect(node?.type).toBe("rect");
    if (node?.type === "rect") {
      expect(node.fill).toEqual({ type: "none" });
      expect(node.stroke.paint).toEqual({ type: "none" });
    }
    const out = documentToSvgString(doc);
    expect(out).not.toContain("evil.example");
    expect(out).not.toContain("javascript:");
  });

  it("does not execute or round-trip event handlers or entity bombs", () => {
    const doc = svgStringToDocument(
      svg(`<rect width="8" height="8" fill="#111111" onclick="window.pwned=1" onload="steal()"/>`),
    );
    const out = documentToSvgString(doc);
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("onload");
    expect(out).not.toContain("pwned");
    expect(() =>
      svgStringToDocument(
        `<!DOCTYPE svg [<!ENTITY x "aaaa">]><svg xmlns="http://www.w3.org/2000/svg"></svg>`,
      ),
    ).toThrow(/document type|entity/i);
    expect(() =>
      svgStringToDocument(
        `<?xml-stylesheet href="https://evil.example/x.css"?><svg xmlns="http://www.w3.org/2000/svg"></svg>`,
      ),
    ).toThrow(/stylesheet/i);
  });

  it("assigns internal ids so duplicate SVG ids cannot overwrite nodes", () => {
    const doc = svgStringToDocument(
      svg(
        `<rect id="keep" width="4" height="4" fill="#111111"/><rect id="keep" x="10" width="6" height="6" fill="#222222"/>`,
      ),
    );
    expect(doc.rootChildIds).toHaveLength(2);
    const [first, second] = doc.rootChildIds.map((id) => doc.nodes[id]);
    expect(first.id).not.toBe(second.id);
    expect(first.id).not.toBe("keep");
    expect(first.name).toBe("keep");
    expect(second.name).toBe("keep");
  });

  it("rejects over-deep grouping before it reaches the document store", () => {
    const depth = 260;
    const open = "<g>".repeat(depth);
    const close = "</g>".repeat(depth);
    expect(() => svgStringToDocument(svg(`${open}<rect width="1" height="1"/>${close}`))).toThrow(
      /depth/i,
    );
  });

  it("defaults non-finite geometry instead of storing NaN", () => {
    const doc = svgStringToDocument(svg(`<rect width="nope" height="8" x="also" fill="#b8ff3c"/>`));
    const node = doc.nodes[doc.rootChildIds[0]];
    expect(node?.type).toBe("rect");
    if (node?.type === "rect") {
      expect(node.width).toBe(0);
      expect(node.height).toBe(8);
      expect(Number.isFinite(node.transform.x)).toBe(true);
      expect(node.fill.type).toBe("solid");
    }
  });
});

describe("svg serialization hardening", () => {
  it("escapes names and omits remote image hrefs", () => {
    const doc = createEmptyDocument(40, 40, "Export");
    doc.nodes.mark = {
      id: `x"><script>`,
      name: `Quote "name"`,
      type: "rect",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      transform: defaultTransform(),
      width: 4,
      height: 4,
      rx: 0,
      ry: 0,
      fill: { type: "solid", color: `#fff"><img`, opacity: 1 },
      stroke: defaultStroke("#000", 0),
    };
    const remote: ImageNode = {
      id: "pic",
      name: "pic",
      type: "image",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      transform: defaultTransform(0, 0),
      href: "https://evil.example/x.png",
      width: 10,
      height: 10,
    };
    doc.nodes.pic = remote;
    doc.rootChildIds = ["mark", "pic"];
    const svgMarkup = documentToSvgString(doc);
    expect(svgMarkup).toContain("&quot;");
    expect(svgMarkup).toContain("&lt;script");
    expect(svgMarkup).not.toContain(`id="x">`);
    expect(svgMarkup).not.toContain("https://evil.example");
    expect(svgMarkup).not.toContain("<image");
    expect(safeEmbeddedImageHref("https://evil.example/x.png")).toBeNull();
    expect(safeEmbeddedImageHref("data:image/png;base64,abc=")).toBe("data:image/png;base64,abc=");
  });
});

describe("safe paint colors", () => {
  it("accepts local colors and rejects remote or script values", () => {
    expect(isSafePaintColor("#B8FF3C")).toBe(true);
    expect(isSafePaintColor("rgb(1, 2, 3)")).toBe(true);
    expect(isSafePaintColor("rebeccapurple")).toBe(true);
    expect(isSafePaintColor("url(https://evil.example)")).toBe(false);
    expect(isSafePaintColor("javascript:alert(1)")).toBe(false);
    expect(isSafePaintColor("data:image/svg+xml;base64,AAAA")).toBe(false);
  });
});

describe("import options", () => {
  it("generates fresh ids by default", () => {
    const doc = svgStringToDocument(svg(`<rect id="keep" width="4" height="4"/>`));
    const node = doc.nodes[doc.rootChildIds[0]];
    expect(node.id).not.toBe("keep");
    expect(node.name).toBe("keep");
  });

  it("preserveIds reuses valid unique ids only", () => {
    const doc = svgStringToDocument(svg(`<rect id="keep" width="4" height="4"/>`), "t", {
      preserveIds: true,
    });
    expect(doc.nodes.keep?.type).toBe("rect");

    const dup = svgStringToDocument(
      svg(`<rect id="keep" width="4" height="4"/><rect id="keep" x="10" width="6" height="6"/>`),
      "t",
      { preserveIds: true },
    );
    expect(dup.rootChildIds).toHaveLength(2);
    expect(dup.rootChildIds).not.toContain("keep");

    for (const bad of ["__proto__", "constructor", "has space", "a".repeat(65)]) {
      const d = svgStringToDocument(svg(`<rect id="${bad}" width="4" height="4"/>`), "t", {
        preserveIds: true,
      });
      expect(d.rootChildIds).toHaveLength(1);
      expect(d.rootChildIds[0]).not.toBe(bad);
    }
  });

  it("SvgParseError carries a line number", () => {
    let caught: unknown;
    try {
      svgStringToDocument('<svg xmlns="http://www.w3.org/2000/svg">\n<rect width="1"\n<rect/></svg>');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SvgParseError);
    const error = caught as SvgParseError;
    expect(error.message).toMatch(/Invalid SVG/);
    expect(typeof error.line).toBe("number");
    expect(error.line).toBeGreaterThanOrEqual(1);
  });

  it("describeParserError reads Chromium and jsdom formats", () => {
    const chromium = describeParserError(
      "This page contains the following errors:\nerror on line 14 at column 3: Opening and ending tag mismatch\nBelow is a rendering of the page up to the first error.",
    );
    expect(chromium.line).toBe(14);
    expect(chromium.column).toBe(3);
    expect(chromium.message).toMatch(/line 14/);

    const jsdom = describeParserError("3:1: disallowed character in attribute name.");
    expect(jsdom.line).toBe(3);
    expect(jsdom.column).toBe(1);
  });

  it("reports unsupported constructs", () => {
    const report: DropReport = { dropped: new Map() };
    svgStringToDocument(
      svg(
        `<style>x</style><rect filter="url(#f)" width="1" height="1"/><use href="#a"/><defs><filter id="f"/></defs>`,
      ),
      "t",
      { report },
    );
    expect(report.dropped.get("<style>")).toBe(1);
    expect(report.dropped.get("filter attribute")).toBe(1);
    expect(report.dropped.get("<use>")).toBe(1);
    expect(report.dropped.has("<filter>")).toBe(false);
  });

  it("context carries image nodes over", () => {
    const doc = createEmptyDocument(40, 40, "Img");
    const image: ImageNode = {
      id: "img1",
      name: "img1",
      type: "image",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      transform: defaultTransform(0, 0),
      href: "data:image/png;base64,abc=",
      width: 10,
      height: 10,
    };
    doc.nodes.img1 = image;
    doc.rootChildIds = ["img1"];
    const report: DropReport = { dropped: new Map() };
    const back = svgStringToDocument(documentToSvgString(doc), "Img", {
      report,
      context: { nodes: doc.nodes, symbols: doc.symbols },
    });
    expect(back.nodes.img1?.type).toBe("image");
    expect((back.nodes.img1 as ImageNode).href).toBe(image.href);
    expect(report.dropped.size).toBe(0);
  });

  it("closed curved paths keep their point count across round trips", () => {
    const doc = createEmptyDocument(100, 100, "Curve");
    const path: PathNode = {
      id: "p1",
      name: "p1",
      type: "path",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      transform: defaultTransform(),
      subpaths: [
        {
          closed: true,
          points: [
            { id: "a", x: 10, y: 10, handleIn: { x: 0, y: 10 }, handleOut: { x: 20, y: 10 }, type: "symmetric" },
            { id: "b", x: 50, y: 10, handleIn: { x: 40, y: 0 }, handleOut: { x: 60, y: 20 }, type: "smooth" },
            { id: "c", x: 50, y: 50, handleIn: { x: 60, y: 40 }, handleOut: { x: 40, y: 60 }, type: "smooth" },
            { id: "d", x: 10, y: 50, handleIn: { x: 10, y: 60 }, handleOut: { x: 10, y: 40 }, type: "smooth" },
          ],
        },
      ],
      fill: { type: "none" },
      stroke: defaultStroke("#000000", 1),
      fillRule: "nonzero",
    };
    doc.nodes.p1 = path;
    doc.rootChildIds = ["p1"];

    const once = svgStringToDocument(documentToSvgString(doc), "Curve", { preserveIds: true });
    const twice = svgStringToDocument(documentToSvgString(once), "Curve", { preserveIds: true });
    const pathOnce = once.nodes.p1;
    const pathTwice = twice.nodes.p1;
    expect(pathOnce?.type).toBe("path");
    expect(pathTwice?.type).toBe("path");
    if (pathOnce?.type === "path" && pathTwice?.type === "path") {
      expect(pathOnce.subpaths[0].points).toHaveLength(4);
      expect(pathTwice.subpaths[0].points).toHaveLength(4);
    }
    expect(documentToSvgString(twice)).toBe(documentToSvgString(once));
  });
});
