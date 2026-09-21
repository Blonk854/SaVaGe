import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyDocument } from "../../shared/document/emptyDocument";
import {
  defaultStroke,
  defaultTransform,
  solidFill,
  type GroupNode,
  type RectNode,
} from "../../shared/document/types";
import { applyMat, nodeWorldMatrix } from "../../shared/geometry/transform";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { copySelection, pasteClipboard } from "./clipboard";

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

describe("clipboard world copy", () => {
  beforeEach(() => {
    sessionStorage.clear();
    const doc = createEmptyDocument();
    const group: GroupNode = {
      id: "wrap",
      name: "wrap",
      type: "group",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      transform: { ...defaultTransform(), rotation: 90 },
      children: ["inner"],
    };
    doc.nodes = { wrap: group, inner: rect("inner", 10) };
    doc.rootChildIds = ["wrap"];
    useDocumentStore.setState({ doc, selection: ["inner"] });
  });

  it("bakes the copied node's world transform so paste keeps appearance", async () => {
    const origin = applyMat(nodeWorldMatrix(useDocumentStore.getState().doc, "inner")!, 0, 0);
    await copySelection();
    await pasteClipboard();
    const pasted = useDocumentStore.getState().selection[0];
    const pastedOrigin = applyMat(nodeWorldMatrix(useDocumentStore.getState().doc, pasted)!, 0, 0);
    expect(pastedOrigin.x).toBeCloseTo(origin.x + 24);
    expect(pastedOrigin.y).toBeCloseTo(origin.y + 24);
  });
});
