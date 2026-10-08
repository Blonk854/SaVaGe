import { syncDocBoundsFromArtboards } from "../../shared/document/artboards";
import {
  svgStringToDocument,
  SvgParseError,
  type DropReport,
} from "../../shared/document/deserialize";
import { documentToSvgString } from "../../shared/document/serialize";
import type {
  NodeId,
  PathPoint,
  PathSubpath,
  SceneNode,
  StrokeStyle,
  SvgDocument,
} from "../../shared/document/types";

export function docToCode(doc: SvgDocument): string {
  return documentToSvgString(doc);
}

export type CodeToDocResult =
  | { ok: true; doc: SvgDocument; noop: boolean; dropped: Map<string, number> }
  | { ok: false; error: string; line?: number; column?: number };

export function codeToDoc(text: string, current: SvgDocument): CodeToDocResult {
  const report: DropReport = { dropped: new Map() };
  let parsed: SvgDocument;
  try {
    parsed = svgStringToDocument(text, current.name, {
      preserveIds: true,
      report,
      context: { nodes: current.nodes, symbols: current.symbols },
    });
  } catch (error) {
    if (error instanceof SvgParseError) {
      return { ok: false, error: error.message, line: error.line, column: error.column };
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  const merged = mergeWithCurrent(parsed, current);
  // The merged doc differs from `current` only in SVG-expressible fields, so equal
  // serializations mean the edit was a no-op. This sidesteps JSON key order and is
  // robust to formatting changes in the text.
  const noop = docToCode(merged) === docToCode(current);
  return { ok: true, doc: merged, noop, dropped: report.dropped };
}

/**
 * Takes geometry/paint/structure from `parsed` and everything SVG text cannot express from
 * `current`: name, artboards, background, assets, symbols, and per-node locked / blendMode /
 * effects / clipPathId / skew / stroke extras / text lineHeight / path point identity.
 */
export function mergeWithCurrent(parsed: SvgDocument, current: SvgDocument): SvgDocument {
  const nodes: Record<NodeId, SceneNode> = {};
  for (const id of Object.keys(current.nodes)) {
    const p = parsed.nodes[id];
    if (p) nodes[id] = mergeNode(p, current.nodes[id], parsed.nodes);
  }
  for (const id of Object.keys(parsed.nodes)) {
    if (!nodes[id]) nodes[id] = parsed.nodes[id];
  }
  const merged: SvgDocument = {
    ...structuredClone(current),
    rootChildIds: parsed.rootChildIds,
    nodes,
  };
  syncDocBoundsFromArtboards(merged);
  return merged;
}

function strokeOf(node: SceneNode): StrokeStyle | undefined {
  return "stroke" in node ? node.stroke : undefined;
}

function mergeNode(
  parsed: SceneNode,
  current: SceneNode,
  parsedNodes: Record<NodeId, SceneNode>,
): SceneNode {
  if (parsed.type !== current.type) return parsed;
  const merged = { ...structuredClone(current), ...parsed } as SceneNode;
  merged.locked = current.locked;
  merged.blendMode = current.blendMode;
  merged.transform = {
    ...parsed.transform,
    skewX: current.transform.skewX,
    skewY: current.transform.skewY,
  };
  if (current.effects) merged.effects = structuredClone(current.effects);
  else delete merged.effects;
  if (current.clipPathId) {
    merged.clipPathId = parsedNodes[current.clipPathId] ? current.clipPathId : null;
  }
  const currentStroke = strokeOf(current);
  if (currentStroke && "stroke" in merged) {
    merged.stroke = {
      ...merged.stroke,
      miterLimit: currentStroke.miterLimit,
      align: currentStroke.align,
      dashOffset: currentStroke.dashOffset,
    };
  }
  if (merged.type === "path" && current.type === "path") {
    merged.subpaths = mergeSubpaths(merged.subpaths, current.subpaths);
  }
  if (merged.type === "text" && current.type === "text") {
    merged.lineHeight = current.lineHeight;
  }
  return merged;
}

function sameShape(a: PathSubpath[], b: PathSubpath[]): boolean {
  return a.length === b.length && a.every((sp, i) => sp.points.length === b[i].points.length);
}

function sameHandle(a?: { x: number; y: number }, b?: { x: number; y: number }): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y;
}

/** Reuse point ids/types when the point counts match. Drop zero-length handles the parser invents. */
function mergeSubpaths(parsed: PathSubpath[], current: PathSubpath[]): PathSubpath[] {
  if (!sameShape(parsed, current)) return parsed;
  return parsed.map((sp, i) => ({
    ...sp,
    points: sp.points.map((p, j) => {
      const cp = current[i].points[j];
      const point: PathPoint = { ...p, id: cp.id };
      if (!cp.handleIn && point.handleIn && point.handleIn.x === p.x && point.handleIn.y === p.y) {
        delete point.handleIn;
      }
      if (!cp.handleOut && point.handleOut && point.handleOut.x === p.x && point.handleOut.y === p.y) {
        delete point.handleOut;
      }
      const handlesUnchanged =
        sameHandle(point.handleIn, cp.handleIn) && sameHandle(point.handleOut, cp.handleOut);
      point.type = handlesUnchanged ? cp.type : p.type;
      if (cp.strokeWidth !== undefined) point.strokeWidth = cp.strokeWidth;
      return point;
    }),
  }));
}
