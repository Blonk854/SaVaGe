import type {
  GradientStop,
  LinearGradientPaint,
  Paint,
  RadialGradientPaint,
} from "./types";
import { solidFill } from "./types";
import { parseMeshGradientElement } from "./meshSvg";

export type PaintServerMap = Map<string, PaintServer>;

export type PaintServer =
  | { type: "linear"; units: GradientUnits; paint: LinearGradientPaint }
  | { type: "radial"; units: GradientUnits; paint: RadialGradientPaint }
  | { type: "mesh"; paint: Paint };

type GradientUnits = "userSpaceOnUse" | "objectBoundingBox";

function localName(el: Element): string {
  return (el.localName || el.tagName).toLowerCase();
}

function attrOrStyle(el: Element, name: string): string | null {
  const direct = el.getAttribute(name);
  if (direct && direct.trim()) return direct.trim();
  const style = el.getAttribute("style");
  if (!style) return null;
  const m = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, "i").exec(style);
  return m ? m[1].trim() : null;
}

export function parseUrlRef(raw: string): string | null {
  const m = /url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/i.exec(raw);
  return m ? m[1] : null;
}

function leftoverColor(raw: string): string | null {
  const rest = raw.replace(/url\(\s*['"]?#[^'")\s]+['"]?\s*\)/i, "").trim();
  if (!rest || rest === "none") return null;
  return rest;
}

function parseCoord(raw: string | null, fallback: number): number {
  if (raw == null || raw === "") return fallback;
  const t = raw.trim();
  if (t.endsWith("%")) {
    const n = Number(t.slice(0, -1));
    return Number.isFinite(n) ? n / 100 : fallback;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : fallback;
}

function parseStop(el: Element): GradientStop {
  const offset = parseCoord(el.getAttribute("offset"), 0);
  const color = el.getAttribute("stop-color") || attrOrStyle(el, "stop-color") || "#000000";
  const opacityRaw = el.getAttribute("stop-opacity") ?? attrOrStyle(el, "stop-opacity");
  const opacity = opacityRaw != null ? Number(opacityRaw) : 1;
  return {
    offset: Number.isFinite(offset) ? offset : 0,
    color,
    opacity: Number.isFinite(opacity) ? opacity : 1,
  };
}

function gradientHref(el: Element): string | null {
  const href =
    el.getAttribute("href") ||
    el.getAttribute("xlink:href") ||
    el.getAttributeNS("http://www.w3.org/1999/xlink", "href");
  if (!href) return null;
  return href.startsWith("#") ? href.slice(1) : href;
}

function unitsOf(el: Element): GradientUnits {
  return el.getAttribute("gradientUnits") === "userSpaceOnUse"
    ? "userSpaceOnUse"
    : "objectBoundingBox";
}

function collectStops(
  el: Element,
  byId: Map<string, Element>,
  visiting: Set<string>,
): GradientStop[] {
  const own = Array.from(el.children)
    .filter((c) => localName(c) === "stop")
    .map(parseStop);
  if (own.length) return own;
  const href = gradientHref(el);
  if (!href || visiting.has(href)) return [];
  const ref = byId.get(href);
  if (!ref) return [];
  visiting.add(href);
  return collectStops(ref, byId, visiting);
}

function parseLinear(el: Element, byId: Map<string, Element>): PaintServer {
  const stops = collectStops(el, byId, new Set());
  return {
    type: "linear",
    units: unitsOf(el),
    paint: {
      type: "linear",
      x1: parseCoord(el.getAttribute("x1"), 0),
      y1: parseCoord(el.getAttribute("y1"), 0),
      x2: parseCoord(el.getAttribute("x2"), 1),
      y2: parseCoord(el.getAttribute("y2"), 0),
      stops: stops.length
        ? stops
        : [
            { offset: 0, color: "#000000", opacity: 1 },
            { offset: 1, color: "#ffffff", opacity: 1 },
          ],
    },
  };
}

function parseRadial(el: Element, byId: Map<string, Element>): PaintServer {
  const stops = collectStops(el, byId, new Set());
  const cx = parseCoord(el.getAttribute("cx"), 0.5);
  const cy = parseCoord(el.getAttribute("cy"), 0.5);
  return {
    type: "radial",
    units: unitsOf(el),
    paint: {
      type: "radial",
      cx,
      cy,
      r: parseCoord(el.getAttribute("r"), 0.5),
      fx: el.hasAttribute("fx") ? parseCoord(el.getAttribute("fx"), cx) : undefined,
      fy: el.hasAttribute("fy") ? parseCoord(el.getAttribute("fy"), cy) : undefined,
      stops: stops.length
        ? stops
        : [
            { offset: 0, color: "#000000", opacity: 1 },
            { offset: 1, color: "#ffffff", opacity: 1 },
          ],
    },
  };
}

export function collectPaintServers(root: Element): PaintServerMap {
  const byId = new Map<string, Element>();
  const walk = (el: Element) => {
    const id = el.getAttribute("id");
    const tag = localName(el);
    if (
      id &&
      (tag === "lineargradient" || tag === "radialgradient" || tag === "meshgradient")
    ) {
      byId.set(id, el);
    }
    for (const child of Array.from(el.children)) walk(child);
  };
  walk(root);

  const out: PaintServerMap = new Map();
  for (const [id, el] of byId) {
    const tag = localName(el);
    if (tag === "lineargradient") out.set(id, parseLinear(el, byId));
    else if (tag === "radialgradient") out.set(id, parseRadial(el, byId));
    else if (tag === "meshgradient") {
      const mesh = parseMeshGradientElement(el);
      if (mesh) out.set(id, { type: "mesh", paint: mesh });
    }
  }
  return out;
}

function localSize(el: Element): { w: number; h: number } {
  const tag = localName(el);
  if (tag === "rect") {
    return {
      w: Math.max(1e-6, Number(el.getAttribute("width") ?? 0) || 0),
      h: Math.max(1e-6, Number(el.getAttribute("height") ?? 0) || 0),
    };
  }
  if (tag === "ellipse") {
    return {
      w: Math.max(1e-6, 2 * (Number(el.getAttribute("rx") ?? 0) || 0)),
      h: Math.max(1e-6, 2 * (Number(el.getAttribute("ry") ?? 0) || 0)),
    };
  }
  if (tag === "circle") {
    const d = 2 * (Number(el.getAttribute("r") ?? 0) || 0);
    return { w: Math.max(1e-6, d), h: Math.max(1e-6, d) };
  }
  if (tag === "line") {
    const x1 = Number(el.getAttribute("x1") ?? 0);
    const y1 = Number(el.getAttribute("y1") ?? 0);
    const x2 = Number(el.getAttribute("x2") ?? 0);
    const y2 = Number(el.getAttribute("y2") ?? 0);
    return { w: Math.max(1e-6, Math.abs(x2 - x1)), h: Math.max(1e-6, Math.abs(y2 - y1)) };
  }
  if (tag === "path") {
    const nums =
      (el.getAttribute("d") || "")
        .match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)
        ?.map(Number)
        .filter((n) => Number.isFinite(n)) ?? [];
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (let i = 0; i + 1 < nums.length; i += 2) {
      minX = Math.min(minX, nums[i]);
      maxX = Math.max(maxX, nums[i]);
      minY = Math.min(minY, nums[i + 1]);
      maxY = Math.max(maxY, nums[i + 1]);
    }
    if (!Number.isFinite(minX)) return { w: 1, h: 1 };
    return { w: Math.max(1e-6, maxX - minX), h: Math.max(1e-6, maxY - minY) };
  }
  return { w: 1, h: 1 };
}

function mapToLocal(server: PaintServer, el: Element): Paint {
  if (server.type === "mesh") return structuredClone(server.paint);
  if (server.units === "userSpaceOnUse") return structuredClone(server.paint);
  const { w, h } = localSize(el);
  if (server.type === "linear") {
    const g = server.paint;
    return {
      type: "linear",
      x1: g.x1 * w,
      y1: g.y1 * h,
      x2: g.x2 * w,
      y2: g.y2 * h,
      stops: g.stops.map((s) => ({ ...s })),
    };
  }
  const g = server.paint;
  return {
    type: "radial",
    cx: g.cx * w,
    cy: g.cy * h,
    r: g.r * Math.max(w, h),
    fx: g.fx != null ? g.fx * w : undefined,
    fy: g.fy != null ? g.fy * h : undefined,
    stops: g.stops.map((s) => ({ ...s })),
  };
}

export function resolvePaint(
  el: Element,
  attr: "fill" | "stroke",
  servers: PaintServerMap,
): Paint {
  const raw = attrOrStyle(el, attr);
  if (!raw || raw === "none") return { type: "none" };
  const opacityAttr = attrOrStyle(el, `${attr}-opacity`);
  const opacity = opacityAttr ? Number(opacityAttr) : 1;
  const urlId = parseUrlRef(raw);
  if (urlId) {
    const server = servers.get(urlId);
    if (server) return mapToLocal(server, el);
    const fallback = leftoverColor(raw);
    if (fallback) return solidFill(fallback, Number.isFinite(opacity) ? opacity : 1);
    return { type: "none" };
  }
  return solidFill(raw, Number.isFinite(opacity) ? opacity : 1);
}

export const SKIP_TAGS = new Set([
  "defs",
  "lineargradient",
  "radialgradient",
  "meshgradient",
  "pattern",
  "clippath",
  "filter",
  "symbol",
  "style",
  "title",
  "desc",
  "metadata",
  "script",
  "foreignobject",
  "animate",
  "animatetransform",
  "animatemotion",
  "set",
  "iframe",
  "object",
  "embed",
  "video",
  "audio",
  "canvas",
  "handler",
  "listener",
  "use",
  "image",
]);
