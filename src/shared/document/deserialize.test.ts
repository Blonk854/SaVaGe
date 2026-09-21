import { describe, expect, it } from "vitest";
import { svgStringToDocument } from "./deserialize";
import { documentToSvgString, safeEmbeddedImageHref } from "./serialize";
import { isSafePaintColor } from "./svgPaints";
import { createEmptyDocument } from "./emptyDocument";
import { defaultStroke, defaultTransform, type ImageNode } from "./types";

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
