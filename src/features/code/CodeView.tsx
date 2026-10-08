import { useEffect, useMemo, useRef, useState } from "react";
import { documentToSvgString } from "../../shared/document/serialize";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { SplitPane } from "../../shared/ui/SplitPane";
import type { NoticeKind } from "../../shared/ui/notice";
import { CodeEditor } from "./CodeEditor";
import { CodePreview } from "./CodePreview";
import { docToCode } from "./codeSync";

export interface CodeViewProps {
  onNotify: (message: string, kind?: NoticeKind) => void;
}

/**
 * Editor and sandboxed preview. Text is the current document until an external
 * change replaces it. Debounced commits land in the next slice.
 */
export function CodeView(_props: CodeViewProps) {
  const doc = useDocumentStore((s) => s.doc);
  const [text, setText] = useState(() => docToCode(useDocumentStore.getState().doc));
  const seenDoc = useRef(doc);
  const previewSvg = useMemo(() => documentToSvgString(doc), [doc]);

  useEffect(() => {
    if (seenDoc.current === doc) return;
    seenDoc.current = doc;
    setText(docToCode(doc));
  }, [doc]);

  return (
    <div className="code-view">
      <SplitPane
        ratio={0.5}
        left={
          <div className="code-pane">
            <CodeEditor
              value={text}
              onChange={setText}
              onCaretChange={() => {}}
              onFlush={() => {}}
              errorLine={null}
              highlightLine={null}
              scrollToLineRequest={null}
            />
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
      `}</style>
    </div>
  );
}
