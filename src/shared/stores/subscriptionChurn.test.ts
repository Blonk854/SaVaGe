import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyDocument } from "../document/emptyDocument";
import {
  defaultStroke,
  defaultTransform,
  solidFill,
  type RectNode,
} from "../document/types";
import { useDocumentStore } from "./documentStore";
import {
  projectSaveLabel,
  useProjectSessionStore,
} from "./projectSessionStore";

function rect(id: string): RectNode {
  return {
    id,
    name: id,
    type: "rect",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: defaultTransform(),
    width: 10,
    height: 10,
    rx: 0,
    ry: 0,
    fill: solidFill("#fff"),
    stroke: defaultStroke("#000", 1),
  };
}

describe("store subscription churn", () => {
  beforeEach(() => {
    useDocumentStore.temporal.getState().clear();
    useDocumentStore.setState({ doc: createEmptyDocument(), selection: [] });
    useProjectSessionStore.getState().startSession({ displayName: "Untitled" });
  });

  it("keeps the Unsaved label stable so title chrome can skip re-renders", () => {
    let label = projectSaveLabel(useDocumentStore.getState().doc);
    let labelChanges = 0;
    const stop = useDocumentStore.subscribe((state) => {
      const next = projectSaveLabel(state.doc);
      if (next !== label) {
        label = next;
        labelChanges += 1;
      }
    });
    useDocumentStore.getState().addNode(rect("a"));
    useDocumentStore.getState().setNodeTransform("a", {
      ...useDocumentStore.getState().doc.nodes.a.transform,
      x: 40,
    });
    stop();
    expect(label).toBe("Unsaved");
    expect(labelChanges).toBe(0);
  });

  it("does not notify a node selector when a different node is edited", () => {
    useDocumentStore.getState().addNode(rect("a"));
    useDocumentStore.getState().addNode(rect("b"));
    const listener = vi.fn();
    const stop = useDocumentStore.subscribe((state, previous) => {
      if (state.doc.nodes.a !== previous.doc.nodes.a) listener();
    });
    useDocumentStore.getState().setNodeTransform("b", {
      ...useDocumentStore.getState().doc.nodes.b.transform,
      x: 80,
    });
    stop();
    expect(listener).not.toHaveBeenCalled();
  });
});
