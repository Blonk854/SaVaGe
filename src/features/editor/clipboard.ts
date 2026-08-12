import { nanoid } from "nanoid";
import { produce } from "immer";
import { documentToSvgString } from "../../shared/document/serialize";
import { svgStringToDocument } from "../../shared/document/deserialize";
import { createEmptyDocument } from "../../shared/document/emptyDocument";
import type { SceneNode, SvgDocument } from "../../shared/document/types";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { useUiStore } from "../../shared/stores/uiStore";

const CLIP_KEY = "savage.clipboard.nodes";

function selectionAsDocument(): SvgDocument | null {
  const { doc, selection } = useDocumentStore.getState();
  if (!selection.length) return null;
  const out = createEmptyDocument(doc.width, doc.height, "clipboard");
  out.viewBox = { ...doc.viewBox };

  const visit = (id: string) => {
    const node = doc.nodes[id];
    if (!node || out.nodes[id]) return;
    out.nodes[id] = structuredClone(node) as SceneNode;
    if (node.type === "group") {
      for (const cid of node.children) visit(cid);
    }
  };

  for (const id of selection) {
    visit(id);
    out.rootChildIds.push(id);
  }

  // Include symbol masters referenced by copied instances
  for (const node of Object.values(out.nodes)) {
    if (node.type === "symbolInstance") {
      const sym = doc.symbols?.[node.symbolId];
      if (sym) out.symbols[node.symbolId] = structuredClone(sym);
    }
  }
  return out;
}

export async function copySelection() {
  const clipDoc = selectionAsDocument();
  if (!clipDoc) return;
  const svg = documentToSvgString(clipDoc);
  sessionStorage.setItem(CLIP_KEY, JSON.stringify(clipDoc));
  try {
    await navigator.clipboard.writeText(svg);
  } catch {
    // sessionStorage still holds the copy
  }
}

function pasteTree(source: SvgDocument, oldId: string, parentId?: string | null) {
  const src = source.nodes[oldId];
  if (!src) return null;
  const store = useDocumentStore.getState();
  const clone = structuredClone(src) as SceneNode;
  clone.id = nanoid(10);
  clone.name = `${src.name} copy`;
  if (parentId == null) {
    clone.transform = {
      ...clone.transform,
      x: clone.transform.x + 24,
      y: clone.transform.y + 24,
    };
  }

  if (clone.type === "group") {
    clone.children = [];
    store.addNode(clone, parentId ?? null);
    for (const childOld of src.type === "group" ? src.children : []) {
      const childId = pasteTree(source, childOld, clone.id);
      if (childId) {
        // addNode already pushed into parent; ensure order
      }
    }
    return clone.id;
  }

  store.addNode(clone, parentId ?? null);
  return clone.id;
}

function pasteDocument(source: SvgDocument) {
  if (source.symbols && Object.keys(source.symbols).length) {
    useDocumentStore.setState(
      produce((state) => {
        if (!state.doc.symbols) state.doc.symbols = {};
        for (const [id, sym] of Object.entries(source.symbols)) {
          if (!state.doc.symbols[id]) state.doc.symbols[id] = structuredClone(sym);
        }
      }),
    );
  }
  const newIds: string[] = [];
  for (const rootId of source.rootChildIds) {
    const id = pasteTree(source, rootId, null);
    if (id) newIds.push(id);
  }
  useDocumentStore.getState().setSelection(newIds);
  useUiStore.getState().markDirty();
}

export async function pasteClipboard() {
  const stored = sessionStorage.getItem(CLIP_KEY);
  if (stored) {
    try {
      pasteDocument(JSON.parse(stored) as SvgDocument);
      return;
    } catch {
      // fall through
    }
  }

  let text = "";
  try {
    text = await navigator.clipboard.readText();
  } catch {
    return;
  }
  if (!text.includes("<svg")) return;
  pasteDocument(svgStringToDocument(text, "Paste"));
}
