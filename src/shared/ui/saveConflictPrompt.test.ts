import { describe, expect, it } from "vitest";
import {
  getSaveConflictPrompt,
  isSaveConflictMessage,
  promptSaveConflict,
  resolveSaveConflictPrompt,
  saveFailureMessage,
} from "./saveConflictPrompt";

describe("save conflict prompt", () => {
  it("maps native save failures to actionable messages", () => {
    expect(isSaveConflictMessage("conflict: destination changed since it was opened or saved")).toBe(
      true,
    );
    expect(saveFailureMessage("conflict: destination changed")).toContain("Reload");
    expect(saveFailureMessage("Failed to replace: The process cannot access the file because it is being used by another process. (os error 32)")).toMatch(
      /in use/i,
    );
    expect(saveFailureMessage("Failed to write temporary file: There is not enough space on the disk. (os error 112)")).toMatch(
      /disk is full/i,
    );
    expect(saveFailureMessage("Failed to create C:\\protected: Access is denied. (os error 5)")).toMatch(
      /permission/i,
    );
    expect(saveFailureMessage("Output is too large")).toBe("Output is too large");
  });

  it("cancels a second conflict prompt while one is already open", async () => {
    const first = promptSaveConflict();
    await expect(promptSaveConflict()).resolves.toBe("cancel");
    expect(getSaveConflictPrompt()?.question).toMatch(/changed on disk/i);
    resolveSaveConflictPrompt("overwrite");
    await expect(first).resolves.toBe("overwrite");
  });
});
