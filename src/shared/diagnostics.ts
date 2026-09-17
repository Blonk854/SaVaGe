import { invoke, isTauri } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";

export type DiagnosticLevel = "info" | "warn" | "error";

export interface DiagnosticRecord {
  level: DiagnosticLevel;
  code: string;
  operation: string;
  operationId?: string;
  jobId?: string;
  sessionId?: string;
  stage?: string;
  elapsedMs?: number;
  message: string;
}

type InvokeFn = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

export function recordDiagnostic(
  event: DiagnosticRecord,
  invokeCommand: InvokeFn | null = isTauri() ? invoke : null,
): void {
  if (!invokeCommand) return;
  void invokeCommand("record_diagnostic", { request: event }).catch(() => undefined);
}

export async function exportDiagnostics(
  confirm: () => Promise<boolean> = async () =>
    ask(
      "Export a redacted diagnostic log? It does not include your document, images, or full file paths. Review the file before sharing it.",
      {
        title: "Export diagnostics",
        kind: "info",
        okLabel: "Export…",
        cancelLabel: "Cancel",
      },
    ),
  invokeCommand: InvokeFn = invoke,
): Promise<string | null> {
  if (!(await confirm())) return null;
  const path = await invokeCommand("export_diagnostics");
  return typeof path === "string" ? path : null;
}
