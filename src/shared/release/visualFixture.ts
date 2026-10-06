import { PRESETS, type ConvertOptions } from "../../features/converter/convertApi";
import type { GrantedImageSource, ImagePreview } from "../../features/converter/rasterFiles";
import type { TraceSummary } from "../../features/converter/traceSummary";
import { dismissWelcome } from "../ui/firstRun";
import { promptSaveConflict, resolveSaveConflictPrompt } from "../ui/saveConflictPrompt";
import { promptSaveDiscardCancel, resolveUnsavedChangesPrompt } from "../ui/unsavedChangesPrompt";
import { defaultStroke, defaultTransform, solidFill, type RectNode } from "../document/types";
import { useDocumentStore } from "../stores/documentStore";
import { useUiStore } from "../stores/uiStore";
import {
  markVisualFixtureReady,
  readVisualFixture,
  resetVisualFixtureReadyForTests,
  type VisualFixtureName,
} from "./visualFixtureName";

const FIXTURE_SOURCE: GrantedImageSource = {
  path: "C:\\evidence\\mark.png",
  grantId: "visual-fixture",
};

const FIXTURE_PREVIEW: ImagePreview = {
  dataUrl:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  width: 32,
  height: 16,
  byteSize: 128,
  format: "png",
};

const FIXTURE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="16" viewBox="0 0 32 16"><rect width="32" height="16" fill="#c6f135"/></svg>';

const FIXTURE_SUMMARY: TraceSummary = {
  shapeCount: 1,
  byteSize: FIXTURE_SVG.length,
  width: 32,
  height: 16,
  durationMs: 12,
};

export interface ConverterFixturePatch {
  source: GrantedImageSource;
  preview: ImagePreview | null;
  svgMarkup: string | null;
  options: ConvertOptions;
  convertedOptions: ConvertOptions | null;
  summary: TraceSummary | null;
  error: string | null;
  converting: boolean;
}

export function converterFixturePatch(name: VisualFixtureName): ConverterFixturePatch | null {
  const loaded: ConverterFixturePatch = {
    source: FIXTURE_SOURCE,
    preview: FIXTURE_PREVIEW,
    svgMarkup: null,
    options: PRESETS.logo,
    convertedOptions: null,
    summary: null,
    error: null,
    converting: false,
  };
  switch (name) {
    case "converter-loaded":
      return loaded;
    case "converter-tracing":
      return { ...loaded, converting: true };
    case "converter-completed":
      return {
        ...loaded,
        svgMarkup: FIXTURE_SVG,
        convertedOptions: PRESETS.logo,
        summary: FIXTURE_SUMMARY,
      };
    case "converter-stale":
      return {
        ...loaded,
        options: PRESETS.photo,
        svgMarkup: FIXTURE_SVG,
        convertedOptions: PRESETS.logo,
        summary: FIXTURE_SUMMARY,
      };
    case "converter-error":
      return {
        ...loaded,
        preview: null,
        error: "That image could not be read.",
      };
    default:
      return null;
  }
}

let applied = false;

export type ShellFixturePhase = "ready" | "wait-frame";

/** Seeds editor, menu, and dialog fixtures. Converter states are applied by ConverterView. */
export function applyShellFixture(name: VisualFixtureName): ShellFixturePhase {
  if (applied || name.startsWith("converter-")) return "ready";
  applied = true;
  dismissWelcome();
  useUiStore.getState().setMode("edit");
  if (name === "editor-populated") {
    useDocumentStore.getState().addNode(fixtureRect());
  }
  if (name === "dialog-unsaved") {
    void promptSaveDiscardCancel();
  }
  if (name === "dialog-conflict") {
    void promptSaveConflict();
  }
  if (name === "menu-file") {
    document.querySelector<HTMLButtonElement>('[data-menubar-button][data-menu="file"]')?.click();
    return "wait-frame";
  }
  markVisualFixtureReady(name);
  return "ready";
}

export function resetVisualFixturesForTests(): void {
  applied = false;
  resolveUnsavedChangesPrompt("cancel");
  resolveSaveConflictPrompt("cancel");
  resetVisualFixtureReadyForTests();
}

export function installVisualFixture(): void {
  const name = readVisualFixture();
  if (!name || name.startsWith("converter-")) return;
  const phase = applyShellFixture(name);
  if (phase === "wait-frame") {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => markVisualFixtureReady(name));
    });
  }
}

function fixtureRect(): RectNode {
  return {
    id: "rect",
    name: "Rectangle",
    type: "rect",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: defaultTransform(120, 80),
    width: 240,
    height: 140,
    rx: 0,
    ry: 0,
    fill: solidFill("#B8FF3C"),
    stroke: defaultStroke("#10140c", 2),
  };
}
