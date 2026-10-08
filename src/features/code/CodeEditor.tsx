import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type SyntheticEvent,
} from "react";

export const LINE_HEIGHT = 20;

export interface CodeEditorProps {
  value: string;
  onChange: (next: string) => void;
  onCaretChange: (offset: number) => void;
  /** Called on blur and on Ctrl/Cmd+S before the shell saves. */
  onFlush: () => void;
  errorLine: number | null;
  highlightLine: number | null;
  scrollToLineRequest: { line: number; nonce: number } | null;
}

export interface CodeEditorHandle {
  setCaret: (offset: number) => void;
}

const EDITOR_FONT =
  "ui-monospace, Consolas, monospace";

function lineNumberAt(text: string, offset: number): number {
  let line = 1;
  const end = Math.min(Math.max(offset, 0), text.length);
  for (let i = 0; i < end; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function scrollTopForLine(line: number, clientHeight: number): number {
  return Math.max(0, (line - 1) * LINE_HEIGHT - clientHeight / 2);
}

export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor(
  { value, onChange, onCaretChange, onFlush, errorLine, highlightLine, scrollToLineRequest },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const scrollNonce = scrollToLineRequest?.nonce ?? null;
  const scrollLine = scrollToLineRequest?.line ?? null;

  const gutter = useMemo(
    () => Array.from({ length: value.split("\n").length }, (_, i) => i + 1).join("\n"),
    [value],
  );

  const revealLine = useCallback((line: number) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const top = scrollTopForLine(line, ta.clientHeight);
    ta.scrollTop = top;
    setScrollTop(top);
  }, []);

  useEffect(() => {
    if (scrollNonce === null || scrollLine === null) return;
    revealLine(scrollLine);
  }, [revealLine, scrollNonce, scrollLine]);

  useImperativeHandle(
    ref,
    () => ({
      setCaret(offset: number) {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.focus();
        ta.setSelectionRange(offset, offset);
        revealLine(lineNumberAt(ta.value, offset));
      },
    }),
    [revealLine],
  );

  const reportCaret = (ta: HTMLTextAreaElement) => {
    onCaretChange(ta.selectionStart ?? 0);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = event.currentTarget;
    if (event.key === "Tab" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      event.preventDefault();
      ta.setRangeText("  ", ta.selectionStart ?? 0, ta.selectionEnd ?? 0, "end");
      onChange(ta.value);
      return;
    }
    if (event.key === "Escape") {
      ta.blur();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      onFlush();
    }
  };

  return (
    <div className="code-editor">
      {errorLine != null && (
        <div
          className="code-editor__band code-editor__band--error"
          style={{ top: (errorLine - 1) * LINE_HEIGHT - scrollTop }}
        />
      )}
      {highlightLine != null && (
        <div
          className="code-editor__band code-editor__band--highlight"
          style={{ top: (highlightLine - 1) * LINE_HEIGHT - scrollTop }}
        />
      )}
      <div className="code-editor__gutter-clip">
        <pre className="code-editor__gutter" aria-hidden="true" style={{ transform: `translateY(-${scrollTop}px)` }}>
          {gutter}
        </pre>
      </div>
      <textarea
        ref={textareaRef}
        className="code-editor__input"
        wrap="off"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        data-code-editor="true"
        aria-label="SVG source"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        onSelect={(event: SyntheticEvent<HTMLTextAreaElement>) => reportCaret(event.currentTarget)}
        onClick={(event: MouseEvent<HTMLTextAreaElement>) => reportCaret(event.currentTarget)}
        onKeyUp={(event) => reportCaret(event.currentTarget)}
        onKeyDown={onKeyDown}
        onBlur={onFlush}
      />
      <style>{`
        .code-editor {
          position: relative;
          display: grid;
          grid-template-columns: auto 1fr;
          height: 100%;
          min-height: 0;
          min-width: 0;
          background: var(--bg-1);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          overflow: hidden;
        }
        .code-editor__gutter-clip {
          overflow: hidden;
          height: 100%;
          min-height: 0;
          position: relative;
          z-index: 1;
        }
        .code-editor__gutter {
          margin: 0;
          padding: 0 10px 0 8px;
          font-family: ${EDITOR_FONT};
          font-size: 12.5px;
          line-height: ${LINE_HEIGHT}px;
          text-align: right;
          color: var(--fg-disabled);
          user-select: none;
          background: transparent;
        }
        .code-editor__band {
          position: absolute;
          left: 0;
          right: 0;
          height: ${LINE_HEIGHT}px;
          pointer-events: none;
          z-index: 0;
        }
        .code-editor__band--error { background: var(--danger-fill); }
        .code-editor__band--highlight { background: var(--selection-fill); }
        .code-editor__input {
          position: relative;
          z-index: 1;
          min-width: 0;
          min-height: 0;
          font-family: ${EDITOR_FONT};
          font-size: 12.5px;
          line-height: ${LINE_HEIGHT}px;
          white-space: pre;
          tab-size: 2;
          resize: none;
          width: 100%;
          height: 100%;
          padding: 0 8px;
          border: 0;
          background: transparent;
          color: var(--fg-0);
          outline: none;
          overflow: auto;
        }
      `}</style>
    </div>
  );
});
