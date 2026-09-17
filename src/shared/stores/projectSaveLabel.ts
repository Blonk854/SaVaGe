import { useDocumentStore } from "./documentStore";
import {
  projectContents,
  useProjectSessionStore,
  type ProjectSaveLabel,
} from "./projectSessionStore";

/** Title/status subscribe to this string so document edits do not re-render chrome. */
export function useProjectSaveLabel(): ProjectSaveLabel {
  const projectPath = useProjectSessionStore((s) => s.projectPath);
  const savedContents = useProjectSessionStore((s) => s.savedContents);
  return useDocumentStore((s) => {
    if (!projectPath) return "Unsaved";
    return savedContents !== projectContents(s.doc) ? "Modified" : "Saved";
  });
}
