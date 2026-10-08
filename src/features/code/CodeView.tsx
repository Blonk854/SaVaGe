import { useEffect, useMemo, useRef, useState } from "react";
import { documentToSvgString } from "../../shared/document/serialize";
import type { SvgDocument } from "../../shared/document/types";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { useUiStore } from "../../shared/stores/uiStore";
import { SplitPane } from "../../shared/ui/SplitPane";
import type { NoticeKind } from "../../shared/ui/notice";
import { CodeEditor, type CodeEditorHandle } from "./CodeEditor";
import { CodePreview } from "./CodePreview";
import { codeToDoc, docToCode, type CodeToDocResult } from "./codeSync";
import { elementIdAtOffset, lineOfElementId, offsetOfLine } from "./caretElement";

export interface CodeViewProps {
  onNotify: (message: string, kind?: NoticeKind) => void;
}

const DEBOUNCE_MS = 250;

type Status =
  | { kind: "synced" }
  | { kind: "error"; message: string; line?: number; column?: number }
  | { kind: "warning"; message: string };

function formatDropped(dropped: Map<string, number>): string {
  const parts = [...dropped].map(([key, count]) => `${count} × ${key}`);
  return `Not supported, removed: ${parts.join(", ")}`;
}

function statusFromResult(result: CodeToDocResult): Status {
  if (!result.ok) {
    return { kind: "error", message: result.error, line: result.line, column: result.column };
  }
  if (result.dropped.size > 0) return { kind: "warning", message: formatDropped(result.dropped) };
  return { kind: "synced" };
}

/**
 * Writes `value` into the document store when it parses and differs from the last synced text.
 * The stored document is the one `commitDocument` keeps, so echo suppression can ignore that update.
 */
function commitText(
  value: string,
  lastSyncedText: { current: string },
  lastCommittedDoc: { current: SvgDocument },
): CodeToDocResult | "unchanged" {
  if (value === lastSyncedText.current) return "unchanged";
  const current = useDocumentStore.getState().doc;
  const result = codeToDoc(value, current);
  if (!result.ok) return result;
  lastSyncedText.current = value;
  if (!result.noop) {
    const store = useDocumentStore.getState();
    store.commitDocument(result.doc, store.selection);
    lastCommittedDoc.current = useDocumentStore.getState().doc;
    useUiStore.getState().markDirty();
  }
  return result;
}

/**
 * Editor and sandboxed preview. Edits wait 250ms, then commit through `codeToDoc`.
 * The preview is the saved document, so a parse error keeps the last good picture.
 */
export function CodeView({ onNotify }: CodeViewProps) {
  const doc = useDocumentStore((s) => s.doc);
  const selection = useDocumentStore((s) => s.selection);
  const [text, setText] = useState(() => docToCode(useDocumentStore.getState().doc));
  const [status, setStatus] = useState<Status>({ kind: "synced" });
  const [scrollReq, setScrollReq] = useState<{ line: number; nonce: number } | null>(null);
  const textRef = useRef(text);
  const lastCommittedDocRef = useRef(useDocumentStore.getState().doc);
  const lastSyncedTextRef = useRef(text);
  const timerRef = useRef<number | null>(null);
  const editorRef = useRef<CodeEditorHandle>(null);
  const selectionFromCaretRef = useRef(false);
  const onNotifyRef = useRef(onNotify);
  onNotifyRef.current = onNotify;

  const previewSvg = useMemo(() => documentToSvgString(doc), [doc]);
  const errorLine = status.kind === "error" && status.line != null ? status.line : null;

  const selectionKey = selection.join("\n");
  const highlightLine = useMemo(() => {
    const id = useDocumentStore.getState().selection[0];
    return id ? lineOfElementId(text, id) : null;
    // selectionKey stands in for the selection array so the memo tracks it by value.
  }, [text, selectionKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // A caret-driven selection already has the caret on the element; scrolling
    // would yank the view, so swallow that one echo.
    if (selectionFromCaretRef.current) {
      selectionFromCaretRef.current = false;
      return;
    }
    if (highlightLine === null) return;
    setScrollReq((r) => ({ line: highlightLine, nonce: (r?.nonce ?? 0) + 1 }));
  }, [selectionKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCaret = (offset: number) => {
    const id = elementIdAtOffset(textRef.current, offset);
    if (!id) return;
    const store = useDocumentStore.getState();
    if (!store.doc.nodes[id]) return;
    if (store.selection.length === 1 && store.selection[0] === id) return;
    selectionFromCaretRef.current = true;
    store.setSelection([id]);
  };

  const commit = (value: string) => {
    const result = commitText(value, lastSyncedTextRef, lastCommittedDocRef);
    if (result === "unchanged") return;
    setStatus(statusFromResult(result));
  };

  const schedule = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      commit(textRef.current);
    }, DEBOUNCE_MS);
  };

  const flush = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    commit(textRef.current);
  };

  const handleChange = (next: string) => {
    textRef.current = next;
    setText(next);
    schedule();
  };

  useEffect(() => {
    if (doc === lastCommittedDocRef.current) return;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const next = docToCode(doc);
    lastCommittedDocRef.current = doc;
    lastSyncedTextRef.current = next;
    textRef.current = next;
    setText(next);
    setStatus({ kind: "synced" });
  }, [doc]);

  useEffect(() => {
    const timer = timerRef;
    const synced = lastSyncedTextRef;
    const committed = lastCommittedDocRef;
    const latest = textRef;
    const notify = onNotifyRef;
    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      const result = commitText(latest.current, synced, committed);
      if (result !== "unchanged" && !result.ok) {
        notify.current("Code changes with errors were discarded", "warn");
      }
    };
  }, []);

  return (
    <div className="code-view">
      <SplitPane
        ratio={0.5}
        left={
          <div className="code-pane">
            <CodeEditor
              ref={editorRef}
              value={text}
              onChange={handleChange}
              onCaretChange={handleCaret}
              onFlush={flush}
              errorLine={errorLine}
              highlightLine={highlightLine}
              scrollToLineRequest={scrollReq}
            />
            <div className="code-status" role="status" aria-live="polite">
              {status.kind === "error" ? (
                <>
                  <span>✕ {status.message}</span>
                  {status.line != null && (
                    <button
                      type="button"
                      onClick={() => editorRef.current?.setCaret(offsetOfLine(text, status.line ?? 1))}
                    >
                      Go to line {status.line}
                    </button>
                  )}
                </>
              ) : status.kind === "warning" ? (
                <span>⚠ {status.message}</span>
              ) : (
                <span>Synced</span>
              )}
            </div>
          </div>
        }
        right={<CodePreview svg={previewSvg} width={doc.width} height={doc.height} />}
      />
      <style>{`
        .code-view {
          height: 100%;
          padding: 0.75rem;
          min-height: 0;
        }
        .code-pane {
          height: 100%;
          min-height: 0;
          display: flex;
          flex-direction: column;
        }
        .code-pane .code-editor {
          flex: 1;
        }
        .code-status {
          flex: none;
          display: flex;
          gap: 0.75rem;
          align-items: center;
          margin-top: 0.4rem;
          font-size: var(--text-xs);
          color: var(--fg-1);
        }
        .code-status button {
          border: 1px solid var(--border);
          background: var(--bg-2);
          border-radius: 8px;
          padding: 0.25rem 0.5rem;
          font-size: var(--text-xs);
        }
      `}</style>
    </div>
  );
}
