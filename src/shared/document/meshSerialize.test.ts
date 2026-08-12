import { describe, expect, it } from "vitest";
import { defaultMeshGradient, defaultStroke, defaultTransform } from "./types";
import type { PathNode, SvgDocument } from "./types";
import { documentToSvgString } from "./serialize";
import { createEmptyDocument } from "./emptyDocument";

describe("mesh serialize", () => {
  it("emits a pattern for mesh fills", () => {
    const doc = createEmptyDocument(200, 200, "mesh-test") as SvgDocument;
    const node: PathNode = {
      id: "p1",
      name: "MeshPath",
      type: "path",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      transform: defaultTransform(10, 10),
      subpaths: [
        {
          closed: true,
          points: [
            { id: "a", x: 0, y: 0, type: "corner" },
            { id: "b", x: 100, y: 0, type: "corner" },
            { id: "c", x: 100, y: 80, type: "corner" },
            { id: "d", x: 0, y: 80, type: "corner" },
          ],
        },
      ],
      fill: defaultMeshGradient(100, 80),
      stroke: defaultStroke("#000", 0),
      fillRule: "nonzero",
    };
    doc.nodes[node.id] = node;
    doc.rootChildIds = [node.id];
    const svg = documentToSvgString(doc);
    expect(svg).toContain("<pattern");
    expect(svg).toContain('fill="url(#m');
  });
});
