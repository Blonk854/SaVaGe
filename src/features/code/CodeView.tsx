import type { NoticeKind } from "../../shared/ui/notice";

export interface CodeViewProps {
  onNotify: (message: string, kind?: NoticeKind) => void;
}

/** Shell placeholder. The editor, preview, and sync loop land in the next step. */
export function CodeView(_props: CodeViewProps) {
  return <div className="code-view" />;
}
