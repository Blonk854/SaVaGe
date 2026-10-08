import { describe, expect, it } from "vitest";
import { codeToDoc, docToCode } from "./codeSync";
import { createArtboard, syncDocBoundsFromArtboards } from "../../shared/document/artboards";
import { createEmptyDocument } from "../../shared/document/emptyDocument";
import { projectContents } from "../../shared/stores/projectSessionStore";
import {
  defaultEffects,
  defaultStroke,
  defaultTransform,
  solidFill,
  type GroupNode,
  type ImageNode,
  type PathNode,
  type RectNode,
  type SvgDocument,
  type SymbolInstanceNode,
  type TextNode,
} from "../../shared/document/types";

/**
 * Kitchen-sink document exercising every field SVG text cannot express:
 * locked / blendMode / effects / skew / stroke extras / lineHeight / clipPathId /
 * path point identity, plus carried image and symbol-instance nodes and two artboards.
 */
function kitchenSinkDoc(): SvgDocument {
  const doc = createEmptyDocument(200, 100, "Kitchen Sink");
  const ab1 = createArtboard("Artboard 1", 0, 0, 200, 100, "#ffffff");
  ab1.id = "ab1";
  const ab2 = createArtboard("Artboard 2", 280, 0, 200, 100, "#ffeeee");
  ab2.id = "ab2";
  doc.artboards = [ab1, ab2];
  doc.activeArtboardId = "ab1";
  syncDocBoundsFromArtboards(doc);

  const r1Effects = defaultEffects();
  r1Effects.shadow.enabled = true;
  const r1: RectNode = {
    id: "r1",
    name: "Hero",
    visible: true,
    locked: true,
    opacity: 1,
    blendMode: "multiply",
    transform: { ...defaultTransform(10, 20), skewX: 5 },
    type: "rect",
    width: 100,
    height: 80,
    rx: 4,
    ry: 4,
    fill: solidFill("#B8FF3C"),
    stroke: { ...defaultStroke(), dashOffset: 3, align: "inside" },
    effects: r1Effects,
  };

  const p1: PathNode = {
    id: "p1",
    name: "Curve",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: defaultTransform(),
    type: "path",
    subpaths: [
      {
        closed: true,
        points: [
          { id: "pa", x: 0, y: 0, handleOut: { x: 20, y: 0 }, type: "smooth" },
          {
            id: "pb",
            x: 100,
            y: 0,
            handleIn: { x: 80, y: 0 },
            handleOut: { x: 120, y: 20 },
            type: "symmetric",
          },
          { id: "pc", x: 100, y: 100, handleIn: { x: 100, y: 60 }, type: "smooth", strokeWidth: 2 },
          { id: "pd", x: 0, y: 100, type: "corner" },
        ],
      },
    ],
    fill: solidFill("#22D3EE"),
    stroke: defaultStroke(),
    fillRule: "nonzero",
    clipPathId: "mask1",
  };

  const mask1: RectNode = {
    id: "mask1",
    name: "Mask",
    visible: false,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: defaultTransform(10, 20),
    type: "rect",
    width: 100,
    height: 80,
    rx: 0,
    ry: 0,
    fill: solidFill("#000000"),
    stroke: defaultStroke(),
  };

  const t1: TextNode = {
    id: "t1",
    name: "Label",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: defaultTransform(5, 5),
    type: "text",
    content: "Hello",
    fontFamily: "DM Sans Variable",
    fontSize: 24,
    fontWeight: 400,
    letterSpacing: 0,
    lineHeight: 1.5,
    fill: solidFill("#111111"),
    stroke: defaultStroke(),
  };

  const g1: GroupNode = {
    id: "g1",
    name: "Group",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: defaultTransform(),
    type: "group",
    children: ["t1"],
  };

  const img1: ImageNode = {
    id: "img1",
    name: "Logo",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: defaultTransform(50, 60),
    type: "image",
    href: "data:image/png;base64,abc=",
    width: 10,
    height: 20,
  };

  const symbolRect: RectNode = {
    id: "s1r",
    name: "Symbol Rect",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: defaultTransform(),
    type: "rect",
    width: 8,
    height: 8,
    rx: 0,
    ry: 0,
    fill: solidFill("#A78BFA"),
    stroke: defaultStroke(),
  };
  doc.symbols = {
    s1: {
      id: "s1",
      name: "Badge",
      width: 8,
      height: 8,
      rootChildIds: ["s1r"],
      nodes: { s1r: symbolRect },
    },
  };

  const inst1: SymbolInstanceNode = {
    id: "inst1",
    name: "Badge Instance",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: defaultTransform(150, 10),
    type: "symbolInstance",
    symbolId: "s1",
    width: 30,
    height: 40,
  };

  doc.nodes = { r1, p1, mask1, g1, t1, img1, inst1 };
  doc.rootChildIds = ["r1", "p1", "mask1", "g1", "img1", "inst1"];
  return doc;
}

function roundTrip(doc: SvgDocument) {
  const r = codeToDoc(docToCode(doc), doc);
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe("codeSync", () => {
  it("round trip is a no-op and preserves non-SVG metadata", () => {
    const doc = kitchenSinkDoc();
    const r = roundTrip(doc);
    expect(r.noop).toBe(true);
    expect(r.dropped.size).toBe(0);

    const r1 = r.doc.nodes.r1 as RectNode;
    expect(r1.locked).toBe(true);
    expect(r1.blendMode).toBe("multiply");
    expect(r1.effects?.shadow.enabled).toBe(true);
    expect(r1.transform.skewX).toBe(5);
    expect(r1.stroke.dashOffset).toBe(3);
    expect(r1.stroke.align).toBe("inside");

    const p1 = r.doc.nodes.p1 as PathNode;
    expect(p1.clipPathId).toBe("mask1");
    expect(p1.subpaths[0].points.map((p) => p.id)).toEqual(["pa", "pb", "pc", "pd"]);
    expect(p1.subpaths[0].points.map((p) => p.type)).toEqual([
      "smooth",
      "symmetric",
      "smooth",
      "corner",
    ]);
    expect(p1.subpaths[0].points[2].strokeWidth).toBe(2);

    expect((r.doc.nodes.mask1 as RectNode).visible).toBe(false);
    expect((r.doc.nodes.t1 as TextNode).lineHeight).toBe(1.5);
    expect((r.doc.nodes.img1 as ImageNode).href).toBe("data:image/png;base64,abc=");
    expect((r.doc.nodes.inst1 as SymbolInstanceNode).symbolId).toBe("s1");

    expect(r.doc.artboards).toEqual(doc.artboards);
    expect(r.doc.symbols).toEqual(doc.symbols);
    expect(r.doc.name).toBe(doc.name);
    expect(Object.keys(r.doc.nodes).sort()).toEqual(Object.keys(doc.nodes).sort());
  });

  it("simple doc keeps projectContents identical", () => {
    const doc = createEmptyDocument(120, 90, "Simple");
    // Keys in parser emission order so JSON.stringify comparison is meaningful.
    const rect: RectNode = {
      id: "box1",
      name: "Rectangle",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      transform: defaultTransform(10, 20),
      type: "rect",
      width: 100,
      height: 80,
      rx: 4,
      ry: 4,
      fill: solidFill("#123456"),
      stroke: defaultStroke(),
    };
    doc.nodes.box1 = rect;
    doc.rootChildIds = ["box1"];
    const r = roundTrip(doc);
    expect(r.noop).toBe(true);
    expect(projectContents(r.doc)).toBe(projectContents(doc));
  });

  it("fill edit changes only the fill", () => {
    const doc = kitchenSinkDoc();
    const text = docToCode(doc);
    expect(text).toContain('fill="#B8FF3C"');
    const r = codeToDoc(text.replace('fill="#B8FF3C"', 'fill="#ff0000"'), doc);
    if (!r.ok) throw new Error(r.error);
    expect(r.noop).toBe(false);
    const r1 = r.doc.nodes.r1 as RectNode;
    expect(r1.fill).toEqual({ type: "solid", color: "#ff0000", opacity: 1 });
    for (const id of Object.keys(doc.nodes)) {
      if (id === "r1") continue;
      expect(r.doc.nodes[id]).toEqual(doc.nodes[id]);
    }
  });

  it("invalid SVG reports a line number", () => {
    const doc = kitchenSinkDoc();
    const broken = docToCode(doc).replace('id="r1"', 'id="r1');
    const r = codeToDoc(broken, doc);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(typeof r.line).toBe("number");
  });

  it("deleting a node keeps the rest and clears its clip reference", () => {
    const doc = kitchenSinkDoc();
    const text = docToCode(doc)
      .split("\n")
      .filter((line) => !line.includes('id="mask1"'))
      .join("\n");
    const r = codeToDoc(text, doc);
    if (!r.ok) throw new Error(r.error);
    expect(r.doc.nodes.mask1).toBeUndefined();
    expect((r.doc.nodes.p1 as PathNode).clipPathId).toBeNull();
    expect(r.doc.nodes.r1).toBeDefined();
    expect(r.doc.nodes.g1).toBeDefined();
  });

  it("changing an id creates a new node without carry-over", () => {
    const doc = kitchenSinkDoc();
    const r = codeToDoc(docToCode(doc).replace('id="r1"', 'id="box"'), doc);
    if (!r.ok) throw new Error(r.error);
    expect(r.doc.nodes.box?.type).toBe("rect");
    expect(r.doc.nodes.r1).toBeUndefined();
    expect(r.doc.nodes.box?.locked).toBe(false);
  });

  it("unsupported constructs are reported", () => {
    const doc = kitchenSinkDoc();
    const text = docToCode(doc).replace(
      "</svg>",
      `<style>.a{}</style>\n<ellipse id="new" rx="1" ry="1" filter="url(#x)"/>\n</svg>`,
    );
    const r = codeToDoc(text, doc);
    if (!r.ok) throw new Error(r.error);
    expect(r.dropped.get("<style>")).toBe(1);
    expect(r.dropped.get("filter attribute")).toBe(1);
  });

  it("document name is preserved", () => {
    const doc = kitchenSinkDoc();
    const r = roundTrip(doc);
    expect(r.doc.name).toBe("Kitchen Sink");
  });
});
