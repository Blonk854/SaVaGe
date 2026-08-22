import { create } from "zustand";
import { temporal } from "zundo";
import { produce } from "immer";
import { nanoid } from "nanoid";
import { createEmptyDocument } from "../document/emptyDocument";
import { svgStringToDocument } from "../document/deserialize";
import {
  createArtboard,
  ensureArtboards,
  nextArtboardPlacement,
  syncDocBoundsFromArtboards,
} from "../document/artboards";
import {
  buildSymbolFromSelection,
  ensureSymbols,
  expandSymbolInstance,
} from "../document/symbols";
import type {
  Artboard,
  GroupNode,
  NodeId,
  SceneNode,
  SvgDocument,
  Transform2D,
} from "../document/types";

interface DocumentState {
  doc: SvgDocument;
  selection: NodeId[];
  loadDocument: (doc: SvgDocument) => void;
  replaceFromSvg: (svg: string, name?: string) => void;
  setSelection: (ids: NodeId[]) => void;
  addNode: (node: SceneNode, parentId?: NodeId | null) => void;
  updateNode: (id: NodeId, patch: Partial<SceneNode>) => void;
  deleteNodes: (ids: NodeId[]) => void;
  reorderInParent: (id: NodeId, index: number) => void;
  groupSelection: () => void;
  ungroup: (id: NodeId) => void;
  setNodeTransform: (id: NodeId, t: Transform2D) => void;
  duplicateSelection: () => void;
  selectAll: () => void;
  nudgeSelection: (dx: number, dy: number) => void;
  setActiveArtboard: (id: NodeId) => void;
  addArtboard: (partial?: Partial<Artboard>) => void;
  updateArtboard: (id: NodeId, patch: Partial<Artboard>) => void;
  removeArtboard: (id: NodeId) => void;
  applyClipMask: () => boolean;
  releaseClipMask: () => boolean;
  createSymbolFromSelection: (name?: string) => void;
  placeSymbol: (symbolId: NodeId) => void;
  detachSymbol: (instanceId?: NodeId) => void;
  deleteSymbol: (symbolId: NodeId) => void;
}

function findParent(doc: SvgDocument, id: NodeId): NodeId | null {
  if (doc.rootChildIds.includes(id)) return null;
  for (const node of Object.values(doc.nodes)) {
    if (node.type === "group" && node.children.includes(id)) return node.id;
  }
  return null;
}

function collectDescendants(doc: SvgDocument, id: NodeId, out: Set<NodeId>) {
  out.add(id);
  const node = doc.nodes[id];
  if (node?.type === "group") {
    for (const cid of node.children) collectDescendants(doc, cid, out);
  }
}

function normalizeDoc(doc: SvgDocument): SvgDocument {
  const copy = structuredClone(doc);
  ensureArtboards(copy);
  ensureSymbols(copy);
  return copy;
}

export const useDocumentStore = create<DocumentState>()(
  temporal(
    (set, get) => ({
      doc: createEmptyDocument(),
      selection: [],

      loadDocument: (doc) => set({ doc: normalizeDoc(doc), selection: [] }),

      replaceFromSvg: (svg, name) => {
        const doc = normalizeDoc(svgStringToDocument(svg, name));
        set({ doc, selection: [] });
      },

      setSelection: (ids) => set({ selection: ids }),

      addNode: (node, parentId = null) =>
        set(
          produce((state: DocumentState) => {
            state.doc.nodes[node.id] = node;
            if (parentId && state.doc.nodes[parentId]?.type === "group") {
              (state.doc.nodes[parentId] as GroupNode).children.push(node.id);
            } else {
              state.doc.rootChildIds.push(node.id);
            }
            state.selection = [node.id];
          }),
        ),

      updateNode: (id, patch) =>
        set(
          produce((state: DocumentState) => {
            const node = state.doc.nodes[id];
            if (!node) return;
            Object.assign(node, patch, { id: node.id, type: node.type });
          }),
        ),

      deleteNodes: (ids) =>
        set(
          produce((state: DocumentState) => {
            const doomed = new Set<NodeId>();
            for (const id of ids) collectDescendants(state.doc, id, doomed);
            state.doc.rootChildIds = state.doc.rootChildIds.filter((id) => !doomed.has(id));
            for (const node of Object.values(state.doc.nodes)) {
              if (node.type === "group") {
                node.children = node.children.filter((id) => !doomed.has(id));
              }
              if (node.clipPathId && doomed.has(node.clipPathId)) {
                node.clipPathId = null;
              }
            }
            for (const id of doomed) delete state.doc.nodes[id];
            state.selection = state.selection.filter((id) => !doomed.has(id));
          }),
        ),

      reorderInParent: (id, index) =>
        set(
          produce((state: DocumentState) => {
            const parentId = findParent(state.doc, id);
            const list = parentId
              ? (state.doc.nodes[parentId] as GroupNode).children
              : state.doc.rootChildIds;
            const from = list.indexOf(id);
            if (from < 0) return;
            list.splice(from, 1);
            list.splice(Math.max(0, Math.min(index, list.length)), 0, id);
          }),
        ),

      groupSelection: () =>
        set(
          produce((state: DocumentState) => {
            const ids = state.selection.filter((id) => state.doc.nodes[id]);
            if (ids.length < 2) return;
            const groupId = nanoid(10);
            const group: GroupNode = {
              id: groupId,
              name: "Group",
              type: "group",
              visible: true,
              locked: false,
              opacity: 1,
              blendMode: "normal",
              transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 },
              children: [...ids],
            };
            for (const id of ids) {
              const parentId = findParent(state.doc, id);
              if (parentId) {
                const g = state.doc.nodes[parentId] as GroupNode;
                g.children = g.children.filter((c) => c !== id);
              } else {
                state.doc.rootChildIds = state.doc.rootChildIds.filter((c) => c !== id);
              }
            }
            state.doc.nodes[groupId] = group;
            state.doc.rootChildIds.push(groupId);
            state.selection = [groupId];
          }),
        ),

      ungroup: (id) =>
        set(
          produce((state: DocumentState) => {
            const node = state.doc.nodes[id];
            if (!node || node.type !== "group") return;
            const parentId = findParent(state.doc, id);
            const list = parentId
              ? (state.doc.nodes[parentId] as GroupNode).children
              : state.doc.rootChildIds;
            const idx = list.indexOf(id);
            if (idx < 0) return;
            list.splice(idx, 1, ...node.children);
            delete state.doc.nodes[id];
            state.selection = [...node.children];
          }),
        ),

      setNodeTransform: (id, t) =>
        set(
          produce((state: DocumentState) => {
            const node = state.doc.nodes[id];
            if (node) node.transform = t;
          }),
        ),

      duplicateSelection: () => {
        const { selection, doc } = get();
        if (!selection.length) return;
        const created: SceneNode[] = [];
        const cloneSubtree = (id: NodeId, asRoot: boolean): NodeId | null => {
          const src = doc.nodes[id];
          if (!src) return null;
          const copy = structuredClone(src) as SceneNode;
          copy.id = nanoid(10);
          if (asRoot) copy.name = `${src.name} copy`;
          if (copy.type === "group") {
            const childIds = src.type === "group" ? src.children : [];
            copy.children = childIds
              .map((cid) => cloneSubtree(cid, false))
              .filter((cid): cid is NodeId => !!cid);
          }
          created.push(copy);
          return copy.id;
        };
        const plans = selection.flatMap((id) => {
          const src = doc.nodes[id];
          const copyId = cloneSubtree(id, true);
          if (!src || !copyId) return [];
          return [{ id, copyId, x: src.transform.x + 16, y: src.transform.y + 16 }];
        });
        if (!plans.length) return;
        set(
          produce((state: DocumentState) => {
            for (const node of created) state.doc.nodes[node.id] = node;
            for (const plan of plans) {
              const copy = state.doc.nodes[plan.copyId];
              copy.transform = { ...copy.transform, x: plan.x, y: plan.y };
              const parentId = findParent(state.doc, plan.id);
              if (parentId && state.doc.nodes[parentId]?.type === "group") {
                const children = (state.doc.nodes[parentId] as GroupNode).children;
                const idx = children.indexOf(plan.id);
                children.splice(idx < 0 ? children.length : idx + 1, 0, plan.copyId);
              } else {
                const idx = state.doc.rootChildIds.indexOf(plan.id);
                state.doc.rootChildIds.splice(
                  idx < 0 ? state.doc.rootChildIds.length : idx + 1,
                  0,
                  plan.copyId,
                );
              }
            }
            state.selection = plans.map((p) => p.copyId);
          }),
        );
      },

      selectAll: () =>
        set((state) => ({
          selection: [...state.doc.rootChildIds],
        })),

      nudgeSelection: (dx, dy) =>
        set(
          produce((state: DocumentState) => {
            for (const id of state.selection) {
              const node = state.doc.nodes[id];
              if (!node || node.locked) continue;
              node.transform.x += dx;
              node.transform.y += dy;
            }
          }),
        ),

      setActiveArtboard: (id) =>
        set(
          produce((state: DocumentState) => {
            if (state.doc.artboards.some((a) => a.id === id)) {
              state.doc.activeArtboardId = id;
            }
          }),
        ),

      addArtboard: (partial) =>
        set(
          produce((state: DocumentState) => {
            ensureArtboards(state.doc);
            const place = nextArtboardPlacement(
              state.doc,
              partial?.width ?? 1920,
              partial?.height ?? 1080,
            );
            const ab = createArtboard(
              partial?.name ?? `Artboard ${state.doc.artboards.length + 1}`,
              partial?.x ?? place.x,
              partial?.y ?? place.y,
              place.width,
              place.height,
              partial?.background ?? "#ffffff",
            );
            state.doc.artboards.push(ab);
            state.doc.activeArtboardId = ab.id;
            syncDocBoundsFromArtboards(state.doc);
          }),
        ),

      updateArtboard: (id, patch) =>
        set(
          produce((state: DocumentState) => {
            const ab = state.doc.artboards.find((a) => a.id === id);
            if (!ab) return;
            Object.assign(ab, patch);
            syncDocBoundsFromArtboards(state.doc);
          }),
        ),

      removeArtboard: (id) =>
        set(
          produce((state: DocumentState) => {
            if (state.doc.artboards.length <= 1) return;
            state.doc.artboards = state.doc.artboards.filter((a) => a.id !== id);
            if (state.doc.activeArtboardId === id) {
              state.doc.activeArtboardId = state.doc.artboards[0].id;
            }
            syncDocBoundsFromArtboards(state.doc);
          }),
        ),

      applyClipMask: () => {
        const { selection, doc } = get();
        const ids = selection.filter((id) => doc.nodes[id]);
        if (ids.length < 2) return false;
        const maskId = ids[ids.length - 1];
        const mask = doc.nodes[maskId];
        if (!mask || (mask.type !== "path" && mask.type !== "rect" && mask.type !== "ellipse")) {
          return false;
        }
        set(
          produce((state: DocumentState) => {
            const targets = ids.slice(0, -1);
            for (const tid of targets) {
              const t = state.doc.nodes[tid];
              if (t) t.clipPathId = maskId;
            }
            const next = state.doc.nodes[maskId];
            if (next) next.visible = false;
            state.selection = targets;
          }),
        );
        return true;
      },

      releaseClipMask: () => {
        const { selection, doc } = get();
        const clipped = selection.filter((id) => doc.nodes[id]?.clipPathId);
        if (!clipped.length) return false;
        set(
          produce((state: DocumentState) => {
            for (const id of clipped) {
              const node = state.doc.nodes[id];
              if (!node?.clipPathId) continue;
              const maskId = node.clipPathId;
              node.clipPathId = null;
              const stillUsed = Object.values(state.doc.nodes).some((n) => n.clipPathId === maskId);
              const maskNode = state.doc.nodes[maskId];
              if (maskNode && !stillUsed) maskNode.visible = true;
            }
          }),
        );
        return true;
      },

      createSymbolFromSelection: (name) =>
        set(
          produce((state: DocumentState) => {
            ensureSymbols(state.doc);
            const built = buildSymbolFromSelection(state.doc, state.selection, name);
            if (!built) return;
            state.doc.symbols[built.symbol.id] = built.symbol;
            const doomed = new Set<NodeId>();
            for (const id of state.selection) collectDescendants(state.doc, id, doomed);
            state.doc.rootChildIds = state.doc.rootChildIds.filter((id) => !doomed.has(id));
            for (const node of Object.values(state.doc.nodes)) {
              if (node.type === "group") {
                node.children = node.children.filter((cid) => !doomed.has(cid));
              }
            }
            for (const id of doomed) delete state.doc.nodes[id];
            state.doc.nodes[built.instance.id] = built.instance;
            state.doc.rootChildIds.push(built.instance.id);
            state.selection = [built.instance.id];
          }),
        ),

      placeSymbol: (symbolId) =>
        set(
          produce((state: DocumentState) => {
            ensureSymbols(state.doc);
            const symbol = state.doc.symbols[symbolId];
            if (!symbol) return;
            const ab =
              state.doc.artboards.find((a) => a.id === state.doc.activeArtboardId) ??
              state.doc.artboards[0];
            const inst: SceneNode = {
              id: nanoid(10),
              name: symbol.name,
              type: "symbolInstance",
              visible: true,
              locked: false,
              opacity: 1,
              blendMode: "normal",
              transform: {
                x: (ab?.x ?? 0) + 40,
                y: (ab?.y ?? 0) + 40,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                skewX: 0,
                skewY: 0,
              },
              symbolId: symbol.id,
              width: symbol.width,
              height: symbol.height,
            };
            state.doc.nodes[inst.id] = inst;
            state.doc.rootChildIds.push(inst.id);
            state.selection = [inst.id];
          }),
        ),

      detachSymbol: (instanceId) =>
        set(
          produce((state: DocumentState) => {
            const id = instanceId ?? state.selection[0];
            if (!id) return;
            const expanded = expandSymbolInstance(state.doc, id);
            if (!expanded) return;
            const parentId = findParent(state.doc, id);
            delete state.doc.nodes[id];
            Object.assign(state.doc.nodes, expanded.nodes);
            if (parentId) {
              const parent = state.doc.nodes[parentId];
              if (parent?.type === "group") {
                const idx = parent.children.indexOf(id);
                if (idx >= 0) parent.children.splice(idx, 1, ...expanded.roots);
                else parent.children.push(...expanded.roots);
              }
            } else {
              const idx = state.doc.rootChildIds.indexOf(id);
              if (idx >= 0) state.doc.rootChildIds.splice(idx, 1, ...expanded.roots);
              else state.doc.rootChildIds.push(...expanded.roots);
            }
            state.selection = [...expanded.roots];
          }),
        ),

      deleteSymbol: (symbolId) => {
        const instances = Object.values(get().doc.nodes)
          .filter((n) => n.type === "symbolInstance" && n.symbolId === symbolId)
          .map((n) => n.id);
        for (const id of instances) get().detachSymbol(id);
        const leftover = Object.values(get().doc.nodes)
          .filter((n) => n.type === "symbolInstance" && n.symbolId === symbolId)
          .map((n) => n.id);
        if (leftover.length) get().deleteNodes(leftover);
        set(
          produce((state: DocumentState) => {
            delete state.doc.symbols[symbolId];
          }),
        );
      },
    }),
    { limit: 100 },
  ),
);

export function useDocumentTemporal() {
  return useDocumentStore.temporal;
}
