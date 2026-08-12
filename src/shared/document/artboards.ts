import { nanoid } from "nanoid";
import type { Artboard, SvgDocument } from "./types";

export function createArtboard(
  name = "Artboard 1",
  x = 0,
  y = 0,
  width = 1920,
  height = 1080,
  background: string | null = "#ffffff",
): Artboard {
  return { id: nanoid(10), name, x, y, width, height, background };
}

/** Ensure older docs / imports have at least one artboard. Mutates and returns doc. */
export function ensureArtboards(doc: SvgDocument): SvgDocument {
  if (!doc.artboards || doc.artboards.length === 0) {
    const ab = createArtboard(
      "Artboard 1",
      doc.viewBox?.x ?? 0,
      doc.viewBox?.y ?? 0,
      doc.viewBox?.w || doc.width || 1920,
      doc.viewBox?.h || doc.height || 1080,
      doc.background ?? "#ffffff",
    );
    doc.artboards = [ab];
    doc.activeArtboardId = ab.id;
  }
  if (!doc.activeArtboardId || !doc.artboards.some((a) => a.id === doc.activeArtboardId)) {
    doc.activeArtboardId = doc.artboards[0].id;
  }
  syncDocBoundsFromArtboards(doc);
  return doc;
}

export function getActiveArtboard(doc: SvgDocument): Artboard {
  ensureArtboards(doc);
  return doc.artboards.find((a) => a.id === doc.activeArtboardId) ?? doc.artboards[0];
}

/** Expand document width/height/viewBox to cover all artboards. */
export function syncDocBoundsFromArtboards(doc: SvgDocument) {
  if (!doc.artboards?.length) return;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const a of doc.artboards) {
    minX = Math.min(minX, a.x);
    minY = Math.min(minY, a.y);
    maxX = Math.max(maxX, a.x + a.width);
    maxY = Math.max(maxY, a.y + a.height);
  }
  doc.viewBox = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  doc.width = Math.max(1, Math.round(doc.viewBox.w));
  doc.height = Math.max(1, Math.round(doc.viewBox.h));
}

export function nextArtboardPlacement(doc: SvgDocument, width = 1920, height = 1080) {
  ensureArtboards(doc);
  const gap = 80;
  let maxX = 0;
  for (const a of doc.artboards) {
    maxX = Math.max(maxX, a.x + a.width);
  }
  return { x: maxX + gap, y: doc.artboards[0]?.y ?? 0, width, height };
}
