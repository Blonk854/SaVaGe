import { nanoid } from "nanoid";
import {
  defaultStroke,
  defaultTransform,
  solidFill,
  type GroupNode,
  type PathNode,
  type PathPoint,
} from "../../shared/document/types";
import type { StampPlacement } from "../../shared/geometry/brushStamps";

function rotateScale(
  pts: { x: number; y: number }[],
  stamp: StampPlacement,
): PathPoint[] {
  const c = Math.cos(stamp.angle);
  const s = Math.sin(stamp.angle);
  const sc = stamp.scale;
  return pts.map((p) => ({
    id: nanoid(8),
    x: stamp.x + (p.x * c - p.y * s) * sc,
    y: stamp.y + (p.x * s + p.y * c) * sc,
    type: "corner" as const,
  }));
}

/** Chevron motif for pattern brush (local coords). */
export const CHEVRON: { x: number; y: number }[] = [
  { x: -6, y: -4 },
  { x: 0, y: 0 },
  { x: -6, y: 4 },
  { x: -3, y: 0 },
];

/** Leaf-ish motif for scatter brush. */
export const LEAF: { x: number; y: number }[] = [
  { x: 0, y: -8 },
  { x: 4, y: -2 },
  { x: 0, y: 8 },
  { x: -4, y: -2 },
];

export function stampToPath(
  motif: { x: number; y: number }[],
  stamp: StampPlacement,
  name: string,
  fill = "#B8FF3C",
): PathNode {
  return {
    id: nanoid(10),
    name,
    type: "path",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: defaultTransform(),
    subpaths: [{ closed: true, points: rotateScale(motif, stamp) }],
    fill: solidFill(fill, 0.9),
    stroke: { ...defaultStroke("#0B0D10", 0), paint: { type: "none" } },
    fillRule: "nonzero",
  };
}

export function stampsToGroup(
  motif: { x: number; y: number }[],
  stamps: StampPlacement[],
  groupName: string,
  fill: string,
): { group: GroupNode; children: PathNode[] } {
  const children = stamps.map((s, i) =>
    stampToPath(motif, s, `${groupName} ${i + 1}`, fill),
  );
  const group: GroupNode = {
    id: nanoid(10),
    name: groupName,
    type: "group",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: defaultTransform(),
    children: children.map((c) => c.id),
  };
  return { group, children };
}
