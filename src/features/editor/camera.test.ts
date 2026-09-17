import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "../../shared/document/emptyDocument";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { useUiStore } from "../../shared/stores/uiStore";
import { fitToArtboard } from "./camera";

describe("fitToArtboard", () => {
  it("centers the active artboard in the viewport", () => {
    useDocumentStore.setState({ doc: createEmptyDocument(1920, 1080), selection: [] });
    fitToArtboard(800, 500, 48);
    const ui = useUiStore.getState();
    const zoom = Math.min((800 - 96) / 1920, (500 - 96) / 1080);
    expect(ui.zoom).toBeCloseTo(zoom);
    expect(ui.panX).toBeCloseTo((800 - 1920 * zoom) / 2);
    expect(ui.panY).toBeCloseTo((500 - 1080 * zoom) / 2);
  });
});
