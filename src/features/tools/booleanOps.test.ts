import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyDocument } from "../../shared/document/emptyDocument";
import {
  defaultStroke,
  defaultTransform,
  solidFill,
  type LineNode,
  type RectNode,
} from "../../shared/document/types";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { runBooleanOp } from "./booleanOps";

function rect(id: string, x: number, color: string): RectNode {
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
    fill: solidFill(color),
    stroke: defaultStroke("#000", 1),
  };
}

describe("runBooleanOp", () => {
  beforeEach(() => {
    const doc = createEmptyDocument();
    const guide: LineNode = {
      id: "guide",
      name: "guide",
      type: "line",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      transform: defaultTransform(),
      x2: 20,
      y2: 20,
      stroke: defaultStroke("#f00", 1),
    };
    doc.nodes = {
      first: rect("first", 0, "#111111"),
      guide,
      second: rect("second", 5, "#222222"),
    };
    doc.rootChildIds = ["first", "guide", "second"];
    useDocumentStore.getState().loadDocument(doc);
    useDocumentStore.getState().setSelection(["first", "guide", "second"]);
  });

  it("replaces only participating operands in one undo transaction", async () => {
    await runBooleanOp("union", async (subjects) => subjects);

    const state = useDocumentStore.getState();
    const resultId = state.selection[0];
    expect(state.doc.nodes.first).toBeUndefined();
    expect(state.doc.nodes.second).toBeUndefined();
    expect(state.doc.nodes.guide).toBeTruthy();
    expect(state.doc.nodes[resultId].type).toBe("path");
    expect("fill" in state.doc.nodes[resultId] && state.doc.nodes[resultId].fill).toEqual(
      solidFill("#222222"),
    );
    expect(useDocumentStore.temporal.getState().pastStates).toHaveLength(1);

    useDocumentStore.temporal.getState().undo();
    expect(useDocumentStore.getState().doc.nodes.first).toBeTruthy();
    expect(useDocumentStore.getState().doc.nodes.second).toBeTruthy();
    expect(useDocumentStore.getState().doc.nodes.guide).toBeTruthy();
    expect(useDocumentStore.getState().doc.nodes[resultId]).toBeUndefined();
  });
});