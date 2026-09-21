import { nanoid } from "nanoid";
import { createEmptyDocument } from "./emptyDocument";
import { SAVAGE_LIMITS, validateSavageDocument } from "./parseSavage";
import {
  defaultStroke,
  defaultTransform,
  type NodeId,
  type PathPoint,
  type PathSubpath,
  type SceneNode,
  type SvgDocument,
  type StrokeStyle,
} from "./types";
import {
  collectPaintServers,
  resolvePaint,
  SKIP_TAGS,
  type PaintServerMap,
} from "./svgPaints";

const MAX_TEXT_CHARS = 32 * 1024;

interface IngestBudget {
  servers: PaintServerMap;
  nodes: number;
  pathPoints: number;
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

function baseFromEl(el: Element, name: string) {
  const opacity = finiteNumber(el.getAttribute("opacity"), 1);
  return {
    id: nanoid(10),
    name: el.getAttribute("data-name") || el.getAttribute("id") || name,
    visible: el.getAttribute("display") !== "none",
    locked: false,
    opacity,
    blendMode: "normal" as const,
    transform: parseTransform(el),
  };
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
        if (current) current.closed = true;
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
      ...baseFromEl(el, "Group"),
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
      ...baseFromEl(el, "Path"),
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
      ...baseFromEl(el, "Rectangle"),
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
      ...baseFromEl(el, tag === "circle" ? "Circle" : "Ellipse"),
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
      ...baseFromEl(el, "Line"),
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
    const points: PathPoint[] = [];
    for (let i = 0; i + 1 < pts.length; i += 2) {
      points.push({ id: nanoid(8), x: pts[i], y: pts[i + 1], type: "corner" });
    }
    claimPathPoints(budget, points.length);
    node = {
      ...baseFromEl(el, tag === "polygon" ? "Polygon" : "Polyline"),
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
      ...baseFromEl(el, "Text"),
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

export function svgStringToDocument(svg: string, name = "Converted"): SvgDocument {
  rejectHostileSvgSource(svg);
  const parser = new DOMParser();
  const xml = parser.parseFromString(svg, "image/svg+xml");
  const root = xml.documentElement;
  const local = (root?.localName || root?.tagName || "").toLowerCase();
  if (!root || local === "parsererror" || local !== "svg" || xml.querySelector("parsererror")) {
    throw new Error("Invalid SVG");
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
  const budget: IngestBudget = {
    servers: collectPaintServers(root),
    nodes: 0,
    pathPoints: 0,
  };
  ingestElement(root, doc, doc.rootChildIds, budget, 1);
  return validateSavageDocument(doc);
}
