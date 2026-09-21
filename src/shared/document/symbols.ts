import { nanoid } from "nanoid";
import { selectionBounds } from "../geometry/bounds";
import {
  invertMat,
  multiply,
  nodeWorldMatrix,
  transformForNewParent,
  transformToMatrix,
} from "../geometry/transform";
import type {
  NodeId,
  SceneNode,
  SvgDocument,
  SymbolDefinition,
  SymbolInstanceNode,
} from "./types";
import { defaultTransform } from "./types";

export function ensureSymbols(doc: SvgDocument): SvgDocument {
  if (!doc.symbols) doc.symbols = {};
  return doc;
}

function cloneSubtree(
  sourceNodes: Record<NodeId, SceneNode>,
  rootId: NodeId,
  originX: number,
  originY: number,
  outNodes: Record<NodeId, SceneNode>,
): NodeId {
  const src = sourceNodes[rootId];
  const newId = nanoid(10);
  const clone = structuredClone(src) as SceneNode;
  clone.id = newId;
  clone.transform = {
    ...clone.transform,
    x: clone.transform.x - originX,
    y: clone.transform.y - originY,
  };
  if (clone.type === "group") {
    clone.children = clone.children.map((cid) =>
      cloneSubtree(sourceNodes, cid, originX, originY, outNodes),
    );
  }
  outNodes[newId] = clone;
  return newId;
}

export function buildSymbolFromSelection(
  doc: SvgDocument,
  selection: NodeId[],
  name?: string,
): { symbol: SymbolDefinition; instance: SymbolInstanceNode } | null {
  const ids = selection.filter((id) => doc.nodes[id]);
  if (!ids.length) return null;
  const bounds = selectionBounds(doc, ids);
  if (bounds.w <= 0 && bounds.h <= 0) return null;

  const symbolNodes: Record<NodeId, SceneNode> = {};
  const rootChildIds = ids.map((id) =>
    cloneSubtree(doc.nodes, id, bounds.x, bounds.y, symbolNodes),
  );

  const symbol: SymbolDefinition = {
    id: nanoid(10),
    name: name ?? `Symbol ${Object.keys(doc.symbols ?? {}).length + 1}`,
    width: Math.max(1, bounds.w),
    height: Math.max(1, bounds.h),
    rootChildIds,
    nodes: symbolNodes,
  };

  const instance: SymbolInstanceNode = {
    id: nanoid(10),
    name: symbol.name,
    type: "symbolInstance",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: defaultTransform(bounds.x, bounds.y),
    symbolId: symbol.id,
    width: symbol.width,
    height: symbol.height,
  };

  return { symbol, instance };
}

/** Expand instance into concrete nodes. Returns all new nodes + root ids. */
export function expandSymbolInstance(
  doc: SvgDocument,
  instanceId: NodeId,
): { roots: NodeId[]; nodes: Record<NodeId, SceneNode> } | null {
  const inst = doc.nodes[instanceId];
  if (!inst || inst.type !== "symbolInstance") return null;
  const symbol = doc.symbols[inst.symbolId];
  if (!symbol) return null;

  const instanceWorld = nodeWorldMatrix(doc, instanceId);
  if (!instanceWorld) return null;
  const instanceLocal = transformToMatrix(inst.transform);
  const inverseLocal = invertMat(instanceLocal);
  if (!inverseLocal) return null;
  const parentWorld = multiply(instanceWorld, inverseLocal);

  const mini: SvgDocument = {
    ...doc,
    rootChildIds: symbol.rootChildIds,
    nodes: symbol.nodes,
  };

  const nodes: Record<NodeId, SceneNode> = {};
  const map = new Map<NodeId, NodeId>();
  for (const oldId of Object.keys(symbol.nodes)) {
    map.set(oldId, nanoid(10));
  }

  for (const [oldId, src] of Object.entries(symbol.nodes)) {
    const clone = structuredClone(src) as SceneNode;
    clone.id = map.get(oldId)!;
    if (clone.clipPathId && map.has(clone.clipPathId)) {
      clone.clipPathId = map.get(clone.clipPathId)!;
    }
    if (clone.type === "group") {
      clone.children = clone.children.map((child) => map.get(child) ?? child);
    }
    nodes[clone.id] = clone;
  }

  for (const oldRoot of symbol.rootChildIds) {
    const newId = map.get(oldRoot);
    const clone = newId ? nodes[newId] : undefined;
    const symbolWorld = nodeWorldMatrix(mini, oldRoot);
    if (!newId || !clone || !symbolWorld) return null;
    const local = transformForNewParent(multiply(instanceWorld, symbolWorld), parentWorld);
    if (!local) return null;
    clone.transform = local;
  }

  const roots = symbol.rootChildIds.map((rid) => map.get(rid)!).filter(Boolean);
  if (roots.length !== symbol.rootChildIds.length) return null;
  return { roots, nodes };
}
