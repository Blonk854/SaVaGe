import { createArtboard, syncDocBoundsFromArtboards } from "./artboards";
import type { SvgDocument } from "./types";

export function createEmptyDocument(w = 1920, h = 1080, name = "Untitled"): SvgDocument {
  const artboard = createArtboard("Artboard 1", 0, 0, w, h, "#ffffff");
  const doc: SvgDocument = {
    version: 1,
    name,
    width: w,
    height: h,
    viewBox: { x: 0, y: 0, w, h },
    background: null,
    rootChildIds: [],
    nodes: {},
    assets: {},
    artboards: [artboard],
    activeArtboardId: artboard.id,
    symbols: {},
  };
  syncDocBoundsFromArtboards(doc);
  return doc;
}
