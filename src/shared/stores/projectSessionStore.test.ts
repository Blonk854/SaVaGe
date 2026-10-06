import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyDocument } from "../document/emptyDocument";
import { useDocumentStore } from "./documentStore";
import {
  acknowledgeUntitledDocument,
  projectSessionSnapshot,
  useProjectSessionStore,
} from "./projectSessionStore";

describe("project session snapshot", () => {
  beforeEach(() => {
    const doc = createEmptyDocument();
    useDocumentStore.getState().loadDocument(doc);
    useProjectSessionStore.getState().startSession({
      displayName: "Untitled",
      savedContents: null,
    });
  });

  it("acknowledges an untitled document without recording a save time", () => {
    const doc = useDocumentStore.getState().doc;
    acknowledgeUntitledDocument(doc);
    const snapshot = projectSessionSnapshot(doc);
    expect(snapshot.modified).toBe(false);
    expect(snapshot.saveLabel).toBe("Unsaved");
    expect(snapshot.projectPath).toBeNull();
    expect(snapshot.lastSavedAt).toBeNull();
    expect(snapshot.currentRevision).toBe(snapshot.savedRevision);
    expect(snapshot.recoveryStatus).toBe("none");
  });

  it("keeps selection out of the revision and marks a later edit modified", () => {
    const doc = useDocumentStore.getState().doc;
    acknowledgeUntitledDocument(doc);
    useDocumentStore.getState().setSelection(["missing"]);
    expect(projectSessionSnapshot(useDocumentStore.getState().doc).modified).toBe(false);

    useDocumentStore.getState().updateArtboard(doc.activeArtboardId, { width: 640 });
    const edited = projectSessionSnapshot(useDocumentStore.getState().doc);
    expect(edited.modified).toBe(true);
    expect(edited.saveLabel).toBe("Unsaved");
    expect(edited.currentRevision).not.toBe(edited.savedRevision);
  });

  it("records path, name, and save time only when the snapshot is acknowledged", () => {
    const before = Date.now();
    const snapshot = useProjectSessionStore
      .getState()
      .beginSave(projectSessionSnapshot(useDocumentStore.getState().doc).currentRevision);
    expect(
      useProjectSessionStore.getState().acknowledgeSave(
        snapshot,
        "C:\\projects\\poster.savage",
        "grant_poster",
        { size: 4, modifiedMs: 5 },
      ),
    ).toBe(true);
    const saved = projectSessionSnapshot(useDocumentStore.getState().doc);
    expect(saved.projectPath).toBe("C:\\projects\\poster.savage");
    expect(saved.displayName).toBe("poster");
    expect(saved.saveLabel).toBe("Saved");
    expect(saved.modified).toBe(false);
    expect(saved.lastSavedAt).toBeGreaterThanOrEqual(before);
  });

  it("ignores a recovery update from an older session epoch", () => {
    const session = useProjectSessionStore.getState();
    session.setRecoveryState(session.sessionId, session.recoveryEpoch, "pending", 2);
    expect(useProjectSessionStore.getState().recoveryStatus).toBe("pending");
    session.clearRecovery(session.sessionId);
    session.setRecoveryState(session.sessionId, session.recoveryEpoch, "checkpointed", 2);
    expect(useProjectSessionStore.getState().recoveryStatus).toBe("none");
    expect(useProjectSessionStore.getState().recoverySequence).toBe(0);
  });
});
