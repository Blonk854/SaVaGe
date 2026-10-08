import { act, createRef, type Ref } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodeEditor, LINE_HEIGHT, type CodeEditorHandle, type CodeEditorProps } from "./CodeEditor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("CodeEditor", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    host?.remove();
    root = null;
    host = null;
  });

  function mount(overrides: Partial<CodeEditorProps> = {}, editorRef?: Ref<CodeEditorHandle>) {
    const props: CodeEditorProps = {
      value: "alpha\nbeta",
      onChange: vi.fn(),
      onCaretChange: vi.fn(),
      onFlush: vi.fn(),
      errorLine: null,
      highlightLine: null,
      scrollToLineRequest: null,
      ...overrides,
    };
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => {
      root?.render(<CodeEditor ref={editorRef} {...props} />);
    });
    const textarea = host.querySelector("textarea");
    const gutter = host.querySelector("pre");
    if (!textarea || !gutter) throw new Error("editor did not render");
    return { props, textarea, gutter };
  }

  function rerender(props: CodeEditorProps, editorRef?: Ref<CodeEditorHandle>) {
    act(() => {
      root?.render(<CodeEditor ref={editorRef} {...props} />);
    });
  }

  it("renders one gutter pre with a number per line", () => {
    const { textarea, gutter } = mount({ value: "a\nb\nc" });
    expect(textarea.value).toBe("a\nb\nc");
    expect(textarea.getAttribute("aria-label")).toBe("SVG source");
    expect(textarea.dataset.codeEditor).toBe("true");
    expect(gutter.tagName).toBe("PRE");
    expect(gutter.textContent).toBe("1\n2\n3");
    expect(host?.querySelectorAll(".code-editor__gutter").length).toBe(1);
  });

  it("reports edits, the caret, and blur", () => {
    const { props, textarea } = mount();
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    act(() => {
      setter?.call(textarea, "alpha\nbeta\n");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(props.onChange).toHaveBeenCalledWith("alpha\nbeta\n");

    act(() => {
      textarea.setSelectionRange(3, 3);
      textarea.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(props.onCaretChange).toHaveBeenCalledWith(3);

    act(() => {
      textarea.focus();
      textarea.blur();
    });
    expect(props.onFlush).toHaveBeenCalled();
  });

  it("inserts two spaces on Tab and leaves the editor on Escape", () => {
    const { props, textarea } = mount({ value: "ab" });
    act(() => {
      textarea.focus();
      textarea.setSelectionRange(1, 1);
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
      );
    });
    expect(props.onChange).toHaveBeenCalledWith("a  b");

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(document.activeElement).not.toBe(textarea);
  });

  it("flushes Ctrl+S without cancelling the keydown", () => {
    const { props, textarea } = mount();
    const event = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true });
    act(() => {
      textarea.dispatchEvent(event);
    });
    expect(props.onFlush).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(false);
  });

  it("draws error and highlight bands and scrolls them with the textarea", () => {
    const { gutter } = mount({ errorLine: 2, highlightLine: 1 });
    const bands = [...(host?.querySelectorAll(".code-editor__band") ?? [])];
    expect(bands).toHaveLength(2);
    expect((bands[0] as HTMLElement).style.top).toBe("20px");
    expect((bands[1] as HTMLElement).style.top).toBe("0px");

    const textarea = host?.querySelector("textarea");
    if (!textarea) throw new Error("missing textarea");
    act(() => {
      textarea.scrollTop = 40;
      textarea.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    expect(gutter.style.transform).toBe("translateY(-40px)");
    expect((bands[0] as HTMLElement).style.top).toBe("-20px");
  });

  it("scrolls to a requested line and moves the caret through the handle", () => {
    const editorRef = createRef<CodeEditorHandle>();
    const props: CodeEditorProps = {
      value: "ab\ncd\nef",
      onChange: vi.fn(),
      onCaretChange: vi.fn(),
      onFlush: vi.fn(),
      errorLine: null,
      highlightLine: null,
      scrollToLineRequest: null,
    };
    mount(props, editorRef);
    rerender({ ...props, scrollToLineRequest: { line: 3, nonce: 1 } }, editorRef);
    const textarea = host?.querySelector("textarea");
    const gutter = host?.querySelector("pre");
    if (!textarea || !gutter) throw new Error("editor did not render");
    expect(textarea.scrollTop).toBe((3 - 1) * LINE_HEIGHT);
    expect(gutter.style.transform).toBe(`translateY(-${(3 - 1) * LINE_HEIGHT}px)`);

    act(() => {
      editorRef.current?.setCaret(4);
    });
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(4);
    expect(textarea.scrollTop).toBe(LINE_HEIGHT);
  });
});
