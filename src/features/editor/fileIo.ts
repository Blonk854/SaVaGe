import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { useUiStore } from "../../shared/stores/uiStore";
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
    return result === "saved" && !isProjectModified(useDocumentStore.getState().doc);
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

export async function saveProject(
  saveAs = false,
  dependencies: FileIoDependencies = defaultDependencies,
): Promise<"saved" | "cancelled" | "stale"> {
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
      destination.path === session.projectPath ? session.fileFingerprint : null;
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
    recordDiagnostic({
      level: "error",
      code: "save_failed",
      operation: "save",
      operationId: snapshot.operationId,
      sessionId: snapshot.sessionId,
      stage: "write",
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function exportSvg() {
  const destination = await invoke<unknown>("pick_svg_destination", {
    defaultFileName: fileNameOnly(
      `${useDocumentStore.getState().doc.name || "export"}.svg`,
      "export.svg",
    ),
  });
  if (!destination) return;
  const granted = parseGrantedDestination(destination);
  const svg = documentToSvgString(useDocumentStore.getState().doc);
  await invoke("write_svg_export", {
    destinationGrantId: granted.grantId,
    contents: svg,
  });
}

export async function exportPng(scale = 2) {
  const destination = await invoke<unknown>("pick_png_destination", {
    defaultFileName: fileNameOnly(
      `${useDocumentStore.getState().doc.name || "export"}.png`,
      "export.png",
    ),
  });
  if (!destination) return;
  const granted = parseGrantedDestination(destination);
  const svg = documentToSvgString(useDocumentStore.getState().doc);
  await invoke("export_png", {
    destinationGrantId: granted.grantId,
    svg,
    scale,
  });
}
