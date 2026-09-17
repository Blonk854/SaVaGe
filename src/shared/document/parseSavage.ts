import { createEmptyDocument } from "./emptyDocument";
import type { SceneNode, SvgDocument } from "./types";

export const SAVAGE_LIMITS = {
  sourceCharacters: 16 * 1024 * 1024,
  nodes: 50_000,
  graphDepth: 256,
  pathPoints: 1_000_000,
} as const;

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
  const raw = data as Partial<SvgDocument> & { nodes?: unknown; rootChildIds?: unknown };
  if (
    raw.version !== 1 ||
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

  return {
    ...fallback,
    ...raw,
    version: 1,
    name: typeof raw.name === "string" ? raw.name : fallback.name,
    width: Number(raw.width) || fallback.width,
    height: Number(raw.height) || fallback.height,
    viewBox: raw.viewBox ?? fallback.viewBox,
    background: raw.background ?? null,
    rootChildIds: raw.rootChildIds as SvgDocument["rootChildIds"],
    nodes,
    assets: raw.assets ?? {},
    artboards: raw.artboards ?? fallback.artboards,
    activeArtboardId: raw.activeArtboardId ?? fallback.activeArtboardId,
    symbols: validatedSymbols,
  };
}
