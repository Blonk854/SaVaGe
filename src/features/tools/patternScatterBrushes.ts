import { useDocumentStore } from "../../shared/stores/documentStore";
import {
  patternStampsAlong,
  scatterStampsAlong,
} from "../../shared/geometry/brushStamps";
import { CHEVRON, LEAF, stampsToGroup } from "./brushMotifs";
import type { Tool } from "./types";

let drawing = false;
let samples: { x: number; y: number }[] = [];
let last = { x: 0, y: 0 };

function placeGroup(
  motif: { x: number; y: number }[],
  stamps: ReturnType<typeof patternStampsAlong>,
  name: string,
  fill: string,
) {
  if (!stamps.length) return;
  const { group, children } = stampsToGroup(motif, stamps, name, fill);
  const store = useDocumentStore.getState();
  store.addNode({ ...group, children: [] });
  for (const child of children) store.addNode(child, group.id);
  store.setSelection([group.id]);
}

function makeStrokeTool(
  id: "patternBrush" | "scatterBrush",
  commit: () => void,
): Tool {
  return {
    id,
    onPointerDown(e) {
      drawing = true;
      samples = [{ x: e.wx, y: e.wy }];
      last = { x: e.wx, y: e.wy };
    },
    onPointerMove(e) {
      if (!drawing) return;
      if (Math.hypot(e.wx - last.x, e.wy - last.y) < 4) return;
      samples.push({ x: e.wx, y: e.wy });
      last = { x: e.wx, y: e.wy };
    },
    onPointerUp() {
      if (!drawing) return;
      drawing = false;
      commit();
      samples = [];
    },
  };
}

export const patternBrushTool = makeStrokeTool("patternBrush", () => {
  if (samples.length < 2) return;
  placeGroup(CHEVRON, patternStampsAlong(samples, 14), "Pattern Brush", "#B8FF3C");
});

export const scatterBrushTool = makeStrokeTool("scatterBrush", () => {
  if (samples.length < 2) return;
  const stamps = scatterStampsAlong(samples, {
    spacing: 18,
    jitter: 10,
    scaleMin: 0.55,
    scaleMax: 1.35,
    seed: samples[0].x * 0.01 + samples[0].y * 0.001,
  });
  placeGroup(LEAF, stamps, "Scatter Brush", "#34D399");
});
