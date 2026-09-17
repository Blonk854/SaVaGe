import { nanoid } from "nanoid";
import { create } from "zustand";
import type { SvgDocument } from "../document/types";

export interface SaveSnapshot {
  operationId: string;
  sessionId: string;
  contents: string;
  recoverySequence: number;
}

export interface FileFingerprint {
  size: number;
  modifiedMs: number;
}

interface ProjectSessionState {
  sessionId: string;
  displayName: string;
  projectPath: string | null;
  projectDestinationGrantId: string | null;
  fileFingerprint: FileFingerprint | null;
  savedContents: string | null;
  pendingOperationId: string | null;
  lastSavedAt: number | null;
  startSession: (options: {
    displayName: string;
    projectPath?: string | null;
    projectDestinationGrantId?: string | null;
    fileFingerprint?: FileFingerprint | null;
    savedContents?: string | null;
  }) => void;
  beginSave: (contents: string, recoverySequence?: number) => SaveSnapshot;
  acknowledgeSave: (
    snapshot: SaveSnapshot,
    projectPath: string,
    projectDestinationGrantId: string,
    fileFingerprint: FileFingerprint,
  ) => boolean;
  finishSaveFailure: (snapshot: SaveSnapshot) => void;
}

export function projectContents(doc: SvgDocument): string {
  return JSON.stringify(doc, null, 2);
}

export function fileDisplayName(path: string): string {
  return path.split(/[\\/]/).pop()?.replace(/\.savage$/i, "") || "Untitled";
}

export const useProjectSessionStore = create<ProjectSessionState>((set, get) => ({
  sessionId: nanoid(),
  displayName: "Untitled",
  projectPath: null,
  projectDestinationGrantId: null,
  fileFingerprint: null,
  savedContents: null,
  pendingOperationId: null,
  lastSavedAt: null,

  startSession: ({
    displayName,
    projectPath = null,
    projectDestinationGrantId = null,
    fileFingerprint = null,
    savedContents = null,
  }) =>
    set({
      sessionId: nanoid(),
      displayName,
      projectPath,
      projectDestinationGrantId,
      fileFingerprint,
      savedContents,
      pendingOperationId: null,
      lastSavedAt: projectPath && savedContents ? Date.now() : null,
    }),

  beginSave: (contents, recoverySequence = 0) => {
    const snapshot = {
      operationId: nanoid(),
      sessionId: get().sessionId,
      contents,
      recoverySequence,
    };
    set({ pendingOperationId: snapshot.operationId });
    return snapshot;
  },

  acknowledgeSave: (
    snapshot,
    projectPath,
    projectDestinationGrantId,
    fileFingerprint,
  ) => {
    const current = get();
    if (
      current.sessionId !== snapshot.sessionId ||
      current.pendingOperationId !== snapshot.operationId
    ) {
      return false;
    }
    set({
      projectPath,
      projectDestinationGrantId,
      fileFingerprint,
      displayName: fileDisplayName(projectPath),
      savedContents: snapshot.contents,
      pendingOperationId: null,
      lastSavedAt: Date.now(),
    });
    return true;
  },

  finishSaveFailure: (snapshot) => {
    const current = get();
    if (
      current.sessionId === snapshot.sessionId &&
      current.pendingOperationId === snapshot.operationId
    ) {
      set({ pendingOperationId: null });
    }
  },
}));

export function isProjectModified(doc: SvgDocument): boolean {
  return useProjectSessionStore.getState().savedContents !== projectContents(doc);
}

export type ProjectSaveLabel = "Unsaved" | "Modified" | "Saved";

export function projectSaveLabel(doc: SvgDocument): ProjectSaveLabel {
  if (!useProjectSessionStore.getState().projectPath) return "Unsaved";
  return isProjectModified(doc) ? "Modified" : "Saved";
}