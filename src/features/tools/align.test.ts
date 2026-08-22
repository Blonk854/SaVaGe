import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyDocument } from "../../shared/document/emptyDocument";
import {
  defaultStroke,
  defaultTransform,
  solidFill,
  type RectNode,
} from "../../shared/document/types";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { alignSelection } from "./align";

function addRect(id: string, x: number, y: number, w: number, h: number) {
  const node: RectNode = {
    id,
    name: id,
    type: "rect",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: defaultTransform(x, y),
    width: w,
    height: h,
    rx: 0,
    ry: 0,
    fill: solidFill("#fff"),
    stroke: defaultStroke("#000", 1),
  };
  const doc = useDocumentStore.getState().doc;
  doc.nodes[id] = node;
  doc.rootChildIds.push(id);
}

describe("alignSelection", () => {
  beforeEach(() => {
    useDocumentStore.setState({ doc: createEmptyDocument(), selection: [] });
    addRect("a", 0, 0, 10, 10);
    addRect("b", 30, 20, 10, 10);
    useDocumentStore.getState().setSelection(["a", "b"]);
  });

  it("aligns left edges", () => {
    alignSelection("left");
    expect(useDocumentStore.getState().doc.nodes.a.transform.x).toBe(0);
    expect(useDocumentStore.getState().doc.nodes.b.transform.x).toBe(0);
  });

  it("aligns vertical centers", () => {
    alignSelection("middle");
    expect(useDocumentStore.getState().doc.nodes.a.transform.y).toBe(10);
    expect(useDocumentStore.getState().doc.nodes.b.transform.y).toBe(10);
  });
});
