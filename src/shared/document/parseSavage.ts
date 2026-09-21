import { createEmptyDocument } from "./emptyDocument";
import type { Paint, SceneNode, StrokeStyle, SvgDocument, Transform2D } from "./types";
import { defaultStroke, defaultTransform } from "./types";

export const SAVAGE_LIMITS = {
  sourceCharacters: 16 * 1024 * 1024,
  nodes: 50_000,
  graphDepth: 256,
  pathPoints: 1_000_000,
} as const;

export const PROJECT_SCHEMA_VERSION = 1 as const;

export function unsupportedProjectVersionMessage(version: number): string {
  return `This project is version ${version}. SaVaGe opens version ${PROJECT_SCHEMA_VERSION} only. Use a newer SaVaGe, or Save As a version-${PROJECT_SCHEMA_VERSION} copy from that version. The original file was not changed.`;
}

const NODE_TYPES = new Set([
  "group",
  "path",
  "rect",
  "ellipse",
  "line",
  "text",
  "image",
  "symbolInstance",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function requireFinite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

function optionalFinite(value: unknown, fallback: number, label: string): number {
  if (value == null) return fallback;
  return requireFinite(value, label);
}

function requireTransform(value: unknown, label: string): Transform2D {
  if (value == null) return defaultTransform();
  if (!isRecord(value)) throw new Error(`${label} has an invalid transform`);
  return {
    x: optionalFinite(value.x, 0, `${label} transform.x`),
    y: optionalFinite(value.y, 0, `${label} transform.y`),
    rotation: optionalFinite(value.rotation, 0, `${label} transform.rotation`),
    scaleX: optionalFinite(value.scaleX, 1, `${label} transform.scaleX`),
    scaleY: optionalFinite(value.scaleY, 1, `${label} transform.scaleY`),
    skewX: optionalFinite(value.skewX, 0, `${label} transform.skewX`),
    skewY: optionalFinite(value.skewY, 0, `${label} transform.skewY`),
  };
}

function requirePaint(value: unknown, label: string): Paint {
  if (value == null) return { type: "none" };
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error(`${label} has an invalid paint`);
  }
  if (value.type === "none") return { type: "none" };
  if (value.type === "solid") {
    if (typeof value.color !== "string") throw new Error(`${label} solid color is required`);
    return {
      type: "solid",
      color: value.color,
      opacity: optionalFinite(value.opacity, 1, `${label} opacity`),
    };
  }
  if (value.type === "linear" || value.type === "radial") {
    const stops = value.stops;
    if (!Array.isArray(stops) || !stops.length) {
      throw new Error(`${label} gradient is missing stops`);
    }
    for (const [index, stop] of stops.entries()) {
      if (!isRecord(stop) || typeof stop.color !== "string") {
        throw new Error(`${label} gradient stop ${index} is invalid`);
      }
      requireFinite(stop.offset, `${label} gradient stop ${index} offset`);
      optionalFinite(stop.opacity, 1, `${label} gradient stop ${index} opacity`);
    }
    if (value.type === "linear") {
      requireFinite(value.x1, `${label} x1`);
      requireFinite(value.y1, `${label} y1`);
      requireFinite(value.x2, `${label} x2`);
      requireFinite(value.y2, `${label} y2`);
    } else {
      requireFinite(value.cx, `${label} cx`);
      requireFinite(value.cy, `${label} cy`);
      requireFinite(value.r, `${label} r`);
    }
    return value as Paint;
  }
  if (value.type === "mesh") {
    if (!Array.isArray(value.points)) throw new Error(`${label} mesh is missing points`);
    for (const [index, point] of value.points.entries()) {
      if (!isRecord(point) || typeof point.color !== "string") {
        throw new Error(`${label} mesh point ${index} is invalid`);
      }
      requireFinite(point.x, `${label} mesh point ${index} x`);
      requireFinite(point.y, `${label} mesh point ${index} y`);
    }
    requireFinite(value.columns, `${label} mesh columns`);
    requireFinite(value.rows, `${label} mesh rows`);
    return value as Paint;
  }
  throw new Error(`${label} has an unsupported paint`);
}

function requireStroke(value: unknown, label: string): StrokeStyle {
  if (value == null) return defaultStroke("#000000", 0);
  if (!isRecord(value)) throw new Error(`${label} has an invalid stroke`);
  const dashArray = Array.isArray(value.dashArray) ? value.dashArray : [];
  for (const [index, dash] of dashArray.entries()) {
    requireFinite(dash, `${label} dash ${index}`);
  }
  return {
    ...defaultStroke("#000000", 0),
    paint: requirePaint(value.paint, `${label} paint`),
    width: optionalFinite(value.width, 0, `${label} width`),
    miterLimit: optionalFinite(value.miterLimit, 4, `${label} miterLimit`),
    dashArray: dashArray as number[],
    dashOffset: optionalFinite(value.dashOffset, 0, `${label} dashOffset`),
    ...(typeof value.lineCap === "string" ? { lineCap: value.lineCap as StrokeStyle["lineCap"] } : {}),
    ...(typeof value.lineJoin === "string" ? { lineJoin: value.lineJoin as StrokeStyle["lineJoin"] } : {}),
    ...(typeof value.align === "string" ? { align: value.align as StrokeStyle["align"] } : {}),
  };
}

function validateGraph(
  rawNodes: unknown,
  rawRoots: unknown,
  scope: string,
): Record<string, SceneNode> {
  if (!isRecord(rawNodes) || !Array.isArray(rawRoots)) {
    throw new Error(`${scope} must contain a node map and root list`);
  }
  const entries = Object.entries(rawNodes);
  if (entries.length > SAVAGE_LIMITS.nodes) {
    throw new Error(`${scope} exceeds the ${SAVAGE_LIMITS.nodes}-node limit`);
  }

  const owners = new Map<string, string>();
  const claim = (value: unknown, owner: string) => {
    if (typeof value !== "string" || !Object.hasOwn(rawNodes, value)) {
      throw new Error(`${scope} references missing node ${String(value)}`);
    }
    const previous = owners.get(value);
    if (previous) {
      throw new Error(`${scope} node ${value} has more than one owner (${previous}, ${owner})`);
    }
    owners.set(value, owner);
  };

  for (const id of rawRoots) claim(id, "root");

  let pathPoints = 0;
  for (const [key, value] of entries) {
    if (!isRecord(value) || value.id !== key) {
      throw new Error(`${scope} node-map key ${key} does not match its node id`);
    }
    if (typeof value.type !== "string" || !NODE_TYPES.has(value.type)) {
      throw new Error(`${scope} node ${key} has an unsupported type`);
    }
    sanitizeNode(value, `${scope} node ${key}`);
    if (value.type === "group") {
      if (!Array.isArray(value.children)) {
        throw new Error(`${scope} group ${key} has an invalid child list`);
      }
      for (const childId of value.children) claim(childId, `group ${key}`);
    }
    if (value.clipPathId != null && !Object.hasOwn(rawNodes, String(value.clipPathId))) {
      throw new Error(`${scope} node ${key} references a missing clip path`);
    }
    if (value.type === "path") {
      if (!Array.isArray(value.subpaths)) {
        throw new Error(`${scope} path ${key} has invalid subpaths`);
      }
      for (const subpath of value.subpaths) {
        if (!isRecord(subpath) || !Array.isArray(subpath.points)) {
          throw new Error(`${scope} path ${key} has invalid points`);
        }
        for (const [index, point] of subpath.points.entries()) {
          if (!isRecord(point)) {
            throw new Error(`${scope} path ${key} point ${index} is invalid`);
          }
          requireFinite(point.x, `${scope} path ${key} point ${index} x`);
          requireFinite(point.y, `${scope} path ${key} point ${index} y`);
        }
        pathPoints += subpath.points.length;
        if (pathPoints > SAVAGE_LIMITS.pathPoints) {
          throw new Error(`${scope} exceeds the ${SAVAGE_LIMITS.pathPoints}-point limit`);
        }
      }
    }
  }

  const reached = new Set<string>();
  const stack = rawRoots.map((id) => ({ id: id as string, depth: 1 }));
  while (stack.length) {
    const { id, depth } = stack.pop()!;
    if (depth > SAVAGE_LIMITS.graphDepth) {
      throw new Error(`${scope} exceeds the ${SAVAGE_LIMITS.graphDepth}-level depth limit`);
    }
    if (reached.has(id)) continue;
    reached.add(id);
    const node = rawNodes[id] as Record<string, unknown>;
    if (node.type === "group") {
      for (const childId of node.children as string[]) {
        stack.push({ id: childId, depth: depth + 1 });
      }
    }
  }
  if (reached.size !== entries.length) {
    const orphan = entries.find(([id]) => !reached.has(id))?.[0];
    throw new Error(`${scope} contains unreachable node ${orphan}`);
  }

  return rawNodes as Record<string, SceneNode>;
}

function sanitizeNode(value: Record<string, unknown>, label: string) {
  value.transform = requireTransform(value.transform, label);
  if (value.opacity != null) optionalFinite(value.opacity, 1, `${label} opacity`);
  switch (value.type) {
    case "rect":
      requireFinite(value.width, `${label} width`);
      requireFinite(value.height, `${label} height`);
      optionalFinite(value.rx, 0, `${label} rx`);
      optionalFinite(value.ry, 0, `${label} ry`);
      value.fill = requirePaint(value.fill, `${label} fill`);
      value.stroke = requireStroke(value.stroke, `${label} stroke`);
      break;
    case "ellipse":
      requireFinite(value.rx, `${label} rx`);
      requireFinite(value.ry, `${label} ry`);
      value.fill = requirePaint(value.fill, `${label} fill`);
      value.stroke = requireStroke(value.stroke, `${label} stroke`);
      break;
    case "line":
      requireFinite(value.x2, `${label} x2`);
      requireFinite(value.y2, `${label} y2`);
      value.stroke = requireStroke(value.stroke, `${label} stroke`);
      break;
    case "path":
      value.fill = requirePaint(value.fill, `${label} fill`);
      value.stroke = requireStroke(value.stroke, `${label} stroke`);
      break;
    case "text":
      requireFinite(value.fontSize, `${label} fontSize`);
      optionalFinite(value.fontWeight, 400, `${label} fontWeight`);
      optionalFinite(value.letterSpacing, 0, `${label} letterSpacing`);
      optionalFinite(value.lineHeight, 1.2, `${label} lineHeight`);
      value.fill = requirePaint(value.fill, `${label} fill`);
      value.stroke = requireStroke(value.stroke, `${label} stroke`);
      break;
    case "image":
      requireFinite(value.width, `${label} width`);
      requireFinite(value.height, `${label} height`);
      break;
    case "symbolInstance":
      requireFinite(value.width, `${label} width`);
      requireFinite(value.height, `${label} height`);
      break;
    default:
      break;
  }
}

function symbolDependencies(nodes: Record<string, SceneNode>, symbolIds: Set<string>): Set<string> {
  const dependencies = new Set<string>();
  for (const node of Object.values(nodes)) {
    if (node.type !== "symbolInstance") continue;
    if (!symbolIds.has(node.symbolId)) {
      throw new Error(`Symbol instance ${node.id} references missing symbol ${node.symbolId}`);
    }
    dependencies.add(node.symbolId);
  }
  return dependencies;
}

function validateSymbolReferences(
  sceneNodes: Record<string, SceneNode>,
  symbols: SvgDocument["symbols"],
) {
  const symbolIds = new Set(Object.keys(symbols));
  symbolDependencies(sceneNodes, symbolIds);
  const dependencies = new Map(
    Object.entries(symbols).map(([id, symbol]) => [
      id,
      symbolDependencies(symbol.nodes, symbolIds),
    ]),
  );
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error(`Recursive symbol expansion includes ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of dependencies.get(id) ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of symbolIds) visit(id);
}

export function validateSavageDocument(doc: unknown): SvgDocument {
  try {
    return parseSavageDocument(JSON.stringify(doc));
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("Document is not serializable");
    }
    throw error;
  }
}

export function parseSavageDocument(text: string): SvgDocument {
  if (text.length > SAVAGE_LIMITS.sourceCharacters) {
    throw new Error(
      `SaVaGe project exceeds the ${SAVAGE_LIMITS.sourceCharacters}-character limit`,
    );
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON");
  }
  if (!data || typeof data !== "object") {
    throw new Error("Unrecognized SaVaGe document");
  }
  const raw = data as Partial<SvgDocument> & { nodes?: unknown; rootChildIds?: unknown; version?: unknown };
  if (typeof raw.version === "number" && raw.version !== PROJECT_SCHEMA_VERSION) {
    throw new Error(unsupportedProjectVersionMessage(raw.version));
  }
  if (
    raw.version !== PROJECT_SCHEMA_VERSION ||
    !raw.nodes ||
    typeof raw.nodes !== "object" ||
    !Array.isArray(raw.rootChildIds)
  ) {
    throw new Error("Unrecognized SaVaGe document");
  }
  const fallback = createEmptyDocument();
  const nodes = validateGraph(raw.nodes, raw.rootChildIds, "Document");
  const symbols = raw.symbols ?? {};
  if (!isRecord(symbols)) throw new Error("Document has an invalid symbol map");
  const validatedSymbols: SvgDocument["symbols"] = {};
  for (const [symbolId, value] of Object.entries(symbols)) {
    if (!isRecord(value) || value.id !== symbolId) {
      throw new Error(`Symbol-map key ${symbolId} does not match its symbol id`);
    }
    const symbolNodes = validateGraph(value.nodes, value.rootChildIds, `Symbol ${symbolId}`);
    validatedSymbols[symbolId] = { ...value, nodes: symbolNodes } as unknown as SvgDocument["symbols"][string];
  }
  validateSymbolReferences(nodes, validatedSymbols);
  if (raw.assets != null && !isRecord(raw.assets)) {
    throw new Error("Document has an invalid asset map");
  }
  const viewBox = raw.viewBox;
  if (viewBox != null) {
    if (!isRecord(viewBox)) throw new Error("Document has an invalid viewBox");
    requireFinite(viewBox.x, "Document viewBox.x");
    requireFinite(viewBox.y, "Document viewBox.y");
    requireFinite(viewBox.w, "Document viewBox.w");
    requireFinite(viewBox.h, "Document viewBox.h");
  }

  return {
    version: PROJECT_SCHEMA_VERSION,
    name: typeof raw.name === "string" ? raw.name : fallback.name,
    width: raw.width == null ? fallback.width : requireFinite(raw.width, "Document width"),
    height: raw.height == null ? fallback.height : requireFinite(raw.height, "Document height"),
    viewBox: (viewBox as SvgDocument["viewBox"] | undefined) ?? fallback.viewBox,
    background: raw.background ?? null,
    rootChildIds: raw.rootChildIds as SvgDocument["rootChildIds"],
    nodes,
    assets: (raw.assets as SvgDocument["assets"] | undefined) ?? {},
    artboards: raw.artboards ?? fallback.artboards,
    activeArtboardId: raw.activeArtboardId ?? fallback.activeArtboardId,
    symbols: validatedSymbols,
  };
}
