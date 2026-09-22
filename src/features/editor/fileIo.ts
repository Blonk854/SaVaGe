import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { nanoid } from "nanoid";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { useUiStore } from "../../shared/stores/uiStore";
import { isCancelledConversion } from "../converter/convertApi";
import { documentToSvgString } from "../../shared/document/serialize";
import { svgStringToDocument } from "../../shared/document/deserialize";
import { parseSavageDocument } from "../../shared/document/parseSavage";
import { createEmptyDocument } from "../../shared/document/emptyDocument";
import { recordDiagnostic } from "../../shared/diagnostics";
import {
  fileDisplayName,
  type FileFingerprint,
  isProjectModified,
  projectContents,
  useProjectSessionStore,
} from "../../shared/stores/projectSessionStore";

import {
  parseGrantedImageSource,
  RASTER_EXTENSIONS,
  type GrantedImageSource,
} from "../converter/rasterFiles";
import { type ReplacementDecision } from "../../shared/ui/nativeConfirm";
import { promptSaveDiscardCancel } from "../../shared/ui/unsavedChangesPrompt";
import {
  isSaveConflictMessage,
  promptSaveConflict,
  type SaveConflictDecision,
} from "../../shared/ui/saveConflictPrompt";
import {
  discardCurrentRecovery,
  recoverySequenceFor,
} from "./recovery";

export type { ReplacementDecision };

interface FileIoDependencies {
  chooseOpen: (
    options: Parameters<typeof open>[0],
  ) => Promise<string | NativeOpenSource | null>;
  chooseSave: (
    options: Parameters<typeof save>[0],
  ) => Promise<GrantedDestination | null>;
  invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
}

interface NativeOpenSource {
  path: string;
  imageGrantId?: string | null;
  projectDestinationGrantId?: string | null;
}

interface GrantedDestination {
  path: string;
  grantId: string;
}

const defaultDependencies: FileIoDependencies = {
  chooseOpen: async () => invoke("pick_open_source") as Promise<NativeOpenSource | null>,
  chooseSave: async (options) =>
    invoke("pick_project_destination", {
      defaultFileName: fileNameOnly(options?.defaultPath, "untitled.savage"),
    }) as Promise<GrantedDestination | null>,
  invoke,
};

const writeQueues = new Map<string, Promise<unknown>>();
let replacementConfirmation: Promise<boolean> | null = null;
let activeExportJobId: string | null = null;
let nextExportRevision = 1;

export type ReplacementDecisionProvider = () => Promise<ReplacementDecision>;

async function promptReplacementDecision(): Promise<ReplacementDecision> {
  return promptSaveDiscardCancel();
}

export async function confirmDocumentReplacement(
  decide: ReplacementDecisionProvider = promptReplacementDecision,
  saveCurrent: () => ReturnType<typeof saveProject> = () => saveProject(),
): Promise<boolean> {
  if (!isProjectModified(useDocumentStore.getState().doc)) return true;
  if (replacementConfirmation) return replacementConfirmation;
  replacementConfirmation = (async () => {
    const decision = await decide();
    if (decision === "cancel") return false;
    if (decision === "discard") {
      try {
        await discardCurrentRecovery();
      } catch {
        /* still allow discard if recovery cleanup fails */
      }
      return true;
    }
    const result = await saveCurrent();
    if (result === "cancelled" || result === "stale") return false;
    return !isProjectModified(useDocumentStore.getState().doc);
  })();
  try {
    return await replacementConfirmation;
  } finally {
    replacementConfirmation = null;
  }
}

async function enqueueWrite(
  destinationGrantId: string,
  contents: string,
  expectedFingerprint: FileFingerprint | null,
  invokeCommand: FileIoDependencies["invoke"],
): Promise<unknown> {
  const previous = writeQueues.get(destinationGrantId) ?? Promise.resolve();
  const write = previous
    .catch(() => undefined)
    .then(() =>
      invokeCommand("write_project_file", {
        destinationGrantId,
        contents,
        expectedFingerprint,
      }),
    );
  writeQueues.set(destinationGrantId, write);
  try {
    return await write;
  } finally {
    if (writeQueues.get(destinationGrantId) === write) {
      writeQueues.delete(destinationGrantId);
    }
  }
}

function fileNameOnly(value: string | undefined, fallback: string): string {
  return value?.split(/[/\\]/).pop() || fallback;
}

function parseGrantedDestination(value: unknown): GrantedDestination {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as { path?: unknown }).path !== "string" ||
    typeof (value as { grantId?: unknown }).grantId !== "string"
  ) {
    throw new Error("Native save dialog returned invalid authorization");
  }
  return value as GrantedDestination;
}

function parseFingerprint(value: unknown): FileFingerprint {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as FileFingerprint).size !== "number" ||
    typeof (value as FileFingerprint).modifiedMs !== "number"
  ) {
    throw new Error("Native file operation returned an invalid fingerprint");
  }
  return value as FileFingerprint;
}

function parseReadResult(value: unknown): { contents: string; fingerprint: FileFingerprint } {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as { contents?: unknown }).contents !== "string"
  ) {
    throw new Error("Native file read returned invalid data");
  }
  return {
    contents: (value as { contents: string }).contents,
    fingerprint: parseFingerprint((value as { fingerprint?: unknown }).fingerprint),
  };
}

export async function openFile(
  dependencies: FileIoDependencies = defaultDependencies,
  decide: ReplacementDecisionProvider = promptReplacementDecision,
) {
  const selection = await dependencies.chooseOpen({
    multiple: false,
    filters: [
      { name: "SaVaGe / SVG / Images", extensions: ["savage", "svg", ...RASTER_EXTENSIONS] },
    ],
  });
  if (!selection) return;
  const selected = typeof selection === "string" ? selection : selection.path;

  if (typeof selection !== "string" && selection.imageGrantId) {
    if (!(await confirmDocumentReplacement(decide))) return;
    const ui = useUiStore.getState();
    const source: GrantedImageSource = parseGrantedImageSource({
      path: selected,
      grantId: selection.imageGrantId,
    });
    ui.setPendingConvertPath(source);
    ui.setMode("convert");
    return selected;
  }

  try {
    const readResult = parseReadResult(
      await dependencies.invoke("read_text_file", { path: selected }),
    );
    const text = readResult.contents;
    let document;
    if (selected.toLowerCase().endsWith(".savage")) {
      document = parseSavageDocument(text);
      if (!(await confirmDocumentReplacement(decide))) return;
      useProjectSessionStore.getState().startSession({
        displayName: fileDisplayName(selected),
        projectPath: selected,
        projectDestinationGrantId:
          typeof selection === "string" ? null : selection.projectDestinationGrantId,
        fileFingerprint: readResult.fingerprint,
        savedContents: projectContents(document),
      });
    } else {
      document = svgStringToDocument(text);
      if (!(await confirmDocumentReplacement(decide))) return;
      useProjectSessionStore.getState().startSession({ displayName: document.name });
    }
    useDocumentStore.getState().loadDocument(document);
    useUiStore.getState().setMode("edit");
    return selected;
  } catch (error) {
    recordDiagnostic({
      level: "error",
      code: "open_failed",
      operation: "open",
      sessionId: useProjectSessionStore.getState().sessionId,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function newProject(
  decide: ReplacementDecisionProvider = promptReplacementDecision,
): Promise<boolean> {
  if (!(await confirmDocumentReplacement(decide))) return false;
  const document = createEmptyDocument();
  useProjectSessionStore.getState().startSession({ displayName: "Untitled" });
  useDocumentStore.getState().loadDocument(document);
  useUiStore.getState().setMode("edit");
  return true;
}

export async function openConvertedSvg(
  svg: string,
  name: string,
  decide: ReplacementDecisionProvider = promptReplacementDecision,
): Promise<boolean> {
  if (!(await confirmDocumentReplacement(decide))) return false;
  useProjectSessionStore.getState().startSession({ displayName: name });
  useDocumentStore.getState().replaceFromSvg(svg, name);
  useUiStore.getState().setMode("edit");
  return true;
}

export type SaveResult = "saved" | "cancelled" | "stale" | "reloaded";

export type SaveConflictDecisionProvider = () => Promise<SaveConflictDecision>;

interface SaveOptions {
  overwrite?: boolean;
  decideConflict?: SaveConflictDecisionProvider;
}

function nativeErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return String(error);
}

async function promptConflictDecision(): Promise<SaveConflictDecision> {
  return promptSaveConflict();
}

async function reloadProjectFromGrant(
  destination: GrantedDestination,
  invokeCommand: FileIoDependencies["invoke"],
): Promise<void> {
  const readResult = parseReadResult(
    await invokeCommand("read_project_file", {
      destinationGrantId: destination.grantId,
    }),
  );
  const document = parseSavageDocument(readResult.contents);
  useProjectSessionStore.getState().startSession({
    displayName: fileDisplayName(destination.path),
    projectPath: destination.path,
    projectDestinationGrantId: destination.grantId,
    fileFingerprint: readResult.fingerprint,
    savedContents: projectContents(document),
  });
  useDocumentStore.getState().loadDocument(document);
}

export async function saveProject(
  saveAs = false,
  dependencies: FileIoDependencies = defaultDependencies,
  options: SaveOptions = {},
): Promise<SaveResult> {
  const session = useProjectSessionStore.getState();
  const contents = projectContents(useDocumentStore.getState().doc);
  const snapshot = session.beginSave(
    contents,
    recoverySequenceFor(session.sessionId, contents),
  );
  let destination =
    !saveAs && session.projectPath && session.projectDestinationGrantId
      ? {
          path: session.projectPath,
          grantId: session.projectDestinationGrantId,
        }
      : null;
  if (!destination) {
    const selected = await dependencies.chooseSave({
      filters: [{ name: "SaVaGe Project", extensions: ["savage"] }],
      defaultPath: `${session.displayName || "untitled"}.savage`,
    });
    destination = selected ? parseGrantedDestination(selected) : null;
  }
  if (!destination) {
    useProjectSessionStore.getState().finishSaveFailure(snapshot);
    return "cancelled";
  }
  try {
    const expectedFingerprint =
      options.overwrite || destination.path !== session.projectPath
        ? null
        : session.fileFingerprint;
    const fingerprint = parseFingerprint(
      await enqueueWrite(
        destination.grantId,
        snapshot.contents,
        expectedFingerprint,
        dependencies.invoke,
      ),
    );
    if (
      !useProjectSessionStore
        .getState()
        .acknowledgeSave(
          snapshot,
          destination.path,
          destination.grantId,
          fingerprint,
        )
    ) {
      return "stale";
    }
    void discardCurrentRecovery(snapshot.sessionId, snapshot.recoverySequence);
    return "saved";
  } catch (error) {
    useProjectSessionStore.getState().finishSaveFailure(snapshot);
    const message = nativeErrorMessage(error);
    if (!options.overwrite && isSaveConflictMessage(message)) {
      const decision = await (options.decideConflict ?? promptConflictDecision)();
      if (decision === "reload") {
        try {
          await reloadProjectFromGrant(destination, dependencies.invoke);
          return "reloaded";
        } catch (reloadError) {
          recordDiagnostic({
            level: "error",
            code: "reload_failed",
            operation: "save",
            operationId: snapshot.operationId,
            sessionId: snapshot.sessionId,
            stage: "reload",
            message: nativeErrorMessage(reloadError),
          });
          throw reloadError;
        }
      }
      if (decision === "saveAs") {
        return saveProject(true, dependencies, options);
      }
      if (decision === "overwrite") {
        return saveProject(false, dependencies, { ...options, overwrite: true });
      }
      return "cancelled";
    }
    recordDiagnostic({
      level: "error",
      code: "save_failed",
      operation: "save",
      operationId: snapshot.operationId,
      sessionId: snapshot.sessionId,
      stage: "write",
      message,
    });
    throw error;
  }
}

function assertExportResult(
  value: unknown,
  jobId: string,
  sessionId: string,
  sourceRevision: number,
) {
  if (
    !value ||
    typeof value !== "object" ||
    (value as { jobId?: unknown }).jobId !== jobId ||
    (value as { sessionId?: unknown }).sessionId !== sessionId ||
    (value as { sourceRevision?: unknown }).sourceRevision !== sourceRevision
  ) {
    throw new Error("Native export returned a stale or invalid result");
  }
}

export async function cancelExportJob(
  jobId: string | null = activeExportJobId,
  invokeCommand: (
    command: string,
    args?: Record<string, unknown>,
  ) => Promise<unknown> = invoke,
): Promise<{ jobId: string; state: string }> {
  if (!jobId) {
    throw new Error("No export is running");
  }
  const wasExporting = useUiStore.getState().exporting;
  useUiStore.getState().setExporting(true, "Stopping after the current stage…");
  try {
    const value = await invokeCommand("cancel_export_job", { jobId });
    if (
      !value ||
      typeof value !== "object" ||
      (value as { jobId?: unknown }).jobId !== jobId ||
      (value as { state?: unknown }).state !== "cancelRequested"
    ) {
      throw new Error("Native export cancel did not confirm the running job");
    }
    return value as { jobId: string; state: string };
  } catch (error) {
    if (!wasExporting) useUiStore.getState().setExporting(false);
    throw error;
  }
}

async function runExportJob(
  command: "write_svg_export" | "export_png",
  pickCommand: "pick_svg_destination" | "pick_png_destination",
  extension: "svg" | "png",
  label: string,
  invokeCommand: (
    command: string,
    args?: Record<string, unknown>,
  ) => Promise<unknown>,
  jobId: string,
  extra: Record<string, unknown> = {},
): Promise<"exported" | "cancelled"> {
  if (useUiStore.getState().exporting) {
    throw new Error("Wait for the current export to finish");
  }
  const destination = await invokeCommand(pickCommand, {
    defaultFileName: fileNameOnly(
      `${useDocumentStore.getState().doc.name || "export"}.${extension}`,
      `export.${extension}`,
    ),
  });
  if (!destination) return "cancelled";
  const granted = parseGrantedDestination(destination);
  const contents = documentToSvgString(useDocumentStore.getState().doc);
  const sessionId = useProjectSessionStore.getState().sessionId;
  const sourceRevision = nextExportRevision++;
  activeExportJobId = jobId;
  useUiStore.getState().setExporting(true, label);
  try {
    const value = await invokeCommand(command, {
      request: {
        jobId,
        sessionId,
        sourceRevision,
        destinationGrantId: granted.grantId,
        contents,
        ...extra,
      },
    });
    if (sessionId !== useProjectSessionStore.getState().sessionId) {
      throw new Error("Export result was discarded because the project changed");
    }
    assertExportResult(value, jobId, sessionId, sourceRevision);
    return "exported";
  } catch (error) {
    if (isCancelledConversion(error)) {
      throw new Error("Export cancelled. The current stage finishes before the job exits.");
    }
    throw error;
  } finally {
    if (activeExportJobId === jobId) activeExportJobId = null;
    useUiStore.getState().setExporting(false);
  }
}

export async function exportSvg(
  invokeCommand: (
    command: string,
    args?: Record<string, unknown>,
  ) => Promise<unknown> = invoke,
  jobId = nanoid(),
) {
  return runExportJob(
    "write_svg_export",
    "pick_svg_destination",
    "svg",
    "Exporting SVG…",
    invokeCommand,
    jobId,
  );
}

export async function exportPng(
  scale = 2,
  invokeCommand: (
    command: string,
    args?: Record<string, unknown>,
  ) => Promise<unknown> = invoke,
  jobId = nanoid(),
) {
  return runExportJob(
    "export_png",
    "pick_png_destination",
    "png",
    "Exporting PNG…",
    invokeCommand,
    jobId,
    { scale },
  );
}
