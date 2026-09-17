import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyDocument } from "../../shared/document/emptyDocument";
import { useDocumentStore } from "../../shared/stores/documentStore";
import {
  isProjectModified,
  projectContents,
  useProjectSessionStore,
} from "../../shared/stores/projectSessionStore";
import { confirmDocumentReplacement, openFile, saveProject } from "./fileIo";

describe("saveProject", () => {
  beforeEach(() => {
    const doc = createEmptyDocument();
    useDocumentStore.getState().loadDocument(doc);
    useProjectSessionStore.getState().startSession({
      displayName: "Untitled",
      savedContents: projectContents(doc),
    });
  });

  it("acknowledges only the immutable snapshot while later edits remain modified", async () => {
    let completeWrite!: () => void;
    const writeStarted = new Promise<void>((resolve) => {
      completeWrite = resolve;
    });
    let releaseWrite!: () => void;
    const writeBlocked = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const save = saveProject(false, {
      chooseOpen: async () => null,
      chooseSave: async () => ({
        path: "C:\\projects\\poster.savage",
        grantId: "grant_poster",
      }),
      invoke: async () => {
        completeWrite();
        await writeBlocked;
        return { size: 1, modifiedMs: 1 };
      },
    });
    await writeStarted;
    useDocumentStore.getState().updateArtboard(
      useDocumentStore.getState().doc.activeArtboardId,
      { width: 640 },
    );
    releaseWrite();

    expect(await save).toBe("saved");
    expect(useProjectSessionStore.getState().projectPath).toBe(
      "C:\\projects\\poster.savage",
    );
    expect(useProjectSessionStore.getState().projectDestinationGrantId).toBe(
      "grant_poster",
    );
    expect(isProjectModified(useDocumentStore.getState().doc)).toBe(true);
  });

  it("keeps the prior path when Save As is cancelled", async () => {
    useProjectSessionStore.getState().startSession({
      displayName: "Original",
      projectPath: "C:\\projects\\original.savage",
      projectDestinationGrantId: "grant_original",
      savedContents: projectContents(useDocumentStore.getState().doc),
    });

    const result = await saveProject(true, {
      chooseOpen: async () => null,
      chooseSave: async () => null,
      invoke: async () => ({ size: 1, modifiedMs: 1 }),
    });

    expect(result).toBe("cancelled");
    expect(useProjectSessionStore.getState().projectPath).toBe(
      "C:\\projects\\original.savage",
    );
    expect(useProjectSessionStore.getState().projectDestinationGrantId).toBe(
      "grant_original",
    );
  });

  it("ignores a completion from an old session", () => {
    const oldSession = useProjectSessionStore.getState();
    const snapshot = oldSession.beginSave(projectContents(useDocumentStore.getState().doc));
    useProjectSessionStore.getState().startSession({ displayName: "New" });

    expect(
      useProjectSessionStore
        .getState()
        .acknowledgeSave(snapshot, "C:\\old.savage", "grant_old", {
          size: 1,
          modifiedMs: 1,
        }),
    ).toBe(false);
    expect(useProjectSessionStore.getState().projectPath).toBeNull();
  });

  it("does not replace when an edit occurs during the requested save", async () => {
    useDocumentStore.getState().updateArtboard(
      useDocumentStore.getState().doc.activeArtboardId,
      { width: 500 },
    );
    const mayReplace = await confirmDocumentReplacement(
      async () => "save",
      async () => {
        const snapshot = useProjectSessionStore
          .getState()
          .beginSave(projectContents(useDocumentStore.getState().doc));
        useDocumentStore.getState().updateArtboard(
          useDocumentStore.getState().doc.activeArtboardId,
          { width: 600 },
        );
        useProjectSessionStore
          .getState()
          .acknowledgeSave(snapshot, "C:\\project.savage", "grant_1", {
            size: 1,
            modifiedMs: 1,
          });
        return "saved";
      },
    );

    expect(mayReplace).toBe(false);
    expect(isProjectModified(useDocumentStore.getState().doc)).toBe(true);
  });

  it("deduplicates concurrent replacement decisions", async () => {
    useDocumentStore.getState().updateArtboard(
      useDocumentStore.getState().doc.activeArtboardId,
      { width: 500 },
    );
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let prompts = 0;
    const decide = async () => {
      prompts += 1;
      await blocked;
      return "discard" as const;
    };

    const first = confirmDocumentReplacement(decide);
    const second = confirmDocumentReplacement(decide);
    release();

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(prompts).toBe(1);
  });

  it("becomes clean when undo returns to the saved payload and modified on redo", () => {
    const artboardId = useDocumentStore.getState().doc.activeArtboardId;
    useDocumentStore.getState().updateArtboard(artboardId, { width: 500 });
    const snapshot = useProjectSessionStore
      .getState()
      .beginSave(projectContents(useDocumentStore.getState().doc));
    useProjectSessionStore
      .getState()
      .acknowledgeSave(snapshot, "C:\\project.savage", "grant_1", {
        size: 10,
        modifiedMs: 20,
      });
    useDocumentStore.getState().updateArtboard(artboardId, { width: 600 });

    expect(isProjectModified(useDocumentStore.getState().doc)).toBe(true);
    useDocumentStore.temporal.getState().undo();
    expect(isProjectModified(useDocumentStore.getState().doc)).toBe(false);
    useDocumentStore.temporal.getState().redo();
    expect(isProjectModified(useDocumentStore.getState().doc)).toBe(true);
  });

  it("forwards the recorded fingerprint on repeat Save", async () => {
    const expectedFingerprint = { size: 10, modifiedMs: 20 };
    useProjectSessionStore.getState().startSession({
      displayName: "Project",
      projectPath: "C:\\project.savage",
      projectDestinationGrantId: "grant_1",
      fileFingerprint: expectedFingerprint,
      savedContents: projectContents(useDocumentStore.getState().doc),
    });
    let writeCommand: string | undefined;
    let writeArgs: Record<string, unknown> | undefined;

    await saveProject(false, {
      chooseOpen: async () => null,
      chooseSave: async () => {
        throw new Error("repeat Save must not open a dialog");
      },
      invoke: async (command, args) => {
        writeCommand = command;
        writeArgs = args;
        return { size: 11, modifiedMs: 21 };
      },
    });

    expect(writeCommand).toBe("write_project_file");
    expect(writeArgs?.destinationGrantId).toBe("grant_1");
    expect(writeArgs).not.toHaveProperty("path");
    expect(writeArgs?.expectedFingerprint).toEqual(expectedFingerprint);
    expect(useProjectSessionStore.getState().fileFingerprint).toEqual({
      size: 11,
      modifiedMs: 21,
    });
  });

  it("adopts the native project destination grant when opening a project", async () => {
    const document = createEmptyDocument();
    const result = await openFile({
      chooseOpen: async () => ({
        path: "C:\\projects\\opened.savage",
        projectDestinationGrantId: "grant_opened",
      }),
      chooseSave: async () => null,
      invoke: async () => ({
        contents: projectContents(document),
        fingerprint: { size: 12, modifiedMs: 34 },
      }),
    });

    expect(result).toBe("C:\\projects\\opened.savage");
    expect(useProjectSessionStore.getState().projectPath).toBe(
      "C:\\projects\\opened.savage",
    );
    expect(useProjectSessionStore.getState().projectDestinationGrantId).toBe(
      "grant_opened",
    );
  });
});