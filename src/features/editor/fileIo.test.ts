import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyDocument } from "../../shared/document/emptyDocument";
import { useDocumentStore } from "../../shared/stores/documentStore";
import {
  isProjectModified,
  projectContents,
  useProjectSessionStore,
} from "../../shared/stores/projectSessionStore";
import {
  cancelExportJob,
  confirmDocumentReplacement,
  exportPng,
  exportSvg,
  openConvertedSvg,
  openFile,
  saveProject,
} from "./fileIo";
import { useUiStore } from "../../shared/stores/uiStore";
import { resolveUnsavedChangesPrompt } from "../../shared/ui/unsavedChangesPrompt";

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

  it("discards through the in-app prompt when no decision override is given", async () => {
    useDocumentStore.getState().updateArtboard(
      useDocumentStore.getState().doc.activeArtboardId,
      { width: 500 },
    );
    const result = confirmDocumentReplacement();
    resolveUnsavedChangesPrompt("discard");
    await expect(result).resolves.toBe(true);
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

  it("overwrites without a fingerprint after a conflict confirmation", async () => {
    const expectedFingerprint = { size: 10, modifiedMs: 20 };
    useProjectSessionStore.getState().startSession({
      displayName: "Project",
      projectPath: "C:\\project.savage",
      projectDestinationGrantId: "grant_1",
      fileFingerprint: expectedFingerprint,
      savedContents: projectContents(useDocumentStore.getState().doc),
    });
    const writes: Array<Record<string, unknown> | undefined> = [];
    let writeCount = 0;

    const result = await saveProject(
      false,
      {
        chooseOpen: async () => null,
        chooseSave: async () => {
          throw new Error("overwrite must not open Save As");
        },
        invoke: async (command, args) => {
          if (command !== "write_project_file") throw new Error(command);
          writes.push(args);
          writeCount += 1;
          if (writeCount === 1) {
            throw new Error("conflict: destination changed since it was opened or saved");
          }
          return { size: 12, modifiedMs: 22 };
        },
      },
      { decideConflict: async () => "overwrite" },
    );

    expect(result).toBe("saved");
    expect(writes[0]?.expectedFingerprint).toEqual(expectedFingerprint);
    expect(writes[1]?.expectedFingerprint).toBeNull();
    expect(useProjectSessionStore.getState().fileFingerprint).toEqual({
      size: 12,
      modifiedMs: 22,
    });
  });

  it("reloads through the destination grant after a conflict", async () => {
    const local = createEmptyDocument();
    useDocumentStore.getState().loadDocument(local);
    useProjectSessionStore.getState().startSession({
      displayName: "Project",
      projectPath: "C:\\project.savage",
      projectDestinationGrantId: "grant_1",
      fileFingerprint: { size: 10, modifiedMs: 20 },
      savedContents: projectContents(local),
    });
    useDocumentStore.getState().updateArtboard(local.activeArtboardId, { width: 640 });
    const diskDocument = createEmptyDocument();
    const commands: string[] = [];

    const result = await saveProject(
      false,
      {
        chooseOpen: async () => null,
        chooseSave: async () => {
          throw new Error("reload must not open Save As");
        },
        invoke: async (command, args) => {
          commands.push(command);
          if (command === "write_project_file") {
            throw new Error("conflict: destination changed since it was opened or saved");
          }
          if (command === "read_project_file") {
            expect(args?.destinationGrantId).toBe("grant_1");
            return {
              contents: projectContents(diskDocument),
              fingerprint: { size: 40, modifiedMs: 50 },
            };
          }
          throw new Error(command);
        },
      },
      { decideConflict: async () => "reload" },
    );

    expect(result).toBe("reloaded");
    expect(commands).toEqual(["write_project_file", "read_project_file"]);
    expect(useProjectSessionStore.getState().fileFingerprint).toEqual({
      size: 40,
      modifiedMs: 50,
    });
    expect(useDocumentStore.getState().doc.activeArtboardId).toBe(diskDocument.activeArtboardId);
    expect(isProjectModified(useDocumentStore.getState().doc)).toBe(false);
  });

  it("saves to a new path when the user chooses Save As after a conflict", async () => {
    useProjectSessionStore.getState().startSession({
      displayName: "Project",
      projectPath: "C:\\project.savage",
      projectDestinationGrantId: "grant_1",
      fileFingerprint: { size: 10, modifiedMs: 20 },
      savedContents: projectContents(useDocumentStore.getState().doc),
    });
    const writes: Array<Record<string, unknown> | undefined> = [];

    const result = await saveProject(
      false,
      {
        chooseOpen: async () => null,
        chooseSave: async () => ({
          path: "C:\\copy.savage",
          grantId: "grant_copy",
        }),
        invoke: async (command, args) => {
          if (command !== "write_project_file") throw new Error(command);
          writes.push(args);
          if (writes.length === 1) {
            throw new Error("conflict: destination changed since it was opened or saved");
          }
          return { size: 13, modifiedMs: 23 };
        },
      },
      { decideConflict: async () => "saveAs" },
    );

    expect(result).toBe("saved");
    expect(writes[0]?.destinationGrantId).toBe("grant_1");
    expect(writes[1]?.destinationGrantId).toBe("grant_copy");
    expect(writes[1]?.expectedFingerprint).toBeNull();
    expect(useProjectSessionStore.getState().projectPath).toBe("C:\\copy.savage");
  });

  it("cancels a conflicted save without changing the destination", async () => {
    useProjectSessionStore.getState().startSession({
      displayName: "Project",
      projectPath: "C:\\project.savage",
      projectDestinationGrantId: "grant_1",
      fileFingerprint: { size: 10, modifiedMs: 20 },
      savedContents: projectContents(useDocumentStore.getState().doc),
    });

    const result = await saveProject(
      false,
      {
        chooseOpen: async () => null,
        chooseSave: async () => {
          throw new Error("cancel must not open Save As");
        },
        invoke: async () => {
          throw new Error("conflict: destination changed since it was opened or saved");
        },
      },
      { decideConflict: async () => "cancel" },
    );

    expect(result).toBe("cancelled");
    expect(useProjectSessionStore.getState().projectPath).toBe("C:\\project.savage");
    expect(useProjectSessionStore.getState().fileFingerprint).toEqual({
      size: 10,
      modifiedMs: 20,
    });
  });

  it("keeps the open document when a conflict reload is not a valid project", async () => {
    const before = projectContents(useDocumentStore.getState().doc);
    useProjectSessionStore.getState().startSession({
      displayName: "Project",
      projectPath: "C:\\project.savage",
      projectDestinationGrantId: "grant_1",
      fileFingerprint: { size: 10, modifiedMs: 20 },
      savedContents: before,
    });

    await expect(
      saveProject(
        false,
        {
          chooseOpen: async () => null,
          chooseSave: async () => null,
          invoke: async (command) => {
            if (command === "write_project_file") {
              throw new Error("conflict: destination changed since it was opened or saved");
            }
            return { contents: "{", fingerprint: { size: 1, modifiedMs: 2 } };
          },
        },
        { decideConflict: async () => "reload" },
      ),
    ).rejects.toThrow();
    expect(projectContents(useDocumentStore.getState().doc)).toBe(before);
    expect(useProjectSessionStore.getState().projectPath).toBe("C:\\project.savage");
  });

  it("allows replacement after reload when the reloaded document is clean", async () => {
    useDocumentStore.getState().updateArtboard(
      useDocumentStore.getState().doc.activeArtboardId,
      { width: 500 },
    );
    const mayReplace = await confirmDocumentReplacement(
      async () => "save",
      async () => {
        useProjectSessionStore.getState().startSession({
          displayName: "Reloaded",
          projectPath: "C:\\project.savage",
          projectDestinationGrantId: "grant_1",
          savedContents: projectContents(useDocumentStore.getState().doc),
        });
        return "reloaded";
      },
    );

    expect(mayReplace).toBe(true);
    expect(isProjectModified(useDocumentStore.getState().doc)).toBe(false);
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

  it("rejects a future project version without writing the source", async () => {
    const before = projectContents(useDocumentStore.getState().doc);
    const commands: string[] = [];
    await expect(
      openFile({
        chooseOpen: async () => ({ path: "C:\\projects\\future.savage" }),
        chooseSave: async () => null,
        invoke: async (command) => {
          commands.push(command);
          return {
            contents: JSON.stringify({
              version: 2,
              name: "Future",
              nodes: {},
              rootChildIds: [],
            }),
            fingerprint: { size: 4, modifiedMs: 5 },
          };
        },
      }),
    ).rejects.toThrow(/version 2/);
    expect(commands).toEqual(["read_text_file"]);
    expect(projectContents(useDocumentStore.getState().doc)).toBe(before);
  });
});

describe("openConvertedSvg", () => {
  beforeEach(() => {
    const doc = createEmptyDocument();
    useDocumentStore.getState().loadDocument(doc);
    useProjectSessionStore.getState().startSession({
      displayName: "Original",
      projectPath: "C:\\projects\\original.savage",
      projectDestinationGrantId: "grant_original",
      savedContents: projectContents(doc),
    });
  });

  it("does not replace the open project when the user cancels", async () => {
    useDocumentStore.getState().updateArtboard(
      useDocumentStore.getState().doc.activeArtboardId,
      { width: 640 },
    );
    const before = projectContents(useDocumentStore.getState().doc);
    const opened = await openConvertedSvg("<svg xmlns='http://www.w3.org/2000/svg'></svg>", "logo", async () => "cancel");
    expect(opened).toBe(false);
    expect(useProjectSessionStore.getState().projectPath).toBe("C:\\projects\\original.savage");
    expect(projectContents(useDocumentStore.getState().doc)).toBe(before);
  });

  it("starts an unsaved session after discard so Save cannot overwrite the original", async () => {
    useDocumentStore.getState().updateArtboard(
      useDocumentStore.getState().doc.activeArtboardId,
      { width: 640 },
    );
    const opened = await openConvertedSvg(
      "<svg xmlns='http://www.w3.org/2000/svg'><rect width='1' height='1'/></svg>",
      "logo_flat",
      async () => "discard",
    );
    expect(opened).toBe(true);
    expect(useProjectSessionStore.getState().projectPath).toBeNull();
    expect(useProjectSessionStore.getState().displayName).toBe("logo_flat");
    expect(useProjectSessionStore.getState().projectDestinationGrantId).toBeNull();
    expect(isProjectModified(useDocumentStore.getState().doc)).toBe(true);
  });
});

describe("export jobs", () => {
  beforeEach(() => {
    useDocumentStore.getState().loadDocument(createEmptyDocument());
    useProjectSessionStore.getState().startSession({ displayName: "Export" });
    useUiStore.getState().setExporting(false);
  });

  it("requires native results to echo the job, session, and source revision", async () => {
    await expect(
      exportSvg(async (command) => {
        if (command === "pick_svg_destination") {
          return { path: "C:\\out\\mark.svg", grantId: "grant_svg" };
        }
        return { jobId: "other", sessionId: "other", sourceRevision: 0 };
      }, "job_export"),
    ).rejects.toThrow("stale or invalid");
    expect(useUiStore.getState().exporting).toBe(false);
  });

  it("keeps busy until cancel confirms CancelRequested", async () => {
    await expect(
      cancelExportJob("job_1", async () => ({ jobId: "other", state: "cancelRequested" })),
    ).rejects.toThrow("did not confirm");

    await expect(
      cancelExportJob("job_1", async (command, args) => {
        expect(command).toBe("cancel_export_job");
        expect(args).toEqual({ jobId: "job_1" });
        expect(useUiStore.getState().exportProgressLabel).toMatch(/Stopping/);
        return { jobId: "job_1", state: "cancelRequested" };
      }),
    ).resolves.toEqual({ jobId: "job_1", state: "cancelRequested" });
  });

  it("treats a cancelled native export as an honest stop, not a write", async () => {
    await expect(
      exportPng(2, async (command) => {
        if (command === "pick_png_destination") {
          return { path: "C:\\out\\mark.png", grantId: "grant_png" };
        }
        throw { code: "cancelled", message: "Export was cancelled before the write stage completed" };
      }, "job_png"),
    ).rejects.toThrow(/current stage finishes/);
    expect(useUiStore.getState().exporting).toBe(false);
  });
});