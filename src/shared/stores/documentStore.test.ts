import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyDocument } from "../document/emptyDocument";
import {
  defaultStroke,
  defaultTransform,
  solidFill,
  type RectNode,
} from "../document/types";
import { useDocumentStore } from "./documentStore";

function rect(id: string, x: number): RectNode {
  return {
    id,
    name: id,
    type: "rect",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: defaultTransform(x, 0),
    width: 10,
    height: 10,
    rx: 0,
    ry: 0,
    fill: solidFill("#fff"),
    stroke: defaultStroke("#000", 1),
  };
}

describe("documentStore.duplicateSelection", () => {
  beforeEach(() => {
    const doc = createEmptyDocument();
    useDocumentStore.setState({ doc, selection: [] });
    useDocumentStore.getState().addNode(rect("a", 0));
    useDocumentStore.getState().addNode(rect("b", 20));
  });

  it("deep-copies groups so children do not share ids", () => {
    useDocumentStore.getState().setSelection(["a", "b"]);
    useDocumentStore.getState().groupSelection();
    const groupId = useDocumentStore.getState().selection[0];
    const originalChildren = [
      ...(useDocumentStore.getState().doc.nodes[groupId] as { children: string[] }).children,
    ];

    useDocumentStore.getState().duplicateSelection();
    const state = useDocumentStore.getState();
    const copyId = state.selection[0];
    expect(copyId).not.toBe(groupId);
    const copy = state.doc.nodes[copyId];
    expect(copy.type).toBe("group");
    if (copy.type !== "group") return;
    expect(copy.children).toHaveLength(2);
    expect(copy.children).not.toEqual(originalChildren);
    for (const cid of copy.children) {
      expect(originalChildren.includes(cid)).toBe(false);
      expect(state.doc.nodes[cid]).toBeTruthy();
    }
    for (const cid of originalChildren) {
      expect(state.doc.nodes[cid]).toBeTruthy();
    }
    expect(state.doc.rootChildIds).toContain(groupId);
    expect(state.doc.rootChildIds).toContain(copyId);
  });
});

describe("clip masks", () => {
  beforeEach(() => {
    const doc = createEmptyDocument();
    useDocumentStore.setState({ doc, selection: [] });
    useDocumentStore.getState().addNode(rect("a", 0));
    useDocumentStore.getState().addNode(rect("b", 20));
    useDocumentStore.getState().addNode(rect("c", 40));
  });

  it("returns false when the selection cannot clip", () => {
    useDocumentStore.getState().setSelection(["a"]);
    expect(useDocumentStore.getState().applyClipMask()).toBe(false);
  });

  it("hides the mask and does not unhide it while another node still uses it", () => {
    const store = useDocumentStore.getState();
    store.setSelection(["a", "b"]);
    expect(store.applyClipMask()).toBe(true);
    expect(useDocumentStore.getState().doc.nodes.a.clipPathId).toBe("b");
    expect(useDocumentStore.getState().doc.nodes.b.visible).toBe(false);

    useDocumentStore.getState().updateNode("c", { clipPathId: "b" });
    useDocumentStore.getState().setSelection(["a"]);
    expect(useDocumentStore.getState().releaseClipMask()).toBe(true);
    expect(useDocumentStore.getState().doc.nodes.a.clipPathId).toBeNull();
    expect(useDocumentStore.getState().doc.nodes.b.visible).toBe(false);
    expect(useDocumentStore.getState().doc.nodes.c.clipPathId).toBe("b");
  });
});
