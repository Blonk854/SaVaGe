import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { browserNative } from "../../shared/platform/browserNative";

vi.mock("@tauri-apps/api/core", async () => {
  const { browserNative: native } = await import("../../shared/platform/browserNative");
  return {
    invoke: (command: string, args?: Record<string, unknown>) => native.invoke(command, args),
    isTauri: () => native.tauri,
  };
});

vi.mock("@tauri-apps/api/window", async () => {
  const { browserNative: native } = await import("../../shared/platform/browserNative");
  return {
    getCurrentWindow: () => ({
      onCloseRequested: async (handler: (event: { preventDefault: () => void }) => void) => {
        native.closeHandler = handler;
        return () => {
          native.closeHandler = null;
        };
      },
      destroy: async () => {
        native.exited = true;
      },
    }),
  };
});

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: async () => () => undefined,
  }),
}));

vi.mock("@tauri-apps/plugin-dialog", async () => {
  const { browserNative: native } = await import("../../shared/platform/browserNative");
  return {
    open: async () => null,
    save: async () => null,
    ask: async (question: string) => nativeDialog(native, question),
    message: async (question: string) => nativeDialog(native, question),
  };
});

import { AppShell } from "../layout/AppShell";
import { createEmptyDocument } from "../../shared/document/emptyDocument";
import { defaultStroke, defaultTransform, solidFill, type RectNode } from "../../shared/document/types";
import { resetActiveConvertJobForTests } from "../../features/converter/convertApi";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { projectContents, useProjectSessionStore } from "../../shared/stores/projectSessionStore";
import { useRecentProjectsStore } from "../../features/editor/recentProjects";
import { useUiStore } from "../../shared/stores/uiStore";
import { getSaveConflictPrompt, resolveSaveConflictPrompt } from "../../shared/ui/saveConflictPrompt";
import { getUnsavedChangesPrompt, resolveUnsavedChangesPrompt } from "../../shared/ui/unsavedChangesPrompt";
import { getConfirmAction, resolveConfirmAction } from "../../shared/ui/confirmAction";
import { COMPACT_LAYOUT_MAX_WIDTH, WINDOW_MIN } from "../../shared/ui/windowLayout";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function nativeDialog(
  native: typeof browserNative,
  question: string,
): string | boolean {
  const answer = native.dialogQueue.shift();
  if (answer === undefined) throw new Error(`Unexpected dialog: ${question}`);
  return answer;
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
  if (typeof URL.createObjectURL !== "function") {
    URL.createObjectURL = () => "blob:journey-preview";
    URL.revokeObjectURL = () => undefined;
  }
  if (typeof globalThis.PointerEvent === "undefined") {
    class PointerEventPolyfill extends MouseEvent {
      pointerId: number;
      constructor(type: string, params: PointerEventInit & { pointerId?: number } = {}) {
        super(type, params);
        this.pointerId = params.pointerId ?? 0;
      }
    }
    globalThis.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
  }
  const element = Element.prototype as Element & {
    setPointerCapture?: (pointerId: number) => void;
    releasePointerCapture?: (pointerId: number) => void;
  };
  element.setPointerCapture = () => undefined;
  element.releasePointerCapture = () => undefined;
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
    })) as typeof window.matchMedia;
  }
});

beforeEach(() => {
  resetWorld();
});

afterEach(async () => {
  if (getUnsavedChangesPrompt()) resolveUnsavedChangesPrompt("cancel");
  if (getSaveConflictPrompt()) resolveSaveConflictPrompt("cancel");
  if (getConfirmAction()) resolveConfirmAction(false);
  browserNative.releaseAll();
  await flush();
  await act(async () => {
    root?.unmount();
  });
  host?.remove();
  root = null;
  host = null;
  resetWorld();
});

function resetWorld() {
  localStorage.removeItem("savage.convert.lastOptions");
  localStorage.removeItem("savage.welcome.dismissed");
  browserNative.reset();
  resetActiveConvertJobForTests();
  const doc = createEmptyDocument();
  useDocumentStore.getState().loadDocument(doc);
  useProjectSessionStore.getState().startSession({
    displayName: "Untitled",
    savedContents: projectContents(useDocumentStore.getState().doc),
  });
  useRecentProjectsStore.setState({ reopenLastProject: false, projects: [] });
  useUiStore.setState({
    mode: "convert",
    activeTool: "select",
    rightTab: "layers",
    zoom: 1,
    panX: 80,
    panY: 60,
    showGrid: true,
    snap: true,
    converting: false,
    convertProgressLabel: "",
    exporting: false,
    exportProgressLabel: "",
    pendingConvertPath: null,
    dirty: false,
    booleanPreview: null,
    hoverNodeId: null,
    frameMs: 0,
    shapeBuilderActive: false,
  });
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function waitFor(predicate: () => boolean, label: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return;
    await flush();
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function mount() {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(<AppShell />);
  });
  await flush();
}

function buttonText(button: HTMLButtonElement): string {
  return [...button.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? "")
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function buttonNamed(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find(
    (button) => button instanceof HTMLButtonElement && buttonText(button) === name,
  );
  if (!(found instanceof HTMLButtonElement)) throw new Error(`No button named ${name}`);
  return found;
}

async function press(key: string, options: { ctrl?: boolean; shift?: boolean; target?: EventTarget } = {}) {
  const target = options.target ?? document.activeElement ?? document.body;
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ctrlKey: options.ctrl ?? false,
    shiftKey: options.shift ?? false,
  });
  await act(async () => {
    target.dispatchEvent(event);
    if (
      (key === "Enter" || key === " ") &&
      target instanceof HTMLButtonElement &&
      !event.defaultPrevented
    ) {
      target.click();
    }
  });
}

async function openMenu(id: string) {
  await press("F10");
  for (let step = 0; step < 5; step += 1) {
    const current = document.activeElement;
    if (current instanceof HTMLElement && current.dataset.menu === id && current.hasAttribute("data-menubar-button")) {
      break;
    }
    await press("ArrowRight");
  }
  await press("ArrowDown");
  await flush();
}

async function activateMenuItem(label: string) {
  for (let step = 0; step < 24; step += 1) {
    const current = document.activeElement;
    const text = current instanceof HTMLElement ? (current.textContent ?? "").replace(/^✓\s*/, "").trim() : "";
    if (text === label) {
      await press("Enter");
      await flush();
      return;
    }
    await press("ArrowDown");
  }
  throw new Error(`Menu item ${label} was not reached`);
}

async function activateButton(name: string) {
  const button = buttonNamed(name);
  button.focus();
  await press("Enter");
  await flush();
}

async function activateTab(name: string) {
  const tab = [...document.querySelectorAll('[role="tab"]')].find(
    (button) => button instanceof HTMLButtonElement && buttonText(button) === name,
  );
  if (!(tab instanceof HTMLButtonElement)) throw new Error(`No tab named ${name}`);
  tab.focus();
  await press("Enter");
  await flush();
}

function artboard(): HTMLCanvasElement {
  const canvas = document.querySelector("canvas");
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Artboard canvas is missing");
  return canvas;
}

async function dragRect(x0: number, y0: number, x1: number, y1: number) {
  const canvas = artboard();
  canvas.focus();
  const fire = (type: string, x: number, y: number) => {
    canvas.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
        pointerId: 1,
      }),
    );
  };
  await act(async () => {
    fire("pointerdown", x0, y0);
    fire("pointermove", x1, y1);
    fire("pointerup", x1, y1);
  });
  await flush();
}

function layerLabels(): string[] {
  return [...document.querySelectorAll('[aria-label="Layers"] [role="option"]')].map(
    (row) => row.getAttribute("aria-label") ?? "",
  );
}

function visualState(): string[] {
  const lines: string[] = [];
  lines.push(document.querySelector(".converter") ? "surface convert" : "surface edit");
  const save = document.querySelector(".titlebar__save");
  if (save) {
    lines.push(`save ${save.textContent?.trim()} ${save.classList.contains("titlebar__save--dirty") ? "dirty" : "clean"}`);
  }
  const source = document.querySelector(".dropzone__title");
  if (source) lines.push(`source ${source.textContent?.trim()}`);
  const meta = document.querySelector(".converter__meta");
  if (meta) lines.push(`meta ${meta.textContent?.trim()}`);
  for (const banner of document.querySelectorAll(".sv-status")) {
    const kind = [...banner.classList].find((name) => name.startsWith("sv-status--")) ?? "sv-status";
    const body = banner.querySelector(".sv-status__body")?.textContent?.replace(/\s+/g, " ").trim();
    lines.push(`banner ${kind} ${body}`);
  }
  for (const pane of document.querySelectorAll(".preview__pane")) {
    const caption = pane.querySelector(":scope > span")?.textContent?.trim();
    const placeholder = pane.querySelector(".sv-empty")?.textContent?.trim();
    const image = pane.querySelector("img") ? "image" : placeholder;
    const stale = pane.classList.contains("preview__pane--stale") ? " stale" : "";
    lines.push(`pane ${caption}${stale} ${image}`);
  }
  const empty = document.querySelector(".empty-artboard__title");
  if (empty) lines.push(`empty ${empty.textContent?.trim()}`);
  if (layerLabels().length) {
    const rows = [...document.querySelectorAll('[aria-label="Layers"] [role="option"]')].map((row) => {
      const selected = row.getAttribute("aria-selected") === "true" ? "selected" : "idle";
      return `${selected} ${row.getAttribute("aria-label")}`;
    });
    lines.push(`layers ${rows.join(" | ")}`);
  }
  const menu = document.querySelector(".menu--open");
  if (menu) lines.push(`menu ${menu.getAttribute("data-menu")}`);
  const dialog = document.querySelector("[role='alertdialog'] h2");
  if (dialog) lines.push(`dialog ${dialog.textContent?.trim()}`);
  const toast = document.querySelector(".sv-toast");
  if (toast) lines.push(`toast ${[...toast.classList].join(".")} ${toast.textContent?.trim()}`);
  const convert = buttonNamedOrNull("Convert to SVG") ?? buttonNamedOrNull("Convert again");
  if (convert) lines.push(`convert ${convert.disabled ? "disabled" : "enabled"} ${buttonText(convert)}`);
  if (buttonNamedOrNull("Open in Editor")) lines.push("action open-editor");
  return lines;
}

function buttonNamedOrNull(name: string): HTMLButtonElement | null {
  const found = [...document.querySelectorAll("button")].find(
    (button) => button instanceof HTMLButtonElement && buttonText(button) === name,
  );
  return found instanceof HTMLButtonElement ? found : null;
}

function xInput(): HTMLInputElement {
  const label = [...document.querySelectorAll("label")].find((item) => item.querySelector("span")?.textContent === "X");
  const input = label?.querySelector("input");
  if (!(input instanceof HTMLInputElement)) throw new Error("X field is missing");
  return input;
}

function recoveredProject(): string {
  const doc = createEmptyDocument(800, 600, "Recovered");
  const rect: RectNode = {
    id: "recovered-rect",
    name: "Recovered mark",
    type: "rect",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: defaultTransform(12, 16),
    width: 40,
    height: 24,
    rx: 0,
    ry: 0,
    fill: solidFill("#B8FF3C"),
    stroke: defaultStroke("#0B0D10", 1),
  };
  doc.nodes[rect.id] = rect;
  doc.rootChildIds.push(rect.id);
  return projectContents(doc);
}

function productionAdapterImports(): string[] {
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.tsx?$/.test(entry) || entry === "browserNative.ts" || /\.test\.tsx?$/.test(entry)) continue;
      if (readFileSync(path, "utf8").includes("browserNative")) hits.push(path.replaceAll("\\", "/"));
    }
  };
  walk("src");
  return hits;
}

describe("browser-adapter journeys", () => {
  it("keeps the native adapter out of the production shell", () => {
    expect(productionAdapterImports()).toEqual([]);
  });

  it("imports, converts, compares, opens, saves, reopens, and exports", async () => {
    await mount();
    expect(visualState()).toContain("surface convert");
    expect(buttonNamed("Convert to SVG").disabled).toBe(true);

    await activateButton("Open Image…");
    await waitFor(() => document.body.textContent?.includes("mark.png · PNG · 32×16 · 128 B") ?? false, "source metadata");
    expect(document.querySelector(".preview__pane img")?.getAttribute("alt")).toBe("mark.png");

    browserNative.hold("convert_image_to_svg");
    await activateButton("Convert to SVG");
    await waitFor(() => document.body.textContent?.includes("Tracing…") ?? false, "tracing status");
    expect(buttonNamed("Convert to SVG").disabled).toBe(true);

    browserNative.release("convert_image_to_svg");
    await waitFor(() => buttonNamedOrNull("Open in Editor") !== null, "traced preview");
    expect(document.querySelector('img[alt="Traced SVG preview"]')).toBeTruthy();

    await activateButton("Open in Editor");
    await waitFor(() => layerLabels().includes("Traced mark, rect"), "editor layers");
    expect(document.querySelector(".converter")).toBeNull();
    expect(useUiStore.getState().mode).toBe("edit");

    await press("s", { ctrl: true });
    await waitFor(() => document.querySelector(".sv-toast")?.textContent === "Project saved", "save toast");
    expect(browserNative.files.get("C:\\projects\\journey.savage")?.contents).toContain("Traced mark");
    expect(useProjectSessionStore.getState().projectPath).toBe("C:\\projects\\journey.savage");

    const savedGrantId = [...browserNative.grants.entries()].find(([, path]) => path.endsWith("journey.savage"))?.[0];
    browserNative.queueOpen({
      path: "C:\\projects\\journey.savage",
      projectDestinationGrantId: savedGrantId,
    });
    useDocumentStore.getState().updateArtboard(useDocumentStore.getState().doc.activeArtboardId, { name: "Dirty" });
    await openMenu("file");
    await activateMenuItem("Open…");
    await waitFor(() => document.querySelector("[role='alertdialog'] h2")?.textContent === "Unsaved changes", "reopen prompt");
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-action="discard"]')?.click();
    });
    await waitFor(() => useProjectSessionStore.getState().displayName === "journey", "reopened project");
    expect(layerLabels()).toContain("Traced mark, rect");
    expect(useDocumentStore.getState().doc.artboards[0]?.name).not.toBe("Dirty");

    await openMenu("file");
    await activateMenuItem("Export SVG…");
    await waitFor(() => document.querySelector(".sv-toast")?.textContent === "SVG exported", "export toast");
    expect(browserNative.exports.map((item) => item.kind)).toEqual(["svg"]);
    expect(browserNative.exports[0]?.contents).toContain("<svg");
    expect(browserNative.exports[0]?.path).toBe("C:\\projects\\journey.svg");
  });

  it("draws, edits, groups, undoes, and answers close with cancel then discard", async () => {
    browserNative.tauri = true;
    await mount();
    await openMenu("file");
    await activateMenuItem("New");
    await waitFor(() => document.querySelector(".empty-artboard__title") !== null, "empty editor");

    artboard().focus();
    await press("r");
    expect(useUiStore.getState().activeTool).toBe("rect");
    await dragRect(80, 60, 144, 124);
    await dragRect(208, 188, 272, 252);
    const ids = useDocumentStore.getState().doc.rootChildIds;
    expect(ids).toHaveLength(2);

    document.querySelector<HTMLElement>('[aria-label="Properties"]')?.focus();
    await press("Enter");
    const input = xInput();
    input.focus();
    await act(async () => {
      input.value = "48";
    });
    await press("Enter");
    await flush();
    const selectedId = useDocumentStore.getState().selection[0];
    expect(useDocumentStore.getState().doc.nodes[selectedId]?.transform.x).toBe(48);
    await act(async () => {
      useDocumentStore.getState().setSelection(ids);
    });

    await openMenu("object");
    await activateMenuItem("Group");
    document.querySelector<HTMLElement>('button[aria-label="Layers"]')?.focus();
    await press("Enter");
    await waitFor(() => layerLabels().some((label) => label.startsWith("Group,")), "grouped layers");

    await press("z", { ctrl: true });
    await flush();
    expect(layerLabels().filter((label) => label.startsWith("Rectangle"))).toHaveLength(2);
    await press("y", { ctrl: true });
    await flush();
    expect(layerLabels().some((label) => label.startsWith("Group,"))).toBe(true);

    const closing = browserNative.requestClose();
    await waitFor(() => document.querySelector("#sv-unsaved-title")?.textContent === "Unsaved changes", "close prompt");
    expect(browserNative.exited).toBe(false);
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.click();
    });
    await closing;
    expect(browserNative.exited).toBe(false);
    expect(layerLabels().some((label) => label.startsWith("Group,"))).toBe(true);

    const exiting = browserNative.requestClose();
    await waitFor(() => document.querySelector('[data-action="discard"]') !== null, "discard prompt");
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-action="discard"]')?.click();
    });
    await exiting;
    expect(browserNative.exited).toBe(true);
  });

  it("keeps the open document when a project is malformed or over the size limit", async () => {
    await mount();
    await openMenu("file");
    await activateMenuItem("New");
    await waitFor(() => artboard() instanceof HTMLCanvasElement, "editor");
    artboard().focus();
    await press("r");
    await dragRect(80, 60, 176, 156);
    expect(layerLabels()).toContain("Rectangle, rect");
    const before = projectContents(useDocumentStore.getState().doc);

    browserNative.seedFile("C:\\projects\\broken.savage", "{");
    browserNative.queueOpen({ path: "C:\\projects\\broken.savage" });
    await openMenu("file");
    await activateMenuItem("Open…");
    await waitFor(() => document.querySelector(".sv-toast")?.textContent === "That file is not valid JSON", "malformed toast");
    expect(document.querySelector(".sv-toast")?.getAttribute("role")).toBe("alert");
    expect(projectContents(useDocumentStore.getState().doc)).toBe(before);
    expect(useUiStore.getState().mode).toBe("edit");

    browserNative.readError = "SaVaGe project exceeds the 16777216-character limit";
    browserNative.queueOpen({ path: "C:\\projects\\huge.savage" });
    await openMenu("file");
    await activateMenuItem("Open…");
    await waitFor(
      () => document.querySelector(".sv-toast")?.textContent === "SaVaGe project exceeds the 16777216-character limit",
      "oversize toast",
    );
    expect(projectContents(useDocumentStore.getState().doc)).toBe(before);
  });

  it("recovers a checkpoint as a new unsaved document", async () => {
    browserNative.tauri = true;
    browserNative.dialogQueue.push("Recover");
    browserNative.recoveries.push({
      sessionId: "recovery-session",
      sourcePath: null,
      sequence: 2,
      contents: recoveredProject(),
      createdAtMs: 1_700_000_000_000,
    });
    await mount();
    await waitFor(() => document.querySelector(".sv-toast")?.textContent === "Recovered project opened as an unsaved document", "recovery toast");
    expect(useProjectSessionStore.getState().displayName).toBe("Recovered Untitled");
    expect(useProjectSessionStore.getState().projectPath).toBeNull();
    await activateTab("Edit");
    await waitFor(() => layerLabels().includes("Recovered mark, rect"), "recovered layers");
    expect(browserNative.deletedRecoveries).toEqual([{ sessionId: "recovery-session", throughSequence: 2 }]);
  });

  it("runs open, convert, property edit, save, and export from the keyboard", async () => {
    await mount();
    await activateButton("Open Image…");
    await waitFor(() => document.body.textContent?.includes("mark.png") ?? false, "image attached");
    await activateButton("Convert to SVG");
    await waitFor(() => buttonNamedOrNull("Open in Editor") !== null, "convert finished");
    await activateButton("Open in Editor");
    await waitFor(() => layerLabels().includes("Traced mark, rect"), "opened trace");

    const traced = document.querySelector<HTMLElement>('[aria-label="Layers"] [role="option"]');
    traced?.focus();
    await press("Enter");
    await flush();
    document.querySelector<HTMLElement>('[aria-label="Properties"]')?.focus();
    await press("Enter");
    const input = xInput();
    input.focus();
    await press("r");
    expect(useUiStore.getState().activeTool).toBe("select");
    await act(async () => {
      input.value = "36";
    });
    await press("Enter");
    await flush();
    const id = useDocumentStore.getState().selection[0];
    expect(useDocumentStore.getState().doc.nodes[id]?.transform.x).toBe(36);

    await press("s", { ctrl: true });
    await waitFor(() => document.querySelector(".sv-toast")?.textContent === "Project saved", "keyboard save");
    await openMenu("file");
    await activateMenuItem("Export SVG…");
    await waitFor(() => browserNative.exports.length === 1, "keyboard export");
    expect(browserNative.exports[0]?.contents).toContain("Traced mark");
  });

  it("compares a trace, exports that markup, and runs a command from the palette", async () => {
    await mount();
    await activateButton("Open Image…");
    await activateButton("Convert to SVG");
    await waitFor(() => buttonNamedOrNull("Export SVG") !== null, "export action");
    expect(document.body.textContent).toMatch(/1 shape/);
    expect(document.querySelector(".opts__help")?.textContent).toMatch(/Custom/);

    await activateButton("Overlay");
    expect(document.querySelector(".preview__pane > span")?.textContent).toBe("Overlay");
    await activateButton("Before / after");
    expect(document.querySelector("[aria-label='Before and after split']")).toBeTruthy();
    await activateButton("Split view");
    expect(document.querySelectorAll(".preview__pane")).toHaveLength(2);

    await activateButton("Export SVG");
    await waitFor(() => browserNative.exports.length === 1, "traced export");
    expect(browserNative.exports[0]?.contents).toContain("Traced mark");
    expect(browserNative.exports[0]?.contents).not.toContain("Untitled");

    await press("k", { ctrl: true });
    await waitFor(
      () => document.querySelector("[aria-label='Search commands']") !== null,
      "command palette",
    );
    const search = document.querySelector<HTMLInputElement>("[aria-label='Search commands']");
    if (!search) throw new Error("command search is missing");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(search, "rectangle");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flush();
    const options = [...document.querySelectorAll("[role='option']")].map((option) => option.textContent ?? "");
    expect(options.some((label) => label.includes("Rectangle"))).toBe(true);
    expect(options.some((label) => label.includes("Export PNG"))).toBe(false);
    const rectangle = [...document.querySelectorAll<HTMLButtonElement>("[role='option']")].find((option) =>
      option.textContent?.includes("Rectangle"),
    );
    await act(async () => {
      rectangle?.click();
    });
    await flush();
    expect(useUiStore.getState().mode).toBe("edit");
    expect(useUiStore.getState().activeTool).toBe("rect");

    await openMenu("file");
    await activateMenuItem("New");
    await waitFor(() => document.querySelector(".empty-artboard__title") !== null, "empty artboard");
    await activateButton("512×512");
    await flush();
    expect(useDocumentStore.getState().doc.artboards[0]?.width).toBe(512);
    expect(useDocumentStore.getState().doc.artboards[0]?.height).toBe(512);
    expect(document.body.textContent).toContain("Ctrl+K searches commands");
  });
});

describe("accessibility checks", () => {
  it("opens menus from F10, moves with arrows, and returns focus on Escape", async () => {
    await mount();
    const menubar = document.querySelector('[role="menubar"]');
    expect(menubar?.getAttribute("aria-label")).toBe("Application menu");
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(5);

    await press("F10");
    expect((document.activeElement as HTMLElement).dataset.menu).toBe("file");
    await press("ArrowRight");
    expect((document.activeElement as HTMLElement).dataset.menu).toBe("edit");
    await press("ArrowLeft");
    await press("ArrowDown");
    await flush();
    const fileMenu = document.querySelector("#menu-file");
    expect(fileMenu?.getAttribute("role")).toBe("menu");
    expect(document.activeElement?.getAttribute("role")).toBe("menuitem");
    expect(document.activeElement?.textContent?.trim()).toBe("New");

    await press("Escape");
    await flush();
    expect(document.querySelector(".menu--open")).toBeNull();
    expect((document.activeElement as HTMLElement).dataset.menu).toBe("file");
    expect(buttonNamed("Convert to SVG").disabled).toBe(true);
    expect(buttonNamed("Convert to SVG").title).toBe("Attach an image first");
  });

  it("moves layer and artboard lists with arrows and cancels rename", async () => {
    await mount();
    await openMenu("file");
    await activateMenuItem("New");
    await waitFor(() => document.querySelector('[aria-label="Layers"]') !== null, "layers list");

    const alpha: RectNode = {
      id: "alpha",
      name: "Alpha",
      type: "rect",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      transform: defaultTransform(),
      width: 10,
      height: 10,
      rx: 0,
      ry: 0,
      fill: solidFill("#ffffff"),
      stroke: defaultStroke(),
    };
    const beta: RectNode = { ...alpha, id: "beta", name: "Beta" };
    await act(async () => {
      useDocumentStore.getState().addNode(alpha);
      useDocumentStore.getState().addNode(beta);
    });
    await flush();

    const rows = () => [...document.querySelectorAll<HTMLElement>('[aria-label="Layers"] [role="option"]')];
    expect(rows()[0]?.getAttribute("aria-label")).toBe("Beta, rect");
    expect(rows()[0]?.getAttribute("aria-selected")).toBe("true");
    rows()[0]?.focus();
    await press("ArrowDown");
    await flush();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Alpha, rect");
    await waitFor(
      () => document.querySelector("[aria-live='polite']")?.textContent === "Alpha selected",
      "selection announcement",
    );

    await press("F2");
    await flush();
    const rename = document.querySelector<HTMLInputElement>('[aria-label="Rename Alpha"]');
    expect(rename).toBeTruthy();
    rename?.focus();
    await act(async () => {
      if (rename) rename.value = "Should not stick";
    });
    await press("Escape", { target: rename ?? undefined });
    await flush();
    expect(document.querySelector('[aria-label="Rename Alpha"]')).toBeNull();
    expect(useDocumentStore.getState().doc.nodes.alpha?.name).toBe("Alpha");

    await openMenu("object");
    await activateMenuItem("New Artboard");
    await waitFor(() => useDocumentStore.getState().doc.artboards.length === 2, "second artboard");
    const artboardTab = [...document.querySelectorAll("button")].find(
      (button) => button instanceof HTMLButtonElement && buttonText(button) === "Artboards",
    );
    if (artboardTab instanceof HTMLButtonElement) {
      artboardTab.focus();
      await press("Enter");
    }
    await flush();
    const boardRows = () => [...document.querySelectorAll<HTMLElement>('[aria-label="Artboards"] [role="option"]')];
    expect(boardRows().some((row) => row.getAttribute("aria-label")?.startsWith("Artboard 1"))).toBe(true);
    const firstBoard = boardRows()[0];
    firstBoard?.focus();
    const before = firstBoard?.getAttribute("aria-label");
    await press("ArrowDown");
    await flush();
    expect(document.activeElement?.getAttribute("aria-label")).not.toBe(before);
    expect(document.activeElement?.getAttribute("role")).toBe("option");
  });

  it("names the artboard canvas and ignores tool keys while a property field is focused", async () => {
    await mount();
    await openMenu("file");
    await activateMenuItem("New");
    await waitFor(() => artboard().getAttribute("aria-label") === "Artboard", "canvas name");
    expect(artboard().tabIndex).toBe(0);

    artboard().focus();
    await press("r");
    await dragRect(80, 60, 160, 140);
    document.querySelector<HTMLElement>('[aria-label="Properties"]')?.focus();
    await press("Enter");
    const input = xInput();
    input.focus();
    await press("v");
    expect(useUiStore.getState().activeTool).toBe("rect");
    expect(document.querySelector("[aria-live='polite']")?.textContent).toBe("Rectangle selected");
  });
});

describe("visual contracts", () => {
  it("records converter empty, loaded, tracing, completed, stale, and error states", async () => {
    await mount();
    expect(visualState()).toEqual([
      "surface convert",
      "save Unsaved dirty",
      "source Drop an image to vectorize",
      "pane Raster Drop or open an image",
      "pane SVG Convert to see the SVG",
      "convert disabled Convert to SVG",
    ]);

    await activateButton("Open Image…");
    await waitFor(() => visualState().some((line) => line.startsWith("meta ")), "loaded source");
    expect(visualState()).toEqual([
      "surface convert",
      "save Unsaved dirty",
      "source mark.png",
      "meta mark.png · PNG · 32×16 · 128 B",
      "pane Raster image",
      "pane SVG Convert to see the SVG",
      "convert enabled Convert to SVG",
    ]);

    browserNative.hold("convert_image_to_svg");
    await activateButton("Convert to SVG");
    await waitFor(() => visualState().some((line) => line.includes("Tracing")), "tracing contract");
    expect(visualState()).toEqual([
      "surface convert",
      "save Unsaved dirty",
      "source mark.png",
      "meta mark.png · PNG · 32×16 · 128 B",
      "banner sv-status--loading Tracing…",
      "pane Raster image",
      "pane SVG Tracing…",
      "convert disabled Convert to SVG",
    ]);
    browserNative.release("convert_image_to_svg");
    await waitFor(() => visualState().includes("action open-editor"), "completed contract");
    expect(visualState()).toEqual([
      "surface convert",
      "save Unsaved dirty",
      "source mark.png",
      "meta mark.png · PNG · 32×16 · 128 B",
      "pane Raster image",
      "pane SVG image",
      "convert enabled Convert again",
      "action open-editor",
    ]);

    await activateButton("Photo");
    await flush();
    expect(visualState()).toContain("banner sv-status--warn Trace options changed. Convert again to update the SVG.");
    expect(visualState()).toContain("pane SVG (previous options) stale image");
  });

  it("records a converter preview failure without leaving the convert surface", async () => {
    browserNative.previewError = "That image could not be read.";
    await mount();
    await activateButton("Open Image…");
    await waitFor(() => visualState().some((line) => line.startsWith("banner sv-status--error")), "error contract");
    expect(visualState()).toEqual([
      "surface convert",
      "save Unsaved dirty",
      "source mark.png",
      "banner sv-status--error That image could not be read.",
      "pane Raster Drop or open an image",
      "pane SVG Convert to see the SVG",
      "convert enabled Convert to SVG",
    ]);
  });

  it("records the empty editor, a populated editor, an open menu, and both prompts", async () => {
    await mount();
    await openMenu("file");
    await activateMenuItem("New");
    await waitFor(() => visualState().includes("empty This artboard is empty"), "empty editor contract");
    expect(visualState()).toEqual([
      "surface edit",
      "save Unsaved dirty",
      "empty This artboard is empty",
    ]);

    artboard().focus();
    await press("r");
    await dragRect(80, 60, 160, 140);
    await flush();
    expect(visualState()).toEqual([
      "surface edit",
      "save Unsaved dirty",
      "layers selected Rectangle, rect",
    ]);

    await openMenu("file");
    expect(visualState()).toContain("menu file");

    await press("n", { ctrl: true });
    await waitFor(() => visualState().includes("dialog Unsaved changes"), "unsaved contract");
    expect(visualState()).toContain("dialog Unsaved changes");
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.click();
    });
    await flush();

    await press("s", { ctrl: true });
    await waitFor(() => useProjectSessionStore.getState().projectPath !== null, "saved for conflict");
    browserNative.conflictWrites = 1;
    await act(async () => {
      useDocumentStore.getState().updateArtboard(useDocumentStore.getState().doc.activeArtboardId, { name: "Changed" });
    });
    let conflict: string[] = [];
    await act(async () => {
      const target = document.activeElement ?? document.body;
      target.dispatchEvent(
        new KeyboardEvent("keydown", { key: "s", bubbles: true, cancelable: true, ctrlKey: true }),
      );
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (document.querySelector("[role='alertdialog'] h2")?.textContent === "File changed on disk") {
          conflict = visualState();
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      document.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.click();
    });
    expect(conflict).toContain("dialog File changed on disk");
    expect(useDocumentStore.getState().doc.artboards[0]?.name).toBe("Changed");
  });

  it("keeps focus, status, compact, and high-contrast tokens in the theme", () => {
    const css = readFileSync("src/app/theme.css", "utf8");
    expect(css).toContain("--focus-ring: var(--accent)");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("--danger:");
    expect(css).toContain("--warn:");
    expect(css).toContain("--success:");
    expect(css).toContain("--selection-fill:");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain(`@media (max-width: ${COMPACT_LAYOUT_MAX_WIDTH}px)`);
    expect(WINDOW_MIN).toEqual({ width: 960, height: 600 });
    expect(css).toContain(".sr-only");
  });
});
