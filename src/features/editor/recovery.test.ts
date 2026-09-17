import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyDocument } from "../../shared/document/emptyDocument";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { projectContents, useProjectSessionStore } from "../../shared/stores/projectSessionStore";
import {
  RECOVERY_IDLE_MS,
  RECOVERY_MAX_DIRTY_MS,
  RecoveryCoordinator,
} from "./recovery";

describe("RecoveryCoordinator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const doc = createEmptyDocument();
    useDocumentStore.getState().loadDocument(doc);
    useProjectSessionStore.getState().startSession({
      displayName: "Poster",
      savedContents: projectContents(doc),
    });
  });

  it("writes after idle and never lets continuous edits exceed the maximum interval", async () => {
    const write = vi.fn(async () => undefined);
    const coordinator = new RecoveryCoordinator({
      write,
      remove: async () => false,
      setTimer: setTimeout,
      clearTimer: clearTimeout,
    });
    const doc = useDocumentStore.getState().doc;

    useDocumentStore.getState().updateArtboard(doc.activeArtboardId, { width: 401 });
    coordinator.noteDocument(useDocumentStore.getState().doc);
    await vi.advanceTimersByTimeAsync(RECOVERY_IDLE_MS - 1);
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(write).toHaveBeenCalledTimes(1);

    for (let elapsed = 0; elapsed < RECOVERY_MAX_DIRTY_MS; elapsed += 1_000) {
      useDocumentStore.getState().updateArtboard(doc.activeArtboardId, { width: 500 + elapsed });
      coordinator.noteDocument(useDocumentStore.getState().doc);
      await vi.advanceTimersByTimeAsync(1_000);
    }
    expect(write).toHaveBeenCalledTimes(2);
    coordinator.dispose();
  });

  it("deletes only through the current sequence when content returns to saved state", async () => {
    const remove = vi.fn(async () => true);
    const coordinator = new RecoveryCoordinator({
      write: async () => undefined,
      remove,
      setTimer: setTimeout,
      clearTimer: clearTimeout,
    });
    const saved = useDocumentStore.getState().doc;
    useDocumentStore.getState().updateArtboard(saved.activeArtboardId, { width: 640 });
    coordinator.noteDocument(useDocumentStore.getState().doc);
    coordinator.noteDocument(saved);
    await Promise.resolve();

    expect(remove).toHaveBeenCalledWith(
      useProjectSessionStore.getState().sessionId,
      1,
    );
    coordinator.dispose();
  });
});