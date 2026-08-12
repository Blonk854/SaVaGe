import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "./emptyDocument";
import { documentToSvgString } from "./serialize";
import { svgStringToDocument } from "./deserialize";
import {
  defaultStroke,
  defaultTransform,
  solidFill,
  type RectNode,
} from "./types";

describe("document round-trip", () => {
  it("serializes and deserializes a rectangle document", () => {
    const doc = createEmptyDocument(800, 600, "Test");
    const rect: RectNode = {
      id: "rect1",
      name: "Rectangle",
      type: "rect",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      transform: defaultTransform(40, 50),
      width: 120,
      height: 80,
      rx: 0,
      ry: 0,
      fill: solidFill("#B8FF3C"),
      stroke: defaultStroke("#000000", 2),
    };
    doc.nodes[rect.id] = rect;
    doc.rootChildIds.push(rect.id);

    const svg = documentToSvgString(doc);
    const back = svgStringToDocument(svg, "Test");

    expect(back.artboards.length).toBeGreaterThanOrEqual(1);
    expect(back.rootChildIds.length).toBe(1);
    const node = back.nodes[back.rootChildIds[0]];
    expect(node.type).toBe("rect");
    if (node.type === "rect") {
      expect(node.width).toBe(120);
      expect(node.height).toBe(80);
      expect(node.transform.x).toBe(40);
      expect(node.transform.y).toBe(50);
      expect(node.fill.type).toBe("solid");
    }
  });
});
