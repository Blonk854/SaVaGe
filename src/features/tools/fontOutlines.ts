import * as OpenType from "opentype.js";
import type { PathSubpath } from "../../shared/document/types";
import { nanoid } from "nanoid";

import dmSans400 from "../../assets/fonts/dm-sans-latin-400-normal.woff?url";
import dmSans500 from "../../assets/fonts/dm-sans-latin-500-normal.woff?url";
import dmSans700 from "../../assets/fonts/dm-sans-latin-700-normal.woff?url";
import syne400 from "../../assets/fonts/syne-latin-400-normal.woff?url";
import syne700 from "../../assets/fonts/syne-latin-700-normal.woff?url";

export interface OutlineCommand {
  type: string;
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

const fontCache = new Map<string, OpenType.Font>();

function parseFont(buf: ArrayBuffer): OpenType.Font {
  const mod = OpenType as typeof OpenType & { default?: { parse: typeof OpenType.parse } };
  const parse = mod.parse ?? mod.default?.parse;
  if (!parse) throw new Error("opentype.js parse() unavailable");
  return parse(buf);
}

function quadToCubic(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x: number,
  y: number,
) {
  return {
    c1: { x: x0 + (2 / 3) * (x1 - x0), y: y0 + (2 / 3) * (y1 - y0) },
    c2: { x: x + (2 / 3) * (x1 - x), y: y + (2 / 3) * (y1 - y) },
  };
}

/** Convert TrueType/CFF path commands into SaVaGe cubic subpaths. */
export function outlineCommandsToSubpaths(commands: OutlineCommand[]): PathSubpath[] {
  const subpaths: PathSubpath[] = [];
  const state: { current: PathSubpath | null } = { current: null };
  let cx = 0;
  let cy = 0;

  const ensure = () => {
    if (!state.current) {
      state.current = { closed: false, points: [] };
      subpaths.push(state.current);
    }
    return state.current;
  };

  const moveTo = (x: number, y: number) => {
    state.current = { closed: false, points: [{ id: nanoid(8), x, y, type: "corner" }] };
    subpaths.push(state.current);
    cx = x;
    cy = y;
  };

  for (const cmd of commands) {
    if (cmd.type === "M") {
      moveTo(cmd.x ?? 0, cmd.y ?? 0);
      continue;
    }
    if (cmd.type === "Z") {
      if (state.current) state.current.closed = true;
      state.current = null;
      continue;
    }
    const sp = ensure();
    if (!sp.points.length) {
      sp.points.push({ id: nanoid(8), x: cx, y: cy, type: "corner" });
    }
    if (cmd.type === "L") {
      cx = cmd.x ?? cx;
      cy = cmd.y ?? cy;
      sp.points.push({ id: nanoid(8), x: cx, y: cy, type: "corner" });
      continue;
    }
    if (cmd.type === "Q") {
      const q1x = cmd.x1 ?? cx;
      const q1y = cmd.y1 ?? cy;
      const x = cmd.x ?? cx;
      const y = cmd.y ?? cy;
      const { c1, c2 } = quadToCubic(cx, cy, q1x, q1y, x, y);
      const prev = sp.points[sp.points.length - 1];
      prev.handleOut = c1;
      prev.type = prev.handleIn ? "smooth" : "corner";
      cx = x;
      cy = y;
      sp.points.push({
        id: nanoid(8),
        x: cx,
        y: cy,
        handleIn: c2,
        type: "smooth",
      });
      continue;
    }
    if (cmd.type === "C") {
      const prev = sp.points[sp.points.length - 1];
      prev.handleOut = { x: cmd.x1 ?? cx, y: cmd.y1 ?? cy };
      prev.type = prev.handleIn ? "smooth" : "corner";
      cx = cmd.x ?? cx;
      cy = cmd.y ?? cy;
      sp.points.push({
        id: nanoid(8),
        x: cx,
        y: cy,
        handleIn: { x: cmd.x2 ?? cx, y: cmd.y2 ?? cy },
        type: "smooth",
      });
    }
  }

  return subpaths.filter((sp) => sp.points.length >= 2);
}

function normalizeFamily(family: string): string {
  return family.replace(/["']/g, "").split(",")[0].trim().toLowerCase();
}

function pickFontUrl(family: string, weight: number): string {
  const name = normalizeFamily(family);
  const syne = name.includes("syne");
  if (syne) return weight >= 600 ? syne700 : syne400;
  if (weight >= 650) return dmSans700;
  if (weight >= 500) return dmSans500;
  return dmSans400;
}

async function loadFont(url: string): Promise<OpenType.Font> {
  const hit = fontCache.get(url);
  if (hit) return hit;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load font (${res.status})`);
  const buf = await res.arrayBuffer();
  const font = parseFont(buf);
  fontCache.set(url, font);
  return font;
}

export async function textToGlyphSubpaths(
  content: string,
  fontFamily: string,
  fontSize: number,
  fontWeight: number,
  letterSpacing: number,
): Promise<PathSubpath[]> {
  const font = await loadFont(pickFontUrl(fontFamily, fontWeight));
  const scale = (1 / font.unitsPerEm) * fontSize;
  let x = 0;
  const subpaths: PathSubpath[] = [];
  const chars = [...content];
  for (let i = 0; i < chars.length; i++) {
    const glyph = font.charToGlyph(chars[i]);
    const path = glyph.getPath(x, 0, fontSize);
    subpaths.push(...outlineCommandsToSubpaths(path.commands as OutlineCommand[]));
    const advance = (glyph.advanceWidth ?? 0) * scale;
    x += advance + letterSpacing;
    if (i + 1 < chars.length) {
      const next = font.charToGlyph(chars[i + 1]);
      x += (font.getKerningValue(glyph, next) || 0) * scale;
    }
  }
  if (!subpaths.length) throw new Error("Font produced no glyph outlines");
  return subpaths;
}
