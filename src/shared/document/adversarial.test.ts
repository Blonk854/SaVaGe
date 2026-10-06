import { describe, expect, it } from "vitest";
import { svgStringToDocument } from "./deserialize";
import { createEmptyDocument } from "./emptyDocument";
import { parseSavageDocument, SAVAGE_LIMITS } from "./parseSavage";
import { documentToSvgString } from "./serialize";

function project(nodesJson: string, roots: readonly string[]): string {
  const rootJson = roots.map((id) => JSON.stringify(id)).join(",");
  return `{"version":1,"name":"A","width":1,"height":1,"nodes":{${nodesJson}},"rootChildIds":[${rootJson}]}`;
}

function chain(leafDepth: number): { nodes: string; root: string } {
  if (leafDepth < 1) throw new Error("depth");
  if (leafDepth === 1) {
    return {
      nodes: `"leaf":{"id":"leaf","type":"rect","width":1,"height":1}`,
      root: "leaf",
    };
  }
  const parts: string[] = [];
  for (let level = 1; level < leafDepth; level++) {
    const child = level === leafDepth - 1 ? "leaf" : `g${level + 1}`;
    parts.push(`"g${level}":{"id":"g${level}","type":"group","children":["${child}"]}`);
  }
  parts.push(`"leaf":{"id":"leaf","type":"rect","width":1,"height":1}`);
  return { nodes: parts.join(","), root: "g1" };
}

function flatRects(count: number): string {
  const nodes: string[] = new Array(count);
  const roots: string[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const id = `n${i}`;
    nodes[i] = `"${id}":{"id":"${id}","type":"rect","width":1,"height":1}`;
    roots[i] = id;
  }
  return project(nodes.join(","), roots);
}

function pathWithPoints(count: number): string {
  const points = new Array(count).fill('{"x":0,"y":0}').join(",");
  return project(
    `"p":{"id":"p","type":"path","subpaths":[{"closed":false,"points":[${points}]}]}`,
    ["p"],
  );
}

function svg(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">${body}</svg>`;
}

function expectFiniteTree(value: unknown) {
  if (typeof value === "number") {
    expect(Number.isFinite(value)).toBe(true);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) expectFiniteTree(entry);
    return;
  }
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) expectFiniteTree(entry);
  }
}

describe("adversarial savage parsing", () => {
  describe("malformed JSON", () => {
    it.each(["", "   ", "{", "}", "[", '{"version":1,}', '{"a":1}{"a":2}', "\uFEFF{}", "NaN", "Infinity"])(
      "rejects %j before it can become a document",
      (text) => {
        expect(() => parseSavageDocument(text)).toThrow(/JSON/);
      },
    );

    it.each(["null", "[]", "0", "true", '"hello"'])(
      "rejects JSON value %j that is not a project",
      (text) => {
        expect(() => parseSavageDocument(text)).toThrow(/Unrecognized/);
      },
    );

    it("does not pollute Object.prototype from JSON keys", () => {
      const text =
        '{"version":1,"name":"A","width":1,"height":1,"nodes":{},"rootChildIds":[],"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}';
      const doc = parseSavageDocument(text);
      expect(doc.name).toBe("A");
      expect(Object.prototype).not.toHaveProperty("polluted");
    });
  });

  describe("deep nesting", () => {
    it("accepts a graph at the depth limit and rejects one level past it", () => {
      const atLimit = chain(SAVAGE_LIMITS.graphDepth);
      const loaded = parseSavageDocument(project(atLimit.nodes, [atLimit.root]));
      expect(loaded.nodes.leaf?.type).toBe("rect");

      const tooDeep = chain(SAVAGE_LIMITS.graphDepth + 1);
      expect(() => parseSavageDocument(project(tooDeep.nodes, [tooDeep.root]))).toThrow(
        new RegExp(`${SAVAGE_LIMITS.graphDepth}-level depth limit`),
      );
    });

    it("rejects an over-deep symbol even when the scene graph is empty", () => {
      const tooDeep = chain(SAVAGE_LIMITS.graphDepth + 1);
      const text = `{"version":1,"name":"A","width":1,"height":1,"nodes":{},"rootChildIds":[],"symbols":{"sym":{"id":"sym","name":"S","width":1,"height":1,"nodes":{${tooDeep.nodes}},"rootChildIds":[${JSON.stringify(tooDeep.root)}]}}}`;
      expect(() => parseSavageDocument(text)).toThrow(/Symbol sym exceeds the .* depth limit/);
    });
  });

  describe("duplicate IDs", () => {
    it("rejects a root id listed twice", () => {
      const text = project(`"a":{"id":"a","type":"rect","width":1,"height":1}`, ["a", "a"]);
      expect(() => parseSavageDocument(text)).toThrow(/more than one owner/i);
    });

    it("rejects a child id listed twice", () => {
      const text = project(
        `"g":{"id":"g","type":"group","children":["a","a"]},"a":{"id":"a","type":"rect","width":1,"height":1}`,
        ["g"],
      );
      expect(() => parseSavageDocument(text)).toThrow(/more than one owner/i);
    });

    it("rejects duplicate JSON keys instead of keeping the last node", () => {
      const text =
        '{"version":1,"name":"A","width":1,"height":1,"nodes":{"a":{"id":"a","type":"rect","width":1,"height":1},"a":{"id":"a","type":"rect","width":9,"height":9}},"rootChildIds":["a"]}';
      expect(() => parseSavageDocument(text)).toThrow(/duplicate JSON key "a"/);
    });

    it("treats an escaped key as the same id", () => {
      const text =
        '{"version":1,"name":"A","width":1,"height":1,"nodes":{"a":{"id":"a","type":"rect","width":1,"height":1},"\\u0061":{"id":"a","type":"rect","width":9,"height":9}},"rootChildIds":["a"]}';
      expect(() => parseSavageDocument(text)).toThrow(/duplicate JSON key "a"/);
    });

    it("allows the same field name on different nodes and inside string values", () => {
      const doc = parseSavageDocument(
        project(
          `"a":{"id":"a","name":"{\\"a\\":1,\\"a\\":2}","type":"rect","width":1,"height":2},"b":{"id":"b","type":"rect","width":3,"height":4}`,
          ["a", "b"],
        ),
      );
      const first = doc.nodes.a;
      expect(first?.type).toBe("rect");
      if (first?.type === "rect") {
        expect(first.name).toBe('{"a":1,"a":2}');
        expect(first.width).toBe(1);
        expect(first.height).toBe(2);
      }
      expect(doc.nodes.b).toMatchObject({ type: "rect", width: 3, height: 4 });
    });
  });

  describe("oversized inputs", () => {
    it("rejects a project one character past the source limit", () => {
      expect(() => parseSavageDocument(" ".repeat(SAVAGE_LIMITS.sourceCharacters + 1))).toThrow(
        new RegExp(`${SAVAGE_LIMITS.sourceCharacters}-character limit`),
      );
    });

    it(
      "loads a valid project padded to the source limit",
      () => {
        const body = JSON.stringify(createEmptyDocument(1, 1, "Cap"));
        const text = body + " ".repeat(SAVAGE_LIMITS.sourceCharacters - body.length);
        expect(text).toHaveLength(SAVAGE_LIMITS.sourceCharacters);
        expect(parseSavageDocument(text).name).toBe("Cap");
      },
      20_000,
    );

    it(
      "accepts the node cap and rejects one node past it",
      () => {
        expect(Object.keys(parseSavageDocument(flatRects(SAVAGE_LIMITS.nodes)).nodes)).toHaveLength(
          SAVAGE_LIMITS.nodes,
        );
        expect(() => parseSavageDocument(flatRects(SAVAGE_LIMITS.nodes + 1))).toThrow(
          new RegExp(`${SAVAGE_LIMITS.nodes}-node limit`),
        );
      },
      20_000,
    );

    it(
      "accepts the path-point cap and rejects one point past it",
      () => {
        const atLimit = parseSavageDocument(pathWithPoints(SAVAGE_LIMITS.pathPoints));
        const path = atLimit.nodes.p;
        expect(path?.type).toBe("path");
        if (path?.type === "path") {
          expect(path.subpaths[0]?.points).toHaveLength(SAVAGE_LIMITS.pathPoints);
        }
        expect(() => parseSavageDocument(pathWithPoints(SAVAGE_LIMITS.pathPoints + 1))).toThrow(
          new RegExp(`${SAVAGE_LIMITS.pathPoints}-point limit`),
        );
      },
      20_000,
    );
  });

  describe("non-finite numbers", () => {
    it.each([
      [
        "document width",
        '{"version":1,"name":"A","width":1e309,"height":1,"nodes":{},"rootChildIds":[]}',
      ],
      [
        "document height",
        '{"version":1,"name":"A","width":1,"height":-1e309,"nodes":{},"rootChildIds":[]}',
      ],
      [
        "viewBox",
        '{"version":1,"name":"A","width":1,"height":1,"viewBox":{"x":0,"y":0,"w":1e309,"h":1},"nodes":{},"rootChildIds":[]}',
      ],
      [
        "node opacity",
        project(`"a":{"id":"a","type":"rect","width":1,"height":1,"opacity":1e309}`, ["a"]),
      ],
      [
        "transform",
        project(
          `"a":{"id":"a","type":"rect","width":1,"height":1,"transform":{"x":1e309,"y":0,"rotation":0,"scaleX":1,"scaleY":1,"skewX":0,"skewY":0}}`,
          ["a"],
        ),
      ],
      [
        "path point",
        project(
          `"p":{"id":"p","type":"path","subpaths":[{"closed":false,"points":[{"x":0,"y":-1e309}]}]}`,
          ["p"],
        ),
      ],
      [
        "gradient stop",
        project(
          `"a":{"id":"a","type":"rect","width":1,"height":1,"fill":{"type":"linear","x1":0,"y1":0,"x2":1,"y2":1,"stops":[{"offset":1e309,"color":"#fff","opacity":1}]}}`,
          ["a"],
        ),
      ],
      [
        "mesh point",
        project(
          `"a":{"id":"a","type":"rect","width":1,"height":1,"fill":{"type":"mesh","columns":1,"rows":1,"points":[{"x":1e309,"y":0,"color":"#fff","opacity":1}]}}`,
          ["a"],
        ),
      ],
      [
        "dash length",
        project(
          `"a":{"id":"a","type":"rect","width":1,"height":1,"stroke":{"paint":{"type":"none"},"width":1,"dashArray":[1e309]}}`,
          ["a"],
        ),
      ],
    ])("rejects non-finite %s from numeric overflow", (_label, text) => {
      expect(() => parseSavageDocument(text)).toThrow(/finite number/);
    });
  });
});

describe("adversarial SVG parsing", () => {
  // SVG node cap uses SAVAGE_LIMITS.nodes as well. The .savage case covers that
  // boundary; building 50,000 DOM nodes in jsdom is too slow for this suite.
  it("rejects markup that is not an SVG document", () => {
    expect(() => svgStringToDocument("<rect width='1' height='1'/>")).toThrow(/Invalid SVG/);
    expect(() => svgStringToDocument("<svg")).toThrow(/Invalid SVG/);
  });

  it("accepts grouping at the depth limit and rejects one level past it", () => {
    const atLimit = SAVAGE_LIMITS.graphDepth - 2;
    const loaded = svgStringToDocument(
      svg(`${"<g>".repeat(atLimit)}<rect width="1" height="1"/>${"</g>".repeat(atLimit)}`),
    );
    expect(Object.values(loaded.nodes).some((node) => node.type === "rect")).toBe(true);

    const tooDeep = atLimit + 1;
    expect(() =>
      svgStringToDocument(
        svg(`${"<g>".repeat(tooDeep)}<rect width="1" height="1"/>${"</g>".repeat(tooDeep)}`),
      ),
    ).toThrow(new RegExp(`${SAVAGE_LIMITS.graphDepth}-level depth limit`));
  });

  it("keeps every element when nested SVG ids collide", () => {
    const doc = svgStringToDocument(
      svg(
        `<g id="dup"><rect id="dup" width="2" height="2"/></g><rect id="dup" width="3" height="3"/>`,
      ),
    );
    expect(doc.rootChildIds).toHaveLength(2);
    const ids = Object.values(doc.nodes).map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id !== "dup")).toBe(true);
    const rects = Object.values(doc.nodes).filter((node) => node.type === "rect");
    expect(rects).toHaveLength(2);
  });

  it("rejects SVG text and documents past their size limits", () => {
    expect(() => svgStringToDocument("x".repeat(SAVAGE_LIMITS.sourceCharacters + 1))).toThrow(
      new RegExp(`${SAVAGE_LIMITS.sourceCharacters}-character limit`),
    );
    expect(() => svgStringToDocument(svg(`<text>${"a".repeat(32 * 1024 + 1)}</text>`))).toThrow(
      /32768-character limit/,
    );
  });

  it(
    "rejects one SVG point past the path-point limit",
    () => {
      const points = "0,0 ".repeat(SAVAGE_LIMITS.pathPoints + 1).trim();
      expect(() => svgStringToDocument(svg(`<polyline points="${points}"/>`))).toThrow(
        new RegExp(`${SAVAGE_LIMITS.pathPoints}-point limit`),
      );
    },
    20_000,
  );

  it("stores finite defaults for non-numeric geometry and drops non-finite polyline points", () => {
    const doc = svgStringToDocument(
      svg(
        `<rect width="Infinity" height="NaN" x="1e309" opacity="Infinity" transform="translate(1e309 -1e309) rotate(1e309) scale(1e309 -1e309)"/><polyline points="1e309,1 4,5"/>`,
      ),
    );
    expectFiniteTree(doc);
    const rect = doc.nodes[doc.rootChildIds[0]];
    expect(rect?.type).toBe("rect");
    if (rect?.type === "rect") {
      expect(rect.width).toBe(0);
      expect(rect.height).toBe(0);
      expect(rect.transform.x).toBe(0);
      expect(rect.opacity).toBe(1);
    }
    expectFiniteTree(svgStringToDocument(documentToSvgString(doc)));
  });

  it("rejects non-finite path coordinates instead of storing them", () => {
    expect(() => svgStringToDocument(svg(`<path d="M 1e309 0"/>`))).toThrow(/finite number/);
    expect(() => svgStringToDocument(svg(`<path d="M NaN 0"/>`))).toThrow(/finite number/);
  });
});
