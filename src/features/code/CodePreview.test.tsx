import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { createEmptyDocument } from "../../shared/document/emptyDocument";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { CodePreview } from "./CodePreview";
import { CodeView } from "./CodeView";
import { docToCode } from "./codeSync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("CodePreview", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    host?.remove();
    root = null;
    host = null;
    useDocumentStore.getState().loadDocument(createEmptyDocument());
  });

  function mount(node: ReactNode) {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => {
      root?.render(node);
    });
  }

  it("sandboxes the svg in an img data uri and toggles fit and background", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"></svg>`;
    mount(<CodePreview svg={svg} width={40} height={20} />);
    const img = host?.querySelector("img");
    const stage = host?.querySelector(".code-preview__stage") as HTMLElement | null;
    if (!img || !stage) throw new Error("preview did not render");
    expect(img.getAttribute("alt")).toBe("SVG preview");
    expect(img.getAttribute("src")).toBe("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg));
    expect(img.src.startsWith("blob:")).toBe(false);
    expect(img.style.maxWidth).toBe("100%");
    expect(stage.style.backgroundColor).toBe("rgb(255, 255, 255)");

    const fit = host?.querySelector<HTMLButtonElement>("button");
    const actual = [...(host?.querySelectorAll("button") ?? [])].find((button) => button.textContent === "100%");
    const dark = [...(host?.querySelectorAll("button") ?? [])].find((button) => button.textContent === "Dark");
    const light = [...(host?.querySelectorAll("button") ?? [])].find((button) => button.textContent === "Light");
    expect(fit?.getAttribute("aria-pressed")).toBe("true");

    act(() => {
      actual?.click();
      dark?.click();
    });
    expect(actual?.getAttribute("aria-pressed")).toBe("true");
    expect(fit?.getAttribute("aria-pressed")).toBe("false");
    expect(img.style.width).toBe("40px");
    expect(img.style.height).toBe("20px");
    expect(img.style.maxWidth).toBe("");
    expect(dark?.getAttribute("aria-pressed")).toBe("true");
    expect(stage.style.backgroundColor).toBe("rgb(27, 30, 35)");

    act(() => {
      light?.click();
    });
    expect(stage.style.backgroundColor).toBe("rgb(255, 255, 255)");
  });

  it("renders the document in the editor gutter and the sandboxed preview", () => {
    const doc = createEmptyDocument(320, 180, "Code pane");
    useDocumentStore.getState().loadDocument(doc);
    const source = docToCode(useDocumentStore.getState().doc);
    mount(<CodeView onNotify={() => {}} />);
    const textarea = host?.querySelector("textarea");
    const gutter = host?.querySelector("pre");
    const img = host?.querySelector("img");
    if (!textarea || !gutter || !img) throw new Error("code view did not render");
    expect(textarea.value).toBe(source);
    expect(textarea.value).toContain("<svg");
    expect(gutter.textContent?.split("\n").length).toBe(source.split("\n").length);
    expect(img.getAttribute("src")).toBe("data:image/svg+xml;charset=utf-8," + encodeURIComponent(source));

    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    act(() => {
      setter?.call(textarea, source + "\n");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(textarea.value).toBe(source + "\n");
    expect(img.getAttribute("src")).toBe("data:image/svg+xml;charset=utf-8," + encodeURIComponent(source));
  });
});
