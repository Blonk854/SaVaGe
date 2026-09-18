import { invoke, isTauri } from "@tauri-apps/api/core";
import { askLabeledYesNo } from "../../shared/ui/nativeConfirm";
import type { SvgDocument } from "../../shared/document/types";
import { parseSavageDocument } from "../../shared/document/parseSavage";
import { recordDiagnostic } from "../../shared/diagnostics";
import { useDocumentStore } from "../../shared/stores/documentStore";
import {
  fileDisplayName,
  isProjectModified,
  projectContents,
  useProjectSessionStore,
} from "../../shared/stores/projectSessionStore";

export const RECOVERY_IDLE_MS = 1_500;
export const RECOVERY_MAX_DIRTY_MS = 10_000;

interface RecoverySnapshot {
  sessionId: string;
  sourcePath: string | null;
  sourceFingerprint: { size: number; modifiedMs: number } | null;
  schemaVersion: number;
  sequence: number;
  contents: string;
}

interface RecoveryDependencies {
  write: (snapshot: RecoverySnapshot) => Promise<void>;
  remove: (sessionId: string, throughSequence: number) => Promise<boolean>;
  setTimer: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
}

const defaultDependencies: RecoveryDependencies = {
  write: (request) => invoke("write_recovery", { request }),
  remove: (sessionId, throughSequence) =>
    invoke("delete_recovery", { sessionId, throughSequence }),
  setTimer: (callback, delay) => setTimeout(callback, delay),
  clearTimer: (timer) => clearTimeout(timer),
};

export class RecoveryCoordinator {
  private sessionId: string | null = null;
  private sequence = 0;
  private latest: RecoverySnapshot | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private maximumTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly dependencies: RecoveryDependencies = defaultDependencies,
    private onError: (message: string) => void = () => undefined,
  ) {}

  setErrorHandler(onError: (message: string) => void): void {
    this.onError = onError;
  }

  noteDocument(doc: SvgDocument): void {
    const session = useProjectSessionStore.getState();
    if (this.sessionId !== session.sessionId) {
      this.cancelTimers();
      this.sessionId = session.sessionId;
      this.sequence = 0;
    }
    const contents = projectContents(doc);
    if (!isProjectModified(doc)) {
      const throughSequence = this.sequence;
      this.cancelTimers();
      this.latest = null;
      if (throughSequence > 0) {
        void this.dependencies.remove(session.sessionId, throughSequence).catch((error) =>
          this.report(error),
        );
      }
      return;
    }

    this.sequence += 1;
    this.latest = {
      sessionId: session.sessionId,
      sourcePath: session.projectPath,
      sourceFingerprint: session.fileFingerprint,
      schemaVersion: doc.version,
      sequence: this.sequence,
      contents,
    };
    if (this.idleTimer) this.dependencies.clearTimer(this.idleTimer);
    this.idleTimer = this.dependencies.setTimer(() => this.flush(), RECOVERY_IDLE_MS);
    this.maximumTimer ??= this.dependencies.setTimer(
      () => this.flush(),
      RECOVERY_MAX_DIRTY_MS,
    );
  }

  sequenceFor(sessionId: string, contents: string): number {
    return this.latest?.sessionId === sessionId && this.latest.contents === contents
      ? this.latest.sequence
      : 0;
  }

  async discard(sessionId = this.sessionId, throughSequence = this.sequence): Promise<boolean> {
    if (!sessionId || throughSequence <= 0) return false;
    return this.dependencies.remove(sessionId, throughSequence);
  }

  dispose(): void {
    this.cancelTimers();
    this.latest = null;
  }

  private flush(): void {
    const snapshot = this.latest;
    this.cancelTimers();
    if (!snapshot) return;
    void this.dependencies.write(snapshot).catch((error) => this.report(error));
  }

  private cancelTimers(): void {
    if (this.idleTimer) this.dependencies.clearTimer(this.idleTimer);
    if (this.maximumTimer) this.dependencies.clearTimer(this.maximumTimer);
    this.idleTimer = null;
    this.maximumTimer = null;
  }

  private report(error: unknown): void {
    const detail = error instanceof Error ? error.message : String(error);
    recordDiagnostic({
      level: "error",
      code: "recovery_failed",
      operation: "recovery",
      sessionId: this.sessionId ?? undefined,
      stage: "checkpoint",
      message: detail,
    });
    this.onError(`Recovery checkpoint failed: ${detail}`);
  }
}

const coordinator = new RecoveryCoordinator();

export function recoverySequenceFor(sessionId: string, contents: string): number {
  return coordinator.sequenceFor(sessionId, contents);
}

export async function discardCurrentRecovery(
  sessionId?: string,
  throughSequence?: number,
): Promise<boolean> {
  if (!isTauri()) return false;
  return coordinator.discard(sessionId, throughSequence);
}

export function startRecoveryScheduler(onError: (message: string) => void): () => void {
  if (!isTauri()) return () => undefined;
  coordinator.setErrorHandler(onError);
  const unsubscribe = useDocumentStore.subscribe((state, previous) => {
    if (state.doc !== previous.doc) coordinator.noteDocument(state.doc);
  });
  return () => {
    unsubscribe();
    coordinator.dispose();
    coordinator.setErrorHandler(() => undefined);
  };
}

interface RecoveryCandidate extends RecoverySnapshot {
  formatVersion: number;
  applicationVersion: string;
  createdAtMs: number;
  integrity: string;
}

interface RecoveryScan {
  candidates: RecoveryCandidate[];
  issues: { fileName: string; reason: string }[];
}

function isRecoveryScan(value: unknown): value is RecoveryScan {
  if (!value || typeof value !== "object") return false;
  const scan = value as Partial<RecoveryScan>;
  return Array.isArray(scan.candidates) && Array.isArray(scan.issues);
}

async function openOriginal(candidate: RecoveryCandidate): Promise<void> {
  if (!candidate.sourcePath) return;
  const result = await invoke<unknown>("read_text_file", { path: candidate.sourcePath });
  if (!result || typeof result !== "object") throw new Error("Original project read was invalid");
  const contents = (result as { contents?: unknown }).contents;
  const fingerprint = (result as { fingerprint?: unknown }).fingerprint;
  if (
    typeof contents !== "string" ||
    !fingerprint ||
    typeof fingerprint !== "object" ||
    typeof (fingerprint as { size?: unknown }).size !== "number" ||
    typeof (fingerprint as { modifiedMs?: unknown }).modifiedMs !== "number"
  ) {
    throw new Error("Original project read was invalid");
  }
  const document = parseSavageDocument(contents);
  useProjectSessionStore.getState().startSession({
    displayName: fileDisplayName(candidate.sourcePath),
    projectPath: candidate.sourcePath,
    fileFingerprint: fingerprint as { size: number; modifiedMs: number },
    savedContents: projectContents(document),
  });
  useDocumentStore.getState().loadDocument(document);
}

export async function offerRecoveryOnStartup(
  notify: (message: string) => void,
): Promise<void> {
  if (!isTauri()) return;
  const value = await invoke<unknown>("list_recoveries");
  if (!isRecoveryScan(value)) throw new Error("Native recovery scan returned invalid data");
  if (value.issues.length) {
    notify(`${value.issues.length} recovery file(s) could not be read and were preserved`);
  }
  for (const candidate of value.candidates) {
    let document: SvgDocument;
    try {
      document = parseSavageDocument(candidate.contents);
    } catch (error) {
      const remove = await askLabeledYesNo(
        `A recovery for ${candidate.sourcePath ?? "an untitled project"} is invalid. Remove it?`,
        { title: "Invalid recovery", kind: "warning", yes: "Remove", no: "Keep" },
      );
      if (remove) await coordinator.discard(candidate.sessionId, candidate.sequence);
      notify(error instanceof Error ? error.message : String(error));
      continue;
    }

    const recover = await askLabeledYesNo(
      `Recover unsaved work from ${new Date(candidate.createdAtMs).toLocaleString()}?`,
      { title: "Project recovery", kind: "warning", yes: "Recover", no: "Other options" },
    );
    if (recover) {
      useProjectSessionStore.getState().startSession({
        displayName: `Recovered ${candidate.sourcePath ? fileDisplayName(candidate.sourcePath) : "Untitled"}`,
      });
      useDocumentStore.getState().loadDocument(document);
      await coordinator.discard(candidate.sessionId, candidate.sequence);
      notify("Recovered project opened as an unsaved document");
      return;
    }

    if (candidate.sourcePath) {
      const openSource = await askLabeledYesNo("Open the original project instead?", {
        title: "Project recovery",
        kind: "info",
        yes: "Open Original",
        no: "Discard Recovery",
      });
      if (openSource) {
        await openOriginal(candidate);
        return;
      }
    } else {
      const discard = await askLabeledYesNo("Discard this untitled recovery?", {
        title: "Project recovery",
        kind: "warning",
        yes: "Discard Recovery",
        no: "Keep",
      });
      if (!discard) continue;
    }
    await coordinator.discard(candidate.sessionId, candidate.sequence);
  }
}