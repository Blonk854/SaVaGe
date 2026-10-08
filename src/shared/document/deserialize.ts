import { nanoid } from "nanoid";
import { createEmptyDocument } from "./emptyDocument";
import { SAVAGE_LIMITS, validateSavageDocument } from "./parseSavage";
import {
  defaultStroke,
  defaultTransform,
  type ImageNode,
  type NodeId,
  type PathPoint,
  type PathSubpath,
  type SceneNode,
  type SvgDocument,
  type StrokeStyle,
  type SymbolInstanceNode,
} from "./types";
import {
  collectPaintServers,
  resolvePaint,
  SKIP_TAGS,
  type PaintServerMap,
} from "./svgPaints";

const MAX_TEXT_CHARS = 32 * 1024;

export class SvgParseError extends Error {
  line?: number;
  column?: number;
  constructor(message: string, line?: number, column?: number) {
    super(message);
    this.name = "SvgParseError";
    this.line = line;
    this.column = column;
  }
}

export interface DropReport {
  /** key: "<style>", "<use>", "filter attribute", … → count */
  dropped: Map<string, number>;
}

export interface SvgImportContext {
  nodes: Record<NodeId, SceneNode>;
  symbols: SvgDocument["symbols"];
}

export interface SvgImportOptions {
  /** Reuse valid, unique `id` attributes as node ids instead of fresh nanoids. Default false. */
  preserveIds?: boolean;
  /** When given, unsupported constructs are counted here. */
  report?: DropReport;
  /**
   * Code-mode context. Implies preserveIds. `<image>`/`<use>` elements whose id matches an
   * image / symbolInstance node in `nodes` are carried over (contents from the node, placement
   * from the element). `symbols` seed `doc.symbols` so symbol instances validate.
   */
  context?: SvgImportContext;
}

/** Reads a <parsererror> text. Chromium: "error on line 3 at column 5: …"; jsdom: "3:5: …". */
export function describeParserError(text: string): { message: string; line?: number; column?: number } {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const message =
    lines.find((l) => !/^This page contains/i.test(l) && !/^Below is a rendering/i.test(l)) ?? "";
  const chromium = /line (\d+) at column (\d+)/i.exec(text);
  const jsdom = /^\s*(\d+):(\d+):/.exec(text);
  const m = chromium ?? jsdom;
  if (!m) return { message };
  return { message, line: Number(m[1]), column: Number(m[2]) };
}

interface IngestBudget {
  servers: PaintServerMap;
  nodes: number;
  pathPoints: number;
  /** ids that may be reused as node ids (unique in the parse and valid). null = never reuse. */
  preservedIds: Set<string> | null;
  context: SvgImportContext | null;
}

function finiteNumber(raw: string | null | undefined, fallback: number): number {
  if (raw == null || raw === "") return fallback;
  const n = Number(String(raw).replace(/px$/i, "").trim());
  return Number.isFinite(n) ? n : fallback;
}

function rejectHostileSvgSource(svg: string) {
  if (svg.length > SAVAGE_LIMITS.sourceCharacters) {
    throw new Error(`SVG exceeds the ${SAVAGE_LIMITS.sourceCharacters}-character limit`);
  }
  if (/<!DOCTYPE/i.test(svg) || /<!ENTITY/i.test(svg)) {
    throw new Error("SVG with a document type or entity declaration is not supported");
  }
  if (/<\?xml-stylesheet/i.test(svg)) {
    throw new Error("SVG stylesheets are not supported");
  }
}

function claimNode(budget: IngestBudget) {
  budget.nodes += 1;
  if (budget.nodes > SAVAGE_LIMITS.nodes) {
    throw new Error(`SVG exceeds the ${SAVAGE_LIMITS.nodes}-node limit`);
  }
}

function claimPathPoints(budget: IngestBudget, count: number) {
  budget.pathPoints += count;
  if (budget.pathPoints > SAVAGE_LIMITS.pathPoints) {
    throw new Error(`SVG exceeds the ${SAVAGE_LIMITS.pathPoints}-point limit`);
  }
}

function parseStroke(el: Element, servers: PaintServerMap): StrokeStyle {
  const stroke = defaultStroke();
  stroke.paint = resolvePaint(el, "stroke", servers);
  const w = el.getAttribute("stroke-width");
  if (w) stroke.width = finiteNumber(w, 1);
  const cap = el.getAttribute("stroke-linecap");
  if (cap === "round" || cap === "square" || cap === "butt") stroke.lineCap = cap;
  const join = el.getAttribute("stroke-linejoin");
  if (join === "round" || join === "bevel" || join === "miter") stroke.lineJoin = join;
  const dash = el.getAttribute("stroke-dasharray");
  if (dash) {
    stroke.dashArray = dash
      .split(/[\s,]+/)
      .map(Number)
      .filter((n) => Number.isFinite(n));
  }
  return stroke;
}

function parseTransform(el: Element) {
  const t = defaultTransform();
  const raw = el.getAttribute("transform");
  if (!raw) return t;
  const translate = /translate\(\s*([-\d.eE+]+)[\s,]+([-\d.eE+]+)\s*\)/.exec(raw);
  if (translate) {
    t.x = finiteNumber(translate[1], 0);
    t.y = finiteNumber(translate[2], 0);
  }
  const rotate = /rotate\(\s*([-\d.eE+]+)/.exec(raw);
  if (rotate) t.rotation = finiteNumber(rotate[1], 0);
  const scale = /scale\(\s*([-\d.eE+]+)(?:[\s,]+([-\d.eE+]+))?\s*\)/.exec(raw);
  if (scale) {
    t.scaleX = finiteNumber(scale[1], 1);
    t.scaleY = scale[2] !== undefined ? finiteNumber(scale[2], t.scaleX) : t.scaleX;
  }
  return t;
}

const NODE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Safe as a `doc.nodes` key: short, URL-safe, and not a property of Object.prototype. */
export function isPreservableNodeId(id: string): boolean {
  return NODE_ID_PATTERN.test(id) && !(id in Object.prototype);
}

function collectPreservableIds(root: Element): Set<string> {
  const counts = new Map<string, number>();
  for (const el of [root, ...Array.from(root.querySelectorAll("[id]"))]) {
    const id = el.getAttribute("id");
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const out = new Set<string>();
  for (const [id, n] of counts) if (n === 1 && isPreservableNodeId(id)) out.add(id);
  return out;
}

function baseFromEl(el: Element, name: string, budget: IngestBudget) {
  const opacity = finiteNumber(el.getAttribute("opacity"), 1);
  const rawId = el.getAttribute("id") ?? "";
  const id = budget.preservedIds?.has(rawId) ? rawId : nanoid(10);
  return {
    id,
    name: el.getAttribute("data-name") || el.getAttribute("id") || name,
    visible: el.getAttribute("display") !== "none",
    locked: false,
    opacity,
    blendMode: "normal" as const,
    transform: parseTransform(el),
  };
}

/** `C … P0 Z` produces a duplicate of the first point carrying the closing handle. Fold it back. */
function foldClosingPoint(sp: PathSubpath) {
  if (sp.points.length < 3) return;
  const first = sp.points[0];
  const last = sp.points[sp.points.length - 1];
  if (!last.handleIn || last.handleOut) return;
  if (Math.abs(last.x - first.x) > 1e-9 || Math.abs(last.y - first.y) > 1e-9) return;
  first.handleIn = last.handleIn;
  sp.points.pop();
}

/** Path `d` parser: M/L/H/V/C/S/Q/T/A/Z (absolute & relative). Arcs become line segments. */
export function parsePathD(d: string): PathSubpath[] {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const subpaths: PathSubpath[] = [];
  let i = 0;
  let cmd = "";
  let cx = 0;
  let cy = 0;
  let current: PathSubpath | null = null;
  let lastCx1 = 0;
  let lastCy1 = 0;
  let lastQx = 0;
  let lastQy = 0;
  let haveCubic = false;
  let haveQuad = false;

  const num = () => Number(tokens[i++]);
  const pushPoint = (x: number, y: number, type: PathPoint["type"] = "corner") => {
    if (!current) {
      current = { closed: false, points: [] };
      subpaths.push(current);
    }
    current.points.push({ id: nanoid(8), x, y, type });
  };

  while (i < tokens.length) {
    const t = tokens[i];
    if (/[a-zA-Z]/.test(t)) {
      cmd = t;
      i++;
    }
    if (!cmd) break;

    switch (cmd) {
      case "M":
      case "m": {
        const rel = cmd === "m";
        const x = num();
        const y = num();
        cx = rel ? cx + x : x;
        cy = rel ? cy + y : y;
        current = { closed: false, points: [] };
        subpaths.push(current);
        pushPoint(cx, cy);
        haveCubic = false;
        haveQuad = false;
        cmd = rel ? "l" : "L";
        break;
      }
      case "L":
      case "l": {
        const rel = cmd === "l";
        const x = num();
        const y = num();
        cx = rel ? cx + x : x;
        cy = rel ? cy + y : y;
        pushPoint(cx, cy);
        haveCubic = false;
        haveQuad = false;
        break;
      }
      case "H":
      case "h": {
        const x = num();
        cx = cmd === "h" ? cx + x : x;
        pushPoint(cx, cy);
        haveCubic = false;
        haveQuad = false;
        break;
      }
      case "V":
      case "v": {
        const y = num();
        cy = cmd === "v" ? cy + y : y;
        pushPoint(cx, cy);
        haveCubic = false;
        haveQuad = false;
        break;
      }
      case "C":
      case "c": {
        const rel = cmd === "c";
        const x1 = num();
        const y1 = num();
        const x2 = num();
        const y2 = num();
        const x = num();
        const y = num();
        const absX1 = rel ? cx + x1 : x1;
        const absY1 = rel ? cy + y1 : y1;
        const absX2 = rel ? cx + x2 : x2;
        const absY2 = rel ? cy + y2 : y2;
        cx = rel ? cx + x : x;
        cy = rel ? cy + y : y;
        if (current && current.points.length) {
          const prev = current.points[current.points.length - 1];
          prev.handleOut = { x: absX1, y: absY1 };
          prev.type = "smooth";
        }
        if (!current) {
          current = { closed: false, points: [] };
          subpaths.push(current);
        }
        current.points.push({
          id: nanoid(8),
          x: cx,
          y: cy,
          handleIn: { x: absX2, y: absY2 },
          type: "smooth",
        });
        lastCx1 = absX2;
        lastCy1 = absY2;
        haveCubic = true;
        haveQuad = false;
        break;
      }
      case "S":
      case "s": {
        const rel = cmd === "s";
        const x2 = num();
        const y2 = num();
        const x = num();
        const y = num();
        const absX2 = rel ? cx + x2 : x2;
        const absY2 = rel ? cy + y2 : y2;
        const absX1 = haveCubic ? 2 * cx - lastCx1 : cx;
        const absY1 = haveCubic ? 2 * cy - lastCy1 : cy;
        if (current && current.points.length) {
          const prev = current.points[current.points.length - 1];
          prev.handleOut = { x: absX1, y: absY1 };
          prev.type = "smooth";
        }
        cx = rel ? cx + x : x;
        cy = rel ? cy + y : y;
        if (!current) {
          current = { closed: false, points: [] };
          subpaths.push(current);
        }
        current.points.push({
          id: nanoid(8),
          x: cx,
          y: cy,
          handleIn: { x: absX2, y: absY2 },
          type: "smooth",
        });
        lastCx1 = absX2;
        lastCy1 = absY2;
        haveCubic = true;
        haveQuad = false;
        break;
      }
      case "Q":
      case "q": {
        const rel = cmd === "q";
        const x1 = num();
        const y1 = num();
        const x = num();
        const y = num();
        const qx = rel ? cx + x1 : x1;
        const qy = rel ? cy + y1 : y1;
        const px = current?.points.length
          ? current.points[current.points.length - 1].x
          : cx;
        const py = current?.points.length
          ? current.points[current.points.length - 1].y
          : cy;
        const c1 = { x: px + (2 / 3) * (qx - px), y: py + (2 / 3) * (qy - py) };
        cx = rel ? cx + x : x;
        cy = rel ? cy + y : y;
        const c2 = { x: cx + (2 / 3) * (qx - cx), y: cy + (2 / 3) * (qy - cy) };
        if (current && current.points.length) {
          const prev = current.points[current.points.length - 1];
          prev.handleOut = c1;
          prev.type = "smooth";
        }
        if (!current) {
          current = { closed: false, points: [] };
          subpaths.push(current);
        }
        current.points.push({
          id: nanoid(8),
          x: cx,
          y: cy,
          handleIn: c2,
          type: "smooth",
        });
        lastQx = qx;
        lastQy = qy;
        haveQuad = true;
        haveCubic = false;
        break;
      }
      case "T":
      case "t": {
        const rel = cmd === "t";
        const x = num();
        const y = num();
        const qx = haveQuad ? 2 * cx - lastQx : cx;
        const qy = haveQuad ? 2 * cy - lastQy : cy;
        const px = current?.points.length
          ? current.points[current.points.length - 1].x
          : cx;
        const py = current?.points.length
          ? current.points[current.points.length - 1].y
          : cy;
        const c1 = { x: px + (2 / 3) * (qx - px), y: py + (2 / 3) * (qy - py) };
        cx = rel ? cx + x : x;
        cy = rel ? cy + y : y;
        const c2 = { x: cx + (2 / 3) * (qx - cx), y: cy + (2 / 3) * (qy - cy) };
        if (current && current.points.length) {
          const prev = current.points[current.points.length - 1];
          prev.handleOut = c1;
        }
        if (!current) {
          current = { closed: false, points: [] };
          subpaths.push(current);
        }
        current.points.push({
          id: nanoid(8),
          x: cx,
          y: cy,
          handleIn: c2,
          type: "smooth",
        });
        lastQx = qx;
        lastQy = qy;
        haveQuad = true;
        haveCubic = false;
        break;
      }
      case "A":
      case "a": {
        num();
        num();
        num();
        num();
        num();
        const x = num();
        const y = num();
        cx = cmd === "a" ? cx + x : x;
        cy = cmd === "a" ? cy + y : y;
        pushPoint(cx, cy);
        haveCubic = false;
        haveQuad = false;
        break;
      }
      case "Z":
      case "z": {
        if (current) {
          current.closed = true;
          foldClosingPoint(current);
        }
        haveCubic = false;
        haveQuad = false;
        cmd = "";
        break;
      }
      default: {
        // Skip unsupported command args conservatively
        while (i < tokens.length && !/[a-zA-Z]/.test(tokens[i])) i++;
        cmd = "";
      }
    }
  }
  return subpaths;
}

function carriedNode(
  el: Element,
  tag: string,
  budget: IngestBudget,
): ImageNode | SymbolInstanceNode | null {
  if (!budget.context || !budget.preservedIds) return null;
  if (tag !== "image" && tag !== "use") return null;
  const id = el.getAttribute("id") ?? "";
  if (!budget.preservedIds.has(id)) return null;
  const known = budget.context.nodes[id];
  if (!known) return null;
  if (tag === "image" && known.type === "image") return known;
  if (tag === "use" && known.type === "symbolInstance") return known;
  return null;
}

function ingestElement(
  el: Element,
  doc: SvgDocument,
  parentChildren: NodeId[],
  budget: IngestBudget,
  depth: number,
): void {
  if (depth > SAVAGE_LIMITS.graphDepth) {
    throw new Error(`SVG exceeds the ${SAVAGE_LIMITS.graphDepth}-level depth limit`);
  }
  const tag = (el.localName || el.tagName).toLowerCase();
  const carried = carriedNode(el, tag, budget);
  if (carried) {
    claimNode(budget);
    const node = {
      ...structuredClone(carried),
      ...baseFromEl(el, carried.name, budget),
      width: finiteNumber(el.getAttribute("width"), carried.width),
      height: finiteNumber(el.getAttribute("height"), carried.height),
    } as SceneNode;
    doc.nodes[node.id] = node;
    parentChildren.push(node.id);
    return;
  }
  if (SKIP_TAGS.has(tag) || el.hasAttribute("data-artboard")) return;
  if (tag === "svg") {
    for (const child of Array.from(el.children)) {
      ingestElement(child, doc, parentChildren, budget, depth + 1);
    }
    return;
  }

  let node: SceneNode | null = null;

  if (tag === "g") {
    const children: NodeId[] = [];
    node = {
      ...baseFromEl(el, "Group", budget),
      type: "group",
      children,
    };
    claimNode(budget);
    doc.nodes[node.id] = node;
    parentChildren.push(node.id);
    for (const child of Array.from(el.children)) {
      ingestElement(child, doc, children, budget, depth + 1);
    }
    return;
  }

  if (tag === "path") {
    const subpaths = parsePathD(el.getAttribute("d") || "");
    claimPathPoints(budget, subpaths.reduce((sum, subpath) => sum + subpath.points.length, 0));
    node = {
      ...baseFromEl(el, "Path", budget),
      type: "path",
      subpaths,
      fill: resolvePaint(el, "fill", budget.servers),
      stroke: parseStroke(el, budget.servers),
      fillRule: el.getAttribute("fill-rule") === "evenodd" ? "evenodd" : "nonzero",
    };
  } else if (tag === "rect") {
    const x = finiteNumber(el.getAttribute("x"), 0);
    const y = finiteNumber(el.getAttribute("y"), 0);
    const t = parseTransform(el);
    t.x += x;
    t.y += y;
    node = {
      ...baseFromEl(el, "Rectangle", budget),
      transform: t,
      type: "rect",
      width: finiteNumber(el.getAttribute("width"), 0),
      height: finiteNumber(el.getAttribute("height"), 0),
      rx: finiteNumber(el.getAttribute("rx"), 0),
      ry: finiteNumber(el.getAttribute("ry"), 0),
      fill: resolvePaint(el, "fill", budget.servers),
      stroke: parseStroke(el, budget.servers),
    };
  } else if (tag === "ellipse" || tag === "circle") {
    const cx = finiteNumber(el.getAttribute("cx"), 0);
    const cy = finiteNumber(el.getAttribute("cy"), 0);
    const t = parseTransform(el);
    t.x += cx;
    t.y += cy;
    const r = finiteNumber(el.getAttribute("r"), 0);
    node = {
      ...baseFromEl(el, tag === "circle" ? "Circle" : "Ellipse", budget),
      transform: t,
      type: "ellipse",
      rx: tag === "circle" ? r : finiteNumber(el.getAttribute("rx"), 0),
      ry: tag === "circle" ? r : finiteNumber(el.getAttribute("ry"), 0),
      fill: resolvePaint(el, "fill", budget.servers),
      stroke: parseStroke(el, budget.servers),
    };
  } else if (tag === "line") {
    const x1 = finiteNumber(el.getAttribute("x1"), 0);
    const y1 = finiteNumber(el.getAttribute("y1"), 0);
    const t = parseTransform(el);
    t.x += x1;
    t.y += y1;
    node = {
      ...baseFromEl(el, "Line", budget),
      transform: t,
      type: "line",
      x2: finiteNumber(el.getAttribute("x2"), 0) - x1,
      y2: finiteNumber(el.getAttribute("y2"), 0) - y1,
      stroke: parseStroke(el, budget.servers),
    };
  } else if (tag === "polygon" || tag === "polyline") {
    const pts = (el.getAttribute("points") || "")
      .trim()
      .split(/[\s,]+/)
      .map(Number)
      .filter((n) => Number.isFinite(n));
    const pairCount = Math.floor(pts.length / 2);
    claimPathPoints(budget, pairCount);
    const points: PathPoint[] = [];
    for (let i = 0; i + 1 < pts.length; i += 2) {
      points.push({ id: nanoid(8), x: pts[i], y: pts[i + 1], type: "corner" });
    }
    node = {
      ...baseFromEl(el, tag === "polygon" ? "Polygon" : "Polyline", budget),
      type: "path",
      subpaths: [{ closed: tag === "polygon", points }],
      fill: resolvePaint(el, "fill", budget.servers),
      stroke: parseStroke(el, budget.servers),
      fillRule: "nonzero",
    };
  } else if (tag === "text") {
    const content = el.textContent || "";
    if (content.length > MAX_TEXT_CHARS) {
      throw new Error(`SVG text exceeds the ${MAX_TEXT_CHARS}-character limit`);
    }
    node = {
      ...baseFromEl(el, "Text", budget),
      type: "text",
      content,
      fontFamily: el.getAttribute("font-family") || "DM Sans Variable",
      fontSize: finiteNumber(el.getAttribute("font-size"), 24),
      fontWeight: finiteNumber(el.getAttribute("font-weight"), 400),
      letterSpacing: finiteNumber(el.getAttribute("letter-spacing"), 0),
      lineHeight: 1.2,
      fill: resolvePaint(el, "fill", budget.servers),
      stroke: parseStroke(el, budget.servers),
    };
  }

  if (node) {
    claimNode(budget);
    doc.nodes[node.id] = node;
    parentChildren.push(node.id);
    return;
  }

  for (const child of Array.from(el.children)) {
    ingestElement(child, doc, parentChildren, budget, depth + 1);
  }
}

const INGESTED_TAGS = new Set(["svg", "g", "path", "rect", "circle", "ellipse", "line", "polygon", "polyline", "text"]);
/** Defs the serializer itself emits or that are harmless to drop. Not recursed into. */
const OPAQUE_HARMLESS_TAGS = new Set([
  "lineargradient", "radialgradient", "meshgradient", "symbol", "filter", "clippath",
  "title", "desc", "metadata",
]);
const UNSUPPORTED_ATTRS = ["filter", "clip-path", "mask"] as const;

function collectUnsupported(root: Element, report: DropReport, budget: IngestBudget) {
  const bump = (key: string) => report.dropped.set(key, (report.dropped.get(key) ?? 0) + 1);
  const walk = (el: Element) => {
    const tag = (el.localName || el.tagName).toLowerCase();
    if (el.hasAttribute("data-artboard")) return;
    if (carriedNode(el, tag, budget)) return;
    if (OPAQUE_HARMLESS_TAGS.has(tag)) return;
    if (tag === "defs") {
      for (const child of Array.from(el.children)) walk(child);
      return;
    }
    if (!INGESTED_TAGS.has(tag)) {
      bump(`<${tag}>`);
      return;
    }
    const id = el.getAttribute("id") ?? "";
    const keptFromCanvas = !!budget.context && !!budget.preservedIds?.has(id) && !!budget.context.nodes[id];
    if (!keptFromCanvas) {
      for (const attr of UNSUPPORTED_ATTRS) if (el.hasAttribute(attr)) bump(`${attr} attribute`);
    }
    if (tag === "text") return; // tspans are folded into textContent
    for (const child of Array.from(el.children)) walk(child);
  };
  walk(root);
}

export function svgStringToDocument(
  svg: string,
  name = "Converted",
  options: SvgImportOptions = {},
): SvgDocument {
  rejectHostileSvgSource(svg);
  const parser = new DOMParser();
  const xml = parser.parseFromString(svg, "image/svg+xml");
  const root = xml.documentElement;
  const local = (root?.localName || root?.tagName || "").toLowerCase();
  const errorEl = !root ? null : local === "parsererror" ? root : xml.querySelector("parsererror");
  if (!root || errorEl || local !== "svg") {
    const info = describeParserError(errorEl?.textContent ?? "");
    throw new SvgParseError(
      info.message ? `Invalid SVG: ${info.message}` : "Invalid SVG",
      info.line,
      info.column,
    );
  }

  const width = finiteNumber(root.getAttribute("width"), 0);
  const height = finiteNumber(root.getAttribute("height"), 0);
  const vb = (root.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
  const viewBox =
    vb.length === 4 && vb.every(Number.isFinite)
      ? { x: vb[0], y: vb[1], w: vb[2], h: vb[3] }
      : { x: 0, y: 0, w: width || 800, h: height || 600 };

  const doc = createEmptyDocument(width || viewBox.w, height || viewBox.h, name);
  doc.viewBox = viewBox;
  if (doc.artboards[0]) {
    doc.artboards[0].x = viewBox.x;
    doc.artboards[0].y = viewBox.y;
    doc.artboards[0].width = viewBox.w;
    doc.artboards[0].height = viewBox.h;
  }
  const usePreserved = !!options.preserveIds || !!options.context;
  const budget: IngestBudget = {
    servers: collectPaintServers(root),
    nodes: 0,
    pathPoints: 0,
    preservedIds: usePreserved ? collectPreservableIds(root) : null,
    context: options.context ?? null,
  };
  if (options.context) doc.symbols = structuredClone(options.context.symbols);
  if (options.report) collectUnsupported(root, options.report, budget);
  ingestElement(root, doc, doc.rootChildIds, budget, 1);
  return validateSavageDocument(doc);
}
