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

/** Checkpoint progress for the current session. Selection and camera never change it. */
export type RecoverySnapshotStatus = "none" | "pending" | "checkpointed" | "failed";

interface ProjectSessionState {
  sessionId: string;
  displayName: string;
  projectPath: string | null;
  projectDestinationGrantId: string | null;
  fileFingerprint: FileFingerprint | null;
  /** Acknowledged serialization. This is the last-saved revision identity. */
  savedContents: string | null;
  pendingOperationId: string | null;
  lastSavedAt: number | null;
  recoveryStatus: RecoverySnapshotStatus;
  recoverySequence: number;
  recoveryEpoch: number;
  startSession: (options: {
    displayName: string;
    projectPath?: string | null;
    projectDestinationGrantId?: string | null;
    fileFingerprint?: FileFingerprint | null;
    savedContents?: string | null;
  }) => void;
  setRecoveryState: (
    sessionId: string,
    epoch: number,
    status: RecoverySnapshotStatus,
    sequence: number,
  ) => void;
  clearRecovery: (sessionId: string) => void;
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
  recoveryStatus: "none",
  recoverySequence: 0,
  recoveryEpoch: 0,

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
      recoveryStatus: "none",
      recoverySequence: 0,
      recoveryEpoch: get().recoveryEpoch + 1,
    }),

  setRecoveryState: (sessionId, epoch, status, sequence) => {
    const current = get();
    if (current.sessionId !== sessionId || current.recoveryEpoch !== epoch) return;
    set({ recoveryStatus: status, recoverySequence: sequence });
  },

  clearRecovery: (sessionId) => {
    const current = get();
    if (current.sessionId !== sessionId) return;
    set({
      recoveryEpoch: current.recoveryEpoch + 1,
      recoveryStatus: "none",
      recoverySequence: 0,
    });
  },

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

export function acknowledgeUntitledDocument(doc: SvgDocument): void {
  const current = useProjectSessionStore.getState();
  if (current.projectPath || current.savedContents !== null) return;
  useProjectSessionStore.setState({
    displayName: doc.name || current.displayName,
    savedContents: projectContents(doc),
  });
}

export interface ProjectSessionSnapshot {
  sessionId: string;
  projectPath: string | null;
  displayName: string;
  /** Deterministic serialization of the open document. */
  currentRevision: string;
  /** Acknowledged serialization from the last New, Open, or successful Save. */
  savedRevision: string | null;
  modified: boolean;
  saveLabel: ProjectSaveLabel;
  lastSavedAt: number | null;
  recoveryStatus: RecoverySnapshotStatus;
  recoverySequence: number;
}

export function projectSessionSnapshot(doc: SvgDocument): ProjectSessionSnapshot {
  const session = useProjectSessionStore.getState();
  const currentRevision = projectContents(doc);
  const savedRevision = session.savedContents;
  const modified = savedRevision !== currentRevision;
  const saveLabel: ProjectSaveLabel = !session.projectPath
    ? "Unsaved"
    : modified
      ? "Modified"
      : "Saved";
  return {
    sessionId: session.sessionId,
    projectPath: session.projectPath,
    displayName: session.displayName,
    currentRevision,
    savedRevision,
    modified,
    saveLabel,
    lastSavedAt: session.lastSavedAt,
    recoveryStatus: session.recoveryStatus,
    recoverySequence: session.recoverySequence,
  };
}

export function isProjectModified(doc: SvgDocument): boolean {
  return projectSessionSnapshot(doc).modified;
}

export type ProjectSaveLabel = "Unsaved" | "Modified" | "Saved";

export function projectSaveLabel(doc: SvgDocument): ProjectSaveLabel {
  if (!useProjectSessionStore.getState().projectPath) return "Unsaved";
  return isProjectModified(doc) ? "Modified" : "Saved";
}