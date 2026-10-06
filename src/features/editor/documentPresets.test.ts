import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "../../shared/document/emptyDocument";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { parseArtboardSize, resizeActiveArtboard } from "./documentPresets";

describe("document presets", () => {
  it("accepts whole-pixel sizes inside the artboard limit", () => {
    expect(parseArtboardSize(" 512 ", "512")).toEqual({ width: 512, height: 512 });
    expect(parseArtboardSize("0", "10")).toBeNull();
    expect(parseArtboardSize("1920.5", "1080")).toBeNull();
    expect(parseArtboardSize("16385", "10")).toBeNull();
  });

  it("resizes the active artboard", () => {
    useDocumentStore.getState().loadDocument(createEmptyDocument());
    resizeActiveArtboard(512, 256);
    const artboard = useDocumentStore.getState().doc.artboards[0];
    expect(artboard?.width).toBe(512);
    expect(artboard?.height).toBe(256);
  });
});