import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyDocument } from "../../shared/document/emptyDocument";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { projectContents, useProjectSessionStore } from "../../shared/stores/projectSessionStore";
import {
  RECOVERY_IDLE_MS,
  RECOVERY_MAX_DIRTY_MS,
  RecoveryCoordinator,
  recoveryAllowsOpenOriginal,
  recoveryOfferMessage,
} from "./recovery";

describe("RecoveryCoordinator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
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
    await Promise.resolve();
    expect(useProjectSessionStore.getState().recoveryStatus).toBe("checkpointed");

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
    expect(useProjectSessionStore.getState().recoveryStatus).toBe("none");
    coordinator.dispose();
  });

  it("does not write a checkpoint after save covers that sequence", async () => {
    const write = vi.fn(async () => undefined);
    const coordinator = new RecoveryCoordinator({
      write,
      remove: async () => true,
      setTimer: setTimeout,
      clearTimer: clearTimeout,
    });
    const doc = useDocumentStore.getState().doc;
    const sessionId = useProjectSessionStore.getState().sessionId;
    useDocumentStore.getState().updateArtboard(doc.activeArtboardId, { width: 640 });
    coordinator.noteDocument(useDocumentStore.getState().doc);
    expect(useProjectSessionStore.getState().recoveryStatus).toBe("pending");
    expect(coordinator.cover(sessionId, 1)).toBe("covered");
    useProjectSessionStore.getState().clearRecovery(sessionId);
    await vi.advanceTimersByTimeAsync(RECOVERY_MAX_DIRTY_MS);
    expect(write).not.toHaveBeenCalled();
    expect(useProjectSessionStore.getState().recoveryStatus).toBe("none");
    coordinator.dispose();
  });

  it("keeps a newer checkpoint when an older save is covered", async () => {
    const write = vi.fn(async (_snapshot: { sequence: number }) => undefined);
    const remove = vi.fn(async () => true);
    const coordinator = new RecoveryCoordinator({
      write,
      remove,
      setTimer: setTimeout,
      clearTimer: clearTimeout,
    });
    const doc = useDocumentStore.getState().doc;
    const sessionId = useProjectSessionStore.getState().sessionId;
    useDocumentStore.getState().updateArtboard(doc.activeArtboardId, { width: 640 });
    coordinator.noteDocument(useDocumentStore.getState().doc);
    useDocumentStore.getState().updateArtboard(doc.activeArtboardId, { width: 720 });
    coordinator.noteDocument(useDocumentStore.getState().doc);
    expect(coordinator.cover(sessionId, 1)).toBe("kept-newer");
    await vi.advanceTimersByTimeAsync(RECOVERY_IDLE_MS);
    await Promise.resolve();
    expect(remove).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]?.[0]).toMatchObject({ sequence: 2 });
    expect(useProjectSessionStore.getState().recoveryStatus).toBe("checkpointed");
    coordinator.dispose();
  });

  it("continues past a covered sequence after the session epoch changes", async () => {
    const write = vi.fn(async (_snapshot: { sequence: number }) => undefined);
    const remove = vi.fn(async () => true);
    const coordinator = new RecoveryCoordinator({
      write,
      remove,
      setTimer: setTimeout,
      clearTimer: clearTimeout,
    });
    const saved = useDocumentStore.getState().doc;
    const sessionId = useProjectSessionStore.getState().sessionId;
    useDocumentStore.getState().updateArtboard(saved.activeArtboardId, { width: 640 });
    coordinator.noteDocument(useDocumentStore.getState().doc);
    expect(coordinator.cover(sessionId, 1)).toBe("covered");
    useProjectSessionStore.getState().clearRecovery(sessionId);
    useDocumentStore.getState().updateArtboard(saved.activeArtboardId, { width: 700 });
    coordinator.noteDocument(useDocumentStore.getState().doc);
    await vi.advanceTimersByTimeAsync(RECOVERY_IDLE_MS);
    await Promise.resolve();
    expect(remove).not.toHaveBeenCalled();
    expect(write.mock.calls[0]?.[0]).toMatchObject({ sequence: 2 });
    coordinator.dispose();
  });
});

describe("recovery offers", () => {
  it("warns when the original changed and does not offer a missing file", () => {
    const changed = recoveryOfferMessage({
      sourcePath: "C:\\projects\\Poster.savage",
      createdAtMs: Date.UTC(2026, 0, 2, 15, 4),
      originalRelation: "changed",
    });
    expect(changed).toContain("Poster changed after this checkpoint");
    expect(changed).toContain("does not replace that file");
    expect(
      recoveryAllowsOpenOriginal({
        sourcePath: "C:\\projects\\Poster.savage",
        originalRelation: "changed",
      }),
    ).toBe(true);

    const missing = recoveryOfferMessage({
      sourcePath: "C:\\projects\\Poster.savage",
      createdAtMs: Date.UTC(2026, 0, 2, 15, 4),
      originalRelation: "missing",
    });
    expect(missing).toContain("does not recreate it");
    expect(
      recoveryAllowsOpenOriginal({
        sourcePath: "C:\\projects\\Poster.savage",
        originalRelation: "missing",
      }),
    ).toBe(false);
    expect(
      recoveryAllowsOpenOriginal({ sourcePath: null, originalRelation: "untitled" }),
    ).toBe(false);
  });
});