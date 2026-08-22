import { createEmptyDocument } from "./emptyDocument";
import type { SvgDocument } from "./types";

export function parseSavageDocument(text: string): SvgDocument {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON");
  }
  if (!data || typeof data !== "object") {
    throw new Error("Unrecognized SaVaGe document");
  }
  const raw = data as Partial<SvgDocument> & { nodes?: unknown; rootChildIds?: unknown };
  if (
    raw.version !== 1 ||
    !raw.nodes ||
    typeof raw.nodes !== "object" ||
    !Array.isArray(raw.rootChildIds)
  ) {
    throw new Error("Unrecognized SaVaGe document");
  }
  const fallback = createEmptyDocument();
  return {
    ...fallback,
    ...raw,
    version: 1,
    name: typeof raw.name === "string" ? raw.name : fallback.name,
    width: Number(raw.width) || fallback.width,
    height: Number(raw.height) || fallback.height,
    viewBox: raw.viewBox ?? fallback.viewBox,
    background: raw.background ?? null,
    rootChildIds: raw.rootChildIds as SvgDocument["rootChildIds"],
    nodes: raw.nodes as SvgDocument["nodes"],
    assets: raw.assets ?? {},
    artboards: raw.artboards ?? fallback.artboards,
    activeArtboardId: raw.activeArtboardId ?? fallback.activeArtboardId,
    symbols: raw.symbols ?? {},
  };
}
