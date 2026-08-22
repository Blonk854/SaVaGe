import { nanoid } from "nanoid";
import { createEmptyDocument } from "./emptyDocument";
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

function parseStroke(el: Element, servers: PaintServerMap): StrokeStyle {
  const stroke = defaultStroke();
  stroke.paint = resolvePaint(el, "stroke", servers);
  const w = el.getAttribute("stroke-width");
  if (w) stroke.width = Number(w) || 1;
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
  const translate = /translate\(\s*([-\d.]+)[\s,]+([-\d.]+)\s*\)/.exec(raw);
  if (translate) {
    t.x = Number(translate[1]);
    t.y = Number(translate[2]);
  }
  const rotate = /rotate\(\s*([-\d.]+)/.exec(raw);
  if (rotate) t.rotation = Number(rotate[1]);
  const scale = /scale\(\s*([-\d.]+)(?:[\s,]+([-\d.]+))?\s*\)/.exec(raw);
  if (scale) {
    t.scaleX = Number(scale[1]);
    t.scaleY = scale[2] !== undefined ? Number(scale[2]) : t.scaleX;
  }
  return t;
}

function baseFromEl(el: Element, name: string, id?: string) {
  return {
    id: id ?? nanoid(10),
    name: el.getAttribute("data-name") || name,
    visible: el.getAttribute("display") !== "none",
    locked: false,
    opacity: Number(el.getAttribute("opacity") ?? "1") || 1,
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
  servers: PaintServerMap,
): void {
  const tag = (el.localName || el.tagName).toLowerCase();
  if (SKIP_TAGS.has(tag) || el.hasAttribute("data-artboard")) return;
  if (tag === "svg") {
    for (const child of Array.from(el.children)) {
      ingestElement(child, doc, parentChildren, servers);
    }
    return;
  }

  let node: SceneNode | null = null;

  if (tag === "g") {
    const id = el.getAttribute("id") || nanoid(10);
    const children: NodeId[] = [];
    node = {
      ...baseFromEl(el, "Group", id),
      type: "group",
      children,
    };
    doc.nodes[id] = node;
    parentChildren.push(id);
    for (const child of Array.from(el.children)) {
      ingestElement(child, doc, children, servers);
    }
    return;
  }

  if (tag === "path") {
    const id = el.getAttribute("id") || nanoid(10);
    node = {
      ...baseFromEl(el, "Path", id),
      type: "path",
      subpaths: parsePathD(el.getAttribute("d") || ""),
      fill: resolvePaint(el, "fill", servers),
      stroke: parseStroke(el, servers),
      fillRule: el.getAttribute("fill-rule") === "evenodd" ? "evenodd" : "nonzero",
    };
  } else if (tag === "rect") {
    const id = el.getAttribute("id") || nanoid(10);
    const x = Number(el.getAttribute("x") ?? 0);
    const y = Number(el.getAttribute("y") ?? 0);
    const t = parseTransform(el);
    t.x += x;
    t.y += y;
    node = {
      ...baseFromEl(el, "Rectangle", id),
      transform: t,
      type: "rect",
      width: Number(el.getAttribute("width") ?? 0),
      height: Number(el.getAttribute("height") ?? 0),
      rx: Number(el.getAttribute("rx") ?? 0),
      ry: Number(el.getAttribute("ry") ?? 0),
      fill: resolvePaint(el, "fill", servers),
      stroke: parseStroke(el, servers),
    };
  } else if (tag === "ellipse" || tag === "circle") {
    const id = el.getAttribute("id") || nanoid(10);
    const cx = Number(el.getAttribute("cx") ?? 0);
    const cy = Number(el.getAttribute("cy") ?? 0);
    const t = parseTransform(el);
    t.x += cx;
    t.y += cy;
    const r = Number(el.getAttribute("r") ?? 0);
    node = {
      ...baseFromEl(el, tag === "circle" ? "Circle" : "Ellipse", id),
      transform: t,
      type: "ellipse",
      rx: tag === "circle" ? r : Number(el.getAttribute("rx") ?? 0),
      ry: tag === "circle" ? r : Number(el.getAttribute("ry") ?? 0),
      fill: resolvePaint(el, "fill", servers),
      stroke: parseStroke(el, servers),
    };
  } else if (tag === "line") {
    const id = el.getAttribute("id") || nanoid(10);
    const x1 = Number(el.getAttribute("x1") ?? 0);
    const y1 = Number(el.getAttribute("y1") ?? 0);
    const t = parseTransform(el);
    t.x += x1;
    t.y += y1;
    node = {
      ...baseFromEl(el, "Line", id),
      transform: t,
      type: "line",
      x2: Number(el.getAttribute("x2") ?? 0) - x1,
      y2: Number(el.getAttribute("y2") ?? 0) - y1,
      stroke: parseStroke(el, servers),
    };
  } else if (tag === "polygon" || tag === "polyline") {
    const id = el.getAttribute("id") || nanoid(10);
    const pts = (el.getAttribute("points") || "")
      .trim()
      .split(/[\s,]+/)
      .map(Number)
      .filter((n) => Number.isFinite(n));
    const points: PathPoint[] = [];
    for (let i = 0; i + 1 < pts.length; i += 2) {
      points.push({ id: nanoid(8), x: pts[i], y: pts[i + 1], type: "corner" });
    }
    node = {
      ...baseFromEl(el, tag === "polygon" ? "Polygon" : "Polyline", id),
      type: "path",
      subpaths: [{ closed: tag === "polygon", points }],
      fill: resolvePaint(el, "fill", servers),
      stroke: parseStroke(el, servers),
      fillRule: "nonzero",
    };
  } else if (tag === "text") {
    const id = el.getAttribute("id") || nanoid(10);
    node = {
      ...baseFromEl(el, "Text", id),
      type: "text",
      content: el.textContent || "",
      fontFamily: el.getAttribute("font-family") || "DM Sans Variable",
      fontSize: Number(el.getAttribute("font-size") ?? 24),
      fontWeight: Number(el.getAttribute("font-weight") ?? 400),
      letterSpacing: Number(el.getAttribute("letter-spacing") ?? 0),
      lineHeight: 1.2,
      fill: resolvePaint(el, "fill", servers),
      stroke: parseStroke(el, servers),
    };
  }

  if (node) {
    doc.nodes[node.id] = node;
    parentChildren.push(node.id);
  } else {
    for (const child of Array.from(el.children)) {
      ingestElement(child, doc, parentChildren, servers);
    }
  }
}

export function svgStringToDocument(svg: string, name = "Converted"): SvgDocument {
  const parser = new DOMParser();
  const xml = parser.parseFromString(svg, "image/svg+xml");
  const root = xml.documentElement;
  if (!root || root.tagName.toLowerCase() === "parsererror") {
    throw new Error("Invalid SVG");
  }

  const width = Number(root.getAttribute("width")?.replace("px", "")) || 0;
  const height = Number(root.getAttribute("height")?.replace("px", "")) || 0;
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
  const servers = collectPaintServers(root);
  ingestElement(root, doc, doc.rootChildIds, servers);
  return doc;
}
