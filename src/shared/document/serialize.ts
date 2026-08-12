import type {
  EllipseNode,
  GroupNode,
  LineNode,
  NodeEffects,
  Paint,
  PathNode,
  PathSubpath,
  RectNode,
  SceneNode,
  StrokeStyle,
  SvgDocument,
  SymbolInstanceNode,
  TextNode,
  Transform2D,
} from "./types";

class DefsBuilder {
  private grads: string[] = [];
  private filters: string[] = [];
  private clips: string[] = [];
  private symbols: string[] = [];
  private n = 0;
  private symbolIds = new Set<string>();

  paintAttr(paint: Paint, attr: "fill" | "stroke"): string {
    if (paint.type === "none") return `${attr}="none"`;
    if (paint.type === "solid") {
      const opacity =
        paint.opacity < 1 ? ` ${attr}-opacity="${paint.opacity}"` : "";
      return `${attr}="${paint.color}"${opacity}`;
    }
    if (paint.type === "mesh") {
      const id = `m${this.n++}`;
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const p of paint.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      const cells: string[] = [];
      for (let row = 0; row < paint.rows; row++) {
        for (let col = 0; col < paint.columns; col++) {
          const i = (r: number, c: number) => paint.points[r * (paint.columns + 1) + c];
          const p00 = i(row, col);
          const p10 = i(row, col + 1);
          const p01 = i(row + 1, col);
          const p11 = i(row + 1, col + 1);
          cells.push(
            `<polygon points="${p00.x - minX},${p00.y - minY} ${p10.x - minX},${p10.y - minY} ${p11.x - minX},${p11.y - minY} ${p01.x - minX},${p01.y - minY}" fill="${p00.color}" fill-opacity="${(p00.opacity + p10.opacity + p01.opacity + p11.opacity) / 4}" />`,
          );
        }
      }
      this.grads.push(
        `<pattern id="${id}" patternUnits="userSpaceOnUse" x="${minX}" y="${minY}" width="${Math.max(1, maxX - minX)}" height="${Math.max(1, maxY - minY)}">${cells.join("")}</pattern>`,
      );
      return `${attr}="url(#${id})"`;
    }
    const id = `g${this.n++}`;
    if (paint.type === "linear") {
      const stops = paint.stops
        .map(
          (s) =>
            `<stop offset="${s.offset}" stop-color="${s.color}" stop-opacity="${s.opacity}" />`,
        )
        .join("");
      this.grads.push(
        `<linearGradient id="${id}" x1="${paint.x1}" y1="${paint.y1}" x2="${paint.x2}" y2="${paint.y2}" gradientUnits="userSpaceOnUse">${stops}</linearGradient>`,
      );
    } else {
      const fx = paint.fx ?? paint.cx;
      const fy = paint.fy ?? paint.cy;
      const stops = paint.stops
        .map(
          (s) =>
            `<stop offset="${s.offset}" stop-color="${s.color}" stop-opacity="${s.opacity}" />`,
        )
        .join("");
      this.grads.push(
        `<radialGradient id="${id}" cx="${paint.cx}" cy="${paint.cy}" r="${paint.r}" fx="${fx}" fy="${fy}" gradientUnits="userSpaceOnUse">${stops}</radialGradient>`,
      );
    }
    return `${attr}="url(#${id})"`;
  }

  filterAttr(effects?: NodeEffects): string {
    if (!effects) return "";
    const shadowOn = effects.shadow?.enabled;
    const blurOn = effects.blur > 0;
    if (!shadowOn && !blurOn) return "";
    const id = `f${this.n++}`;
    const parts: string[] = [];
    if (shadowOn) {
      const s = effects.shadow;
      parts.push(
        `<feDropShadow dx="${s.x}" dy="${s.y}" stdDeviation="${s.blur / 2}" flood-color="${s.color}" flood-opacity="${s.opacity}" />`,
      );
    }
    if (blurOn) {
      parts.push(`<feGaussianBlur stdDeviation="${effects.blur}" />`);
    }
    this.filters.push(`<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">${parts.join("")}</filter>`);
    return ` filter="url(#${id})"`;
  }

  clipAttr(doc: SvgDocument, node: SceneNode): string {
    if (!node.clipPathId) return "";
    const mask = doc.nodes[node.clipPathId];
    if (!mask) return "";
    const id = `c${this.n++}`;
    let inner = "";
    if (mask.type === "path") {
      inner = `<path d="${subpathsToD(mask.subpaths)}" ${transformAttr(mask.transform)} />`;
    } else if (mask.type === "rect") {
      inner = `<rect width="${mask.width}" height="${mask.height}" ${transformAttr(mask.transform)} />`;
    } else if (mask.type === "ellipse") {
      inner = `<ellipse cx="0" cy="0" rx="${mask.rx}" ry="${mask.ry}" ${transformAttr(mask.transform)} />`;
    } else {
      return "";
    }
    this.clips.push(`<clipPath id="${id}">${inner}</clipPath>`);
    return ` clip-path="url(#${id})"`;
  }

  ensureSymbol(doc: SvgDocument, symbolId: string) {
    if (this.symbolIds.has(symbolId)) return;
    const symbol = doc.symbols?.[symbolId];
    if (!symbol) return;
    this.symbolIds.add(symbolId);
    const body = symbol.rootChildIds
      .map((id) => serializeSymbolNode(symbol.nodes, id, this))
      .join("\n");
    this.symbols.push(
      `<symbol id="sym-${symbolId}" viewBox="0 0 ${symbol.width} ${symbol.height}">${body}</symbol>`,
    );
  }

  toXml(): string {
    const all = [...this.grads, ...this.filters, ...this.clips, ...this.symbols];
    if (!all.length) return "";
    return `<defs>\n${all.join("\n")}\n</defs>\n`;
  }
}

function serializeSymbolNode(
  nodes: Record<string, SceneNode>,
  id: string,
  defs: DefsBuilder,
): string {
  const node = nodes[id];
  if (!node) return "";
  // Minimal serialize inside symbol (no clip/doc refs)
  const t = transformAttr(node.transform);
  const op = node.opacity < 1 ? ` opacity="${node.opacity}"` : "";
  switch (node.type) {
    case "group":
      return `<g${t}${op}>${node.children.map((c) => serializeSymbolNode(nodes, c, defs)).join("")}</g>`;
    case "path":
      return `<path${t}${op} d="${subpathsToD(node.subpaths)}" ${defs.paintAttr(node.fill, "fill")} ${strokeAttrs(node.stroke, defs)} />`;
    case "rect":
      return `<rect${t}${op} width="${node.width}" height="${node.height}" ${defs.paintAttr(node.fill, "fill")} ${strokeAttrs(node.stroke, defs)} />`;
    case "ellipse":
      return `<ellipse${t}${op} cx="0" cy="0" rx="${node.rx}" ry="${node.ry}" ${defs.paintAttr(node.fill, "fill")} ${strokeAttrs(node.stroke, defs)} />`;
    case "line":
      return `<line${t}${op} x1="0" y1="0" x2="${node.x2}" y2="${node.y2}" ${strokeAttrs(node.stroke, defs)} />`;
    case "text":
      return `<text${t}${op} font-family="${escapeXml(node.fontFamily)}" font-size="${node.fontSize}">${escapeXml(node.content)}</text>`;
    default:
      return "";
  }
}

function strokeAttrs(stroke: StrokeStyle, defs: DefsBuilder): string {
  const parts = [defs.paintAttr(stroke.paint, "stroke")];
  parts.push(`stroke-width="${stroke.width}"`);
  parts.push(`stroke-linecap="${stroke.lineCap}"`);
  parts.push(`stroke-linejoin="${stroke.lineJoin}"`);
  if (stroke.dashArray.length) {
    parts.push(`stroke-dasharray="${stroke.dashArray.join(" ")}"`);
  }
  if (stroke.dashOffset) parts.push(`stroke-dashoffset="${stroke.dashOffset}"`);
  return parts.join(" ");
}

function transformAttr(t: Transform2D): string {
  const ops: string[] = [];
  if (t.x || t.y) ops.push(`translate(${t.x} ${t.y})`);
  if (t.rotation) ops.push(`rotate(${t.rotation})`);
  if (t.scaleX !== 1 || t.scaleY !== 1) ops.push(`scale(${t.scaleX} ${t.scaleY})`);
  if (t.skewX) ops.push(`skewX(${t.skewX})`);
  if (t.skewY) ops.push(`skewY(${t.skewY})`);
  return ops.length ? ` transform="${ops.join(" ")}"` : "";
}

function commonAttrs(doc: SvgDocument, node: SceneNode, defs: DefsBuilder): string {
  const opacity = node.opacity < 1 ? ` opacity="${node.opacity}"` : "";
  const display = node.visible ? "" : ` display="none"`;
  const filter = defs.filterAttr(node.effects);
  const clip = defs.clipAttr(doc, node);
  return ` id="${node.id}" data-name="${escapeXml(node.name)}"${transformAttr(node.transform)}${opacity}${display}${filter}${clip}`;
}

function escapeXml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function subpathsToD(subpaths: PathSubpath[]): string {
  const parts: string[] = [];
  for (const sp of subpaths) {
    if (!sp.points.length) continue;
    const first = sp.points[0];
    parts.push(`M ${first.x} ${first.y}`);
    for (let i = 1; i < sp.points.length; i++) {
      const prev = sp.points[i - 1];
      const cur = sp.points[i];
      if (prev.handleOut || cur.handleIn) {
        const c1 = prev.handleOut ?? { x: prev.x, y: prev.y };
        const c2 = cur.handleIn ?? { x: cur.x, y: cur.y };
        parts.push(`C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${cur.x} ${cur.y}`);
      } else {
        parts.push(`L ${cur.x} ${cur.y}`);
      }
    }
    if (sp.closed) {
      const last = sp.points[sp.points.length - 1];
      const firstPt = sp.points[0];
      if (last.handleOut || firstPt.handleIn) {
        const c1 = last.handleOut ?? { x: last.x, y: last.y };
        const c2 = firstPt.handleIn ?? { x: firstPt.x, y: firstPt.y };
        parts.push(`C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${firstPt.x} ${firstPt.y}`);
      }
      parts.push("Z");
    }
  }
  return parts.join(" ");
}

function serializeGroup(doc: SvgDocument, node: GroupNode, defs: DefsBuilder): string {
  const kids = node.children.map((cid) => serializeNode(doc, cid, defs)).join("\n");
  return `<g${commonAttrs(doc, node, defs)}>\n${kids}\n</g>`;
}

function serializePath(doc: SvgDocument, node: PathNode, defs: DefsBuilder): string {
  const d = subpathsToD(node.subpaths);
  return `<path${commonAttrs(doc, node, defs)} d="${d}" ${defs.paintAttr(node.fill, "fill")} ${strokeAttrs(node.stroke, defs)} fill-rule="${node.fillRule}" />`;
}

function serializeRect(doc: SvgDocument, node: RectNode, defs: DefsBuilder): string {
  return `<rect${commonAttrs(doc, node, defs)} width="${node.width}" height="${node.height}" rx="${node.rx}" ry="${node.ry}" ${defs.paintAttr(node.fill, "fill")} ${strokeAttrs(node.stroke, defs)} />`;
}

function serializeEllipse(doc: SvgDocument, node: EllipseNode, defs: DefsBuilder): string {
  return `<ellipse${commonAttrs(doc, node, defs)} cx="0" cy="0" rx="${node.rx}" ry="${node.ry}" ${defs.paintAttr(node.fill, "fill")} ${strokeAttrs(node.stroke, defs)} />`;
}

function serializeLine(doc: SvgDocument, node: LineNode, defs: DefsBuilder): string {
  return `<line${commonAttrs(doc, node, defs)} x1="0" y1="0" x2="${node.x2}" y2="${node.y2}" ${strokeAttrs(node.stroke, defs)} />`;
}

function serializeText(doc: SvgDocument, node: TextNode, defs: DefsBuilder): string {
  return `<text${commonAttrs(doc, node, defs)} font-family="${escapeXml(node.fontFamily)}" font-size="${node.fontSize}" font-weight="${node.fontWeight}" letter-spacing="${node.letterSpacing}" ${defs.paintAttr(node.fill, "fill")} ${strokeAttrs(node.stroke, defs)}>${escapeXml(node.content)}</text>`;
}

function serializeNode(doc: SvgDocument, id: string, defs: DefsBuilder): string {
  const node = doc.nodes[id];
  if (!node) return "";
  // Skip invisible clip masks that are only used as clips (still referenced via clipPath)
  switch (node.type) {
    case "group":
      return serializeGroup(doc, node, defs);
    case "path":
      return serializePath(doc, node, defs);
    case "rect":
      return serializeRect(doc, node, defs);
    case "ellipse":
      return serializeEllipse(doc, node, defs);
    case "line":
      return serializeLine(doc, node, defs);
    case "text":
      return serializeText(doc, node, defs);
    case "image":
      return `<image${commonAttrs(doc, node, defs)} href="${escapeXml(node.href)}" width="${node.width}" height="${node.height}" />`;
    case "symbolInstance":
      return serializeSymbolInstance(doc, node, defs);
  }
}

function serializeSymbolInstance(
  doc: SvgDocument,
  node: SymbolInstanceNode,
  defs: DefsBuilder,
): string {
  defs.ensureSymbol(doc, node.symbolId);
  return `<use${commonAttrs(doc, node, defs)} href="#sym-${node.symbolId}" width="${node.width}" height="${node.height}" />`;
}

export function documentToSvgString(doc: SvgDocument, opts?: { activeOnly?: boolean }): string {
  const defs = new DefsBuilder();
  const artboards = doc.artboards?.length
    ? doc.artboards
    : [
        {
          id: "ab0",
          name: "Artboard 1",
          x: doc.viewBox.x,
          y: doc.viewBox.y,
          width: doc.viewBox.w,
          height: doc.viewBox.h,
          background: doc.background ?? "#ffffff",
        },
      ];

  const boards = opts?.activeOnly
    ? artboards.filter((a) => a.id === doc.activeArtboardId)
    : artboards;
  const activeBoards = boards.length ? boards : artboards;

  const boardRects = activeBoards
    .map((a) => {
      const fill = a.background ?? "#ffffff";
      return `<rect data-artboard="${escapeXml(a.name)}" x="${a.x}" y="${a.y}" width="${a.width}" height="${a.height}" fill="${fill}" />`;
    })
    .join("\n");

  const body = doc.rootChildIds.map((id) => serializeNode(doc, id, defs)).join("\n");
  const minX = Math.min(...activeBoards.map((a) => a.x));
  const minY = Math.min(...activeBoards.map((a) => a.y));
  const maxX = Math.max(...activeBoards.map((a) => a.x + a.width));
  const maxY = Math.max(...activeBoards.map((a) => a.y + a.height));
  const vb = `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
  const w = Math.round(maxX - minX);
  const h = Math.round(maxY - minY);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}">
${defs.toXml()}${boardRects}
${body}
</svg>`;
}
