import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "./emptyDocument";
import { documentToSvgString } from "./serialize";
import { svgStringToDocument } from "./deserialize";
import {
  defaultLinearGradient,
  defaultMeshGradient,
  defaultStroke,
  defaultTransform,
  solidFill,
  type PathNode,
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

  it("round-trips linear gradient fills from url(#id)", () => {
    const doc = createEmptyDocument(200, 200, "grad");
    const rect: RectNode = {
      id: "r1",
      name: "Rectangle",
      type: "rect",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      transform: defaultTransform(0, 0),
      width: 100,
      height: 40,
      rx: 0,
      ry: 0,
      fill: defaultLinearGradient(),
      stroke: defaultStroke("#000", 0),
    };
    doc.nodes[rect.id] = rect;
    doc.rootChildIds = [rect.id];
    const svg = documentToSvgString(doc);
    expect(svg).toContain("<linearGradient");
    const back = svgStringToDocument(svg);
    const node = back.nodes[back.rootChildIds[0]];
    expect(node.type).toBe("rect");
    if (node.type === "rect") {
      expect(node.fill.type).toBe("linear");
      if (node.fill.type === "linear") {
        expect(node.fill.stops.length).toBeGreaterThanOrEqual(2);
        expect(node.fill.x2).toBe(100);
      }
    }
  });

  it("round-trips mesh fills via SVG 2 meshgradient", () => {
    const doc = createEmptyDocument(200, 200, "mesh");
    const node: PathNode = {
      id: "p1",
      name: "MeshPath",
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
            { id: "a", x: 0, y: 0, type: "corner" },
            { id: "b", x: 80, y: 0, type: "corner" },
            { id: "c", x: 80, y: 60, type: "corner" },
            { id: "d", x: 0, y: 60, type: "corner" },
          ],
        },
      ],
      fill: defaultMeshGradient(80, 60),
      stroke: defaultStroke("#000", 0),
      fillRule: "nonzero",
    };
    doc.nodes[node.id] = node;
    doc.rootChildIds = [node.id];
    const svg = documentToSvgString(doc);
    expect(svg).toContain("<meshgradient");
    const back = svgStringToDocument(svg);
    const again = back.nodes[back.rootChildIds[0]];
    expect(again.type).toBe("path");
    if (again.type === "path") {
      expect(again.fill.type).toBe("mesh");
      if (again.fill.type === "mesh") {
        expect(again.fill.columns).toBe(2);
        expect(again.fill.points.length).toBe(9);
      }
    }
  });
});
