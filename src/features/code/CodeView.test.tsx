import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyDocument } from "../../shared/document/emptyDocument";
import {
  defaultStroke,
  defaultTransform,
  solidFill,
  type RectNode,
  type SvgDocument,
} from "../../shared/document/types";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { useUiStore } from "../../shared/stores/uiStore";
import { CodeView } from "./CodeView";
import { docToCode } from "./codeSync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function rectDocument(): SvgDocument {
  const doc = createEmptyDocument(120, 80, "Code");
  const rect: RectNode = {
    id: "r1",
    name: "Rectangle",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: defaultTransform(10, 20),
    type: "rect",
    width: 100,
    height: 80,
    rx: 0,
    ry: 0,
    fill: solidFill("#B8FF3C"),
    stroke: defaultStroke(),
  };
  doc.nodes.r1 = rect;
  doc.rootChildIds = ["r1"];
  return doc;
}

describe("CodeView debounce", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  const onNotify = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    onNotify.mockReset();
    useDocumentStore.getState().loadDocument(rectDocument());
    useDocumentStore.getState().setSelection(["r1"]);
    useUiStore.getState().clearDirty();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    host?.remove();
    root = null;
    host = null;
    vi.useRealTimers();
    useDocumentStore.getState().loadDocument(createEmptyDocument());
  });

  function mount(node: ReactNode = <CodeView onNotify={onNotify} />) {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => {
      root?.render(node);
    });
  }

  function textarea(): HTMLTextAreaElement {
    const el = host?.querySelector("textarea");
    if (!el) throw new Error("code view did not render");
    return el;
  }

  function typeInto(value: string) {
    const el = textarea();
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    act(() => {
      setter?.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  function previewSrc(): string {
    const img = host?.querySelector("img");
    if (!img) throw new Error("preview did not render");
    return decodeURIComponent(img.getAttribute("src")?.split(",")[1] ?? "");
  }

  function fillColor(): string {
    const node = useDocumentStore.getState().doc.nodes.r1 as RectNode;
    if (node.fill.type !== "solid") throw new Error("expected a solid fill");
    return node.fill.color;
  }

  it("renders the current document and keeps the preview on that document while typing", () => {
    mount();
    const source = docToCode(useDocumentStore.getState().doc);
    expect(textarea().value).toContain('id="r1"');
    expect(textarea().value).toContain('fill="#B8FF3C"');
    expect(previewSrc()).toContain('fill="#B8FF3C"');

    typeInto(source.replace('fill="#B8FF3C"', 'fill="#ff0000"'));
    expect(textarea().value).toContain('fill="#ff0000"');
    expect(fillColor()).toBe("#B8FF3C");
    expect(previewSrc()).toContain('fill="#B8FF3C"');
    expect(previewSrc()).not.toContain('fill="#ff0000"');
  });

  it("commits a fill edit after 250ms without rewriting the textarea", () => {
    mount();
    const source = textarea().value;
    const past = useDocumentStore.temporal.getState().pastStates.length;
    typeInto(source.replace('fill="#B8FF3C"', 'fill="#ff0000"'));

    act(() => {
      vi.advanceTimersByTime(249);
    });
    expect(fillColor()).toBe("#B8FF3C");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(fillColor()).toBe("#ff0000");
    expect(useDocumentStore.getState().selection).toEqual(["r1"]);
    expect(useDocumentStore.temporal.getState().pastStates.length).toBe(past + 1);
    expect(textarea().value).toBe(source.replace('fill="#B8FF3C"', 'fill="#ff0000"'));
    expect(previewSrc()).toContain('fill="#ff0000"');
    expect(useUiStore.getState().dirty).toBe(true);
    expect(host?.querySelector("[role='status']")?.textContent).toContain("Synced");
  });

  it("treats a whitespace-only edit as a no-op", () => {
    mount();
    const past = useDocumentStore.temporal.getState().pastStates.length;
    typeInto(`${textarea().value}\n\n`);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(useDocumentStore.temporal.getState().pastStates.length).toBe(past);
    expect(useUiStore.getState().dirty).toBe(false);
    expect(host?.querySelector("[role='status']")?.textContent).toContain("Synced");
    expect(textarea().value.endsWith("\n\n")).toBe(true);
  });

  it("keeps the saved document when the markup is broken", () => {
    mount();
    const source = textarea().value;
    typeInto(source.replace('id="r1"', 'id="r1'));
    act(() => {
      vi.advanceTimersByTime(250);
    });
    const status = host?.querySelector("[role='status']");
    expect(status?.textContent).toContain("Invalid SVG");
    expect(status?.querySelector("button")?.textContent).toMatch(/Go to line \d+/);
    expect(fillColor()).toBe("#B8FF3C");
    expect(previewSrc()).toBe(docToCode(useDocumentStore.getState().doc));
    expect(useDocumentStore.temporal.getState().pastStates).toHaveLength(0);
  });

  it("regenerates the editor when the document changes outside the editor", () => {
    mount();
    const source = textarea().value;
    typeInto(source.replace('fill="#B8FF3C"', 'fill="#ff0000"'));
    act(() => {
      vi.advanceTimersByTime(250);
    });
    act(() => {
      useDocumentStore.temporal.getState().undo();
    });
    expect(textarea().value).toContain('fill="#B8FF3C"');
    expect(previewSrc()).toContain('fill="#B8FF3C"');
    expect(host?.querySelector("[role='status']")?.textContent).toContain("Synced");
  });

  it("flushes a pending edit on blur", () => {
    mount();
    const el = textarea();
    typeInto(el.value.replace('fill="#B8FF3C"', 'fill="#00ff00"'));
    act(() => {
      el.focus();
      el.blur();
    });
    expect(fillColor()).toBe("#00ff00");
    const past = useDocumentStore.temporal.getState().pastStates.length;
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(fillColor()).toBe("#00ff00");
    expect(useDocumentStore.temporal.getState().pastStates.length).toBe(past);
  });

  it("reports unsupported markup without an extra undo step when the picture is unchanged", () => {
    mount();
    const past = useDocumentStore.temporal.getState().pastStates.length;
    typeInto(textarea().value.replace("</svg>", "<style>.a{}</style>\n</svg>"));
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(host?.querySelector("[role='status']")?.textContent).toContain(
      "Not supported, removed: 1 × <style>",
    );
    expect(useDocumentStore.temporal.getState().pastStates.length).toBe(past);
  });

  it("commits a pending valid edit on unmount and discards a broken one", () => {
    mount();
    typeInto(textarea().value.replace('fill="#B8FF3C"', 'fill="#112233"'));
    act(() => {
      root?.unmount();
    });
    host?.remove();
    root = null;
    host = null;
    expect(fillColor()).toBe("#112233");

    mount();
    typeInto(textarea().value.replace('id="r1"', 'id="r1'));
    act(() => {
      root?.unmount();
    });
    root = null;
    expect(onNotify).toHaveBeenCalledWith("Code changes with errors were discarded", "warn");
    expect(fillColor()).toBe("#112233");
  });
});
