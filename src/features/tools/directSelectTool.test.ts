import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyDocument } from "../../shared/document/emptyDocument";
import {
  defaultStroke,
  defaultTransform,
  solidFill,
  type PathNode,
} from "../../shared/document/types";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { useUiStore } from "../../shared/stores/uiStore";
import { directSelectTool, nearestPathPoint } from "./directSelectTool";
import type { ToolEvent } from "./types";

function evt(wx: number, wy: number, extra: Partial<ToolEvent> = {}): ToolEvent {
  return {
    sx: wx,
    sy: wy,
    wx,
    wy,
    shiftKey: false,
    altKey: false,
    button: 0,
    buttons: 1,
    ...extra,
  };
}

function pathAt(id: string, x: number, y: number, scaleX = 1): PathNode {
  return {
    id,
    name: "Path",
    type: "path",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: { ...defaultTransform(x, y), scaleX },
    subpaths: [
      {
        closed: true,
        points: [
          { id: `${id}-a`, x: 0, y: 0, type: "corner" },
          { id: `${id}-b`, x: 20, y: 0, type: "corner" },
          { id: `${id}-c`, x: 20, y: 20, type: "corner" },
        ],
      },
    ],
    fill: solidFill("#fff"),
    stroke: defaultStroke("#000", 2),
    fillRule: "nonzero",
  };
}

describe("directSelectTool", () => {
  beforeEach(() => {
    const doc = createEmptyDocument();
    const node = pathAt("p1", 10, 5, 2);
    doc.nodes[node.id] = node;
    doc.rootChildIds = [node.id];
    useDocumentStore.setState({ doc, selection: [] });
    useUiStore.setState({ zoom: 1 });
  });

  it("finds the nearest world-space anchor", () => {
    const hit = nearestPathPoint(50, 5, 8);
    expect(hit?.point.id).toBe("p1-b");
  });

  it("moves a point in local space under a scaled transform", () => {
    directSelectTool.onPointerDown(evt(10, 5));
    directSelectTool.onPointerMove(evt(18, 5));
    directSelectTool.onPointerUp(evt(18, 5));
    const node = useDocumentStore.getState().doc.nodes.p1;
    expect(node.type).toBe("path");
    if (node.type === "path") {
      const a = node.subpaths[0].points[0];
      expect(a.x).toBeCloseTo(4);
      expect(a.y).toBeCloseTo(0);
    }
  });
});
