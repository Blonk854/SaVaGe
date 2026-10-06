import { createHash } from "node:crypto";
import { syncDocBoundsFromArtboards } from "../document/artboards";
import {
  defaultMeshGradient,
  defaultStroke,
  solidFill,
  type GroupNode,
  type ImageNode,
  type PathNode,
  type RectNode,
  type SceneNode,
  type SvgDocument,
  type SymbolInstanceNode,
  type Transform2D,
} from "../document/types";

/** Bump when the generator's shape changes. Committed manifests must match. */
export const FIXTURE_VERSION = 1;
export const STANDARD_FIXTURE = "paths-1000";
export const BENCHMARK_PATH_COUNTS = [100, 1_000, 10_000] as const;
export type BenchmarkPathCount = (typeof BENCHMARK_PATH_COUNTS)[number];

const CELL = 48;
const PATH_SIZE = 20;
const COLUMNS = 25;
const PATHS_PER_GROUP = 25;
const GROUPS_PER_PARENT = 5;
const SYMBOL_INSTANCES = 8;
const ONE_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export interface BenchmarkCensus {
  pathCount: number;
  pointCount: number;
  curveCount: number;
  strokeCount: number;
  effectCount: number;
  meshCells: number;
  groupCount: number;
  maxDepth: number;
  symbolInstances: number;
  bitmapBytes: number;
  historyDepth: number;
  sha256: string;
}

export function benchmarkFixtureName(pathCount: BenchmarkPathCount): string {
  return `paths-${pathCount}`;
}

export function isBenchmarkPathCount(value: number): value is BenchmarkPathCount {
  return (BENCHMARK_PATH_COUNTS as readonly number[]).includes(value);
}

function transform(x: number, y: number, rotation = 0, scaleX = 1, skewX = 0): Transform2D {
  return { x, y, rotation, scaleX, scaleY: 1, skewX, skewY: 0 };
}

function pathNode(id: string, x: number, y: number, curved: boolean, shadow: boolean): PathNode {
  const corners = [
    { x: 0, y: 0 },
    { x: PATH_SIZE, y: 0 },
    { x: PATH_SIZE, y: PATH_SIZE },
    { x: 0, y: PATH_SIZE },
  ];
  return {
    id,
    name: id,
    type: "path",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: transform(x, y),
    effects: shadow
      ? {
          blur: 0,
          shadow: { enabled: true, x: 4, y: 4, blur: 6, color: "#000000", opacity: 0.35 },
        }
      : undefined,
    subpaths: [
      {
        closed: true,
        points: corners.map((corner, index) => ({
          id: `${id}-${index}`,
          x: corner.x,
          y: corner.y,
          type: curved ? "smooth" : "corner",
          handleOut: curved ? { x: corner.x + 4, y: corner.y - 4 } : undefined,
          handleIn: curved ? { x: corner.x - 4, y: corner.y + 4 } : undefined,
        })),
      },
    ],
    fill: solidFill("#B8FF3C"),
    stroke: defaultStroke("#0B0D10", 1),
    fillRule: "nonzero",
  };
}

export function createBenchmarkDocument(pathCount: BenchmarkPathCount): SvgDocument {
  const rows = pathCount / COLUMNS;
  const nodes: Record<string, SceneNode> = {};
  const innerIds: string[] = [];

  for (let inner = 0; inner < pathCount / PATHS_PER_GROUP; inner++) {
    const childIds: string[] = [];
    for (let slot = 0; slot < PATHS_PER_GROUP; slot++) {
      const index = inner * PATHS_PER_GROUP + slot;
      const id = `p${String(index).padStart(5, "0")}`;
      const column = index % COLUMNS;
      childIds.push(id);
      nodes[id] = pathNode(
        id,
        column * CELL,
        0,
        index % 5 === 0,
        index % 50 === 0,
      );
    }
    const groupId = `g${String(inner).padStart(4, "0")}`;
    const row = inner;
    const group: GroupNode = {
      id: groupId,
      name: groupId,
      type: "group",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      transform: transform(0, row * CELL, 0, inner % 17 === 0 ? -1 : 1, inner % 29 === 0 ? 8 : 0),
      children: childIds,
    };
    nodes[groupId] = group;
    innerIds.push(groupId);
  }

  const rootChildIds: string[] = [];
  for (let outer = 0; outer < Math.ceil(innerIds.length / GROUPS_PER_PARENT); outer++) {
    const groupId = `og${String(outer).padStart(3, "0")}`;
    const children = innerIds.slice(outer * GROUPS_PER_PARENT, (outer + 1) * GROUPS_PER_PARENT);
    const group: GroupNode = {
      id: groupId,
      name: groupId,
      type: "group",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      transform: transform(0, 0, outer === 0 ? 12 : 0),
      children,
    };
    nodes[groupId] = group;
    rootChildIds.push(groupId);
  }

  const mesh: RectNode = {
    id: "mesh",
    name: "mesh",
    type: "rect",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: transform(8, rows * CELL + 16),
    width: 80,
    height: 80,
    rx: 0,
    ry: 0,
    fill: defaultMeshGradient(80, 80),
    stroke: defaultStroke("#0B0D10", 1),
  };
  nodes.mesh = mesh;
  rootChildIds.push(mesh.id);

  const image: ImageNode = {
    id: "bitmap",
    name: "bitmap",
    type: "image",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: transform(120, rows * CELL + 16),
    href: `data:image/png;base64,${ONE_PIXEL_PNG}`,
    width: 16,
    height: 16,
  };
  nodes.bitmap = image;
  rootChildIds.push(image.id);

  for (let index = 0; index < SYMBOL_INSTANCES; index++) {
    const id = `inst${index}`;
    const instance: SymbolInstanceNode = {
      id,
      name: id,
      type: "symbolInstance",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      transform: transform(240 + index * 28, rows * CELL + 16),
      symbolId: "mark",
      width: 20,
      height: 20,
    };
    nodes[id] = instance;
    rootChildIds.push(id);
  }

  const symbolPath = pathNode("mark-path", 0, 0, false, false);
  const doc: SvgDocument = {
    version: 1,
    name: benchmarkFixtureName(pathCount),
    width: COLUMNS * CELL,
    height: rows * CELL,
    viewBox: { x: 0, y: 0, w: COLUMNS * CELL, h: rows * CELL },
    background: null,
    rootChildIds,
    nodes,
    assets: {
      bitmap: { mime: "image/png", dataBase64: ONE_PIXEL_PNG },
    },
    artboards: [
      {
        id: "board",
        name: "Artboard 1",
        x: 0,
        y: 0,
        width: COLUMNS * CELL,
        height: rows * CELL,
        background: "#ffffff",
      },
    ],
    activeArtboardId: "board",
    symbols: {
      mark: {
        id: "mark",
        name: "mark",
        width: PATH_SIZE,
        height: PATH_SIZE,
        rootChildIds: [symbolPath.id],
        nodes: { [symbolPath.id]: symbolPath },
      },
    },
  };
  syncDocBoundsFromArtboards(doc);
  return doc;
}

function walkDepth(nodes: Record<string, SceneNode>, ids: string[], depth: number): number {
  let max = depth;
  for (const id of ids) {
    const node = nodes[id];
    if (!node) continue;
    if (node.type === "group") max = Math.max(max, walkDepth(nodes, node.children, depth + 1));
    else max = Math.max(max, depth);
  }
  return max;
}

export function censusBenchmarkDocument(doc: SvgDocument): Omit<BenchmarkCensus, "sha256"> {
  let pathCount = 0;
  let pointCount = 0;
  let curveCount = 0;
  let strokeCount = 0;
  let effectCount = 0;
  let meshCells = 0;
  let groupCount = 0;
  let symbolInstances = 0;

  const visit = (node: SceneNode, countPath: boolean) => {
    if (node.type === "group") {
      groupCount += 1;
      return;
    }
    if (node.type === "symbolInstance") {
      symbolInstances += 1;
      return;
    }
    if (node.type === "path") {
      if (countPath) pathCount += 1;
      for (const subpath of node.subpaths) {
        pointCount += subpath.points.length;
        curveCount += subpath.points.filter((point) => point.handleIn || point.handleOut).length;
      }
    }
    if ("stroke" in node && node.stroke.paint.type !== "none") strokeCount += 1;
    if (node.effects && (node.effects.blur > 0 || node.effects.shadow.enabled)) effectCount += 1;
    if ("fill" in node && node.fill.type === "mesh") meshCells += node.fill.columns * node.fill.rows;
  };

  for (const node of Object.values(doc.nodes)) visit(node, true);
  for (const symbol of Object.values(doc.symbols)) {
    for (const node of Object.values(symbol.nodes)) visit(node, false);
  }

  let bitmapBytes = 0;
  for (const asset of Object.values(doc.assets)) {
    bitmapBytes += Buffer.from(asset.dataBase64, "base64").byteLength;
  }

  return {
    pathCount,
    pointCount,
    curveCount,
    strokeCount,
    effectCount,
    meshCells,
    groupCount,
    maxDepth: walkDepth(doc.nodes, doc.rootChildIds, 1),
    symbolInstances,
    bitmapBytes,
    historyDepth: 0,
  };
}

export function benchmarkDocumentSha256(doc: SvgDocument): string {
  return createHash("sha256").update(JSON.stringify(doc)).digest("hex");
}

export function summarizeBenchmarkDocument(doc: SvgDocument): BenchmarkCensus {
  return { ...censusBenchmarkDocument(doc), sha256: benchmarkDocumentSha256(doc) };
}
