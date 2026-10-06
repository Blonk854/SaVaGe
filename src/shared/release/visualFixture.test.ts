import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyDocument } from "../document/emptyDocument";
import { useDocumentStore } from "../stores/documentStore";
import { useUiStore } from "../stores/uiStore";
import { getSaveConflictPrompt } from "../ui/saveConflictPrompt";
import { getUnsavedChangesPrompt } from "../ui/unsavedChangesPrompt";
import { applyShellFixture, converterFixturePatch, resetVisualFixturesForTests } from "./visualFixture";
import {
  isVisualFixtureName,
  markVisualFixtureReady,
  readVisualFixture,
  VISUAL_FIXTURES,
  visualFixtureReady,
} from "./visualFixtureName";

describe("visual fixtures", () => {
  beforeEach(() => {
    resetVisualFixturesForTests();
    useDocumentStore.temporal.getState().clear();
    useDocumentStore.getState().loadDocument(createEmptyDocument());
    useUiStore.setState({ mode: "convert", converting: false, convertProgressLabel: "" });
    delete (globalThis as { __SAVAGE_VISUAL__?: unknown }).__SAVAGE_VISUAL__;
  });

  it("reads only an allowlisted host fixture", () => {
    expect(readVisualFixture()).toBeNull();
    (globalThis as { __SAVAGE_VISUAL__?: unknown }).__SAVAGE_VISUAL__ = "converter-loaded;alert(1)";
    expect(readVisualFixture()).toBeNull();
    (globalThis as { __SAVAGE_VISUAL__?: unknown }).__SAVAGE_VISUAL__ = "converter-loaded";
    expect(readVisualFixture()).toBe("converter-loaded");
    expect(VISUAL_FIXTURES).toHaveLength(11);
    expect(isVisualFixtureName("menu-file")).toBe(true);
  });

  it("seeds converter states without a native preview", () => {
    expect(converterFixturePatch("converter-empty")).toBeNull();
    const loaded = converterFixturePatch("converter-loaded");
    expect(loaded?.source.path.endsWith("mark.png")).toBe(true);
    expect(loaded?.preview?.width).toBe(32);
    expect(loaded?.converting).toBe(false);
    expect(converterFixturePatch("converter-tracing")?.converting).toBe(true);
    expect(converterFixturePatch("converter-error")?.error).toBe("That image could not be read.");
    const stale = converterFixturePatch("converter-stale");
    expect(stale?.options).not.toEqual(stale?.convertedOptions);
    expect(converterFixturePatch("converter-completed")?.summary?.durationMs).toBe(12);
    expect(converterFixturePatch("editor-empty")).toBeNull();
  });

  it("seeds the editor, menus, and prompts", () => {
    expect(applyShellFixture("editor-empty")).toBe("ready");
    expect(useUiStore.getState().mode).toBe("edit");
    expect(visualFixtureReady()).toBe("editor-empty");

    resetVisualFixturesForTests();
    useDocumentStore.getState().loadDocument(createEmptyDocument());
    expect(applyShellFixture("editor-populated")).toBe("ready");
    expect(useDocumentStore.getState().doc.nodes.rect?.name).toBe("Rectangle");
    expect(useDocumentStore.getState().selection).toEqual(["rect"]);

    resetVisualFixturesForTests();
    document.body.innerHTML = '<button type="button" data-menubar-button data-menu="file">File</button>';
    const button = document.querySelector("button");
    let clicks = 0;
    button?.addEventListener("click", () => {
      clicks += 1;
    });
    expect(applyShellFixture("menu-file")).toBe("wait-frame");
    expect(clicks).toBe(1);
    expect(visualFixtureReady()).toBeNull();
    markVisualFixtureReady("menu-file");
    expect(document.documentElement.dataset.savageVisual).toBe("menu-file");

    resetVisualFixturesForTests();
    applyShellFixture("dialog-unsaved");
    expect(getUnsavedChangesPrompt()?.question).toContain("Save changes");
    resetVisualFixturesForTests();
    expect(getUnsavedChangesPrompt()).toBeNull();

    applyShellFixture("dialog-conflict");
    expect(getSaveConflictPrompt()?.question).toContain("changed on disk");
  });
});
