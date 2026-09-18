import { message } from "@tauri-apps/plugin-dialog";

export type ReplacementDecision = "save" | "discard" | "cancel";

function dialogValue(result: unknown): string {
  if (result == null) return "";
  if (typeof result === "string" || typeof result === "number" || typeof result === "boolean") {
    return String(result).trim().toLowerCase();
  }
  if (typeof result === "object") {
    const record = result as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length === 1) {
      const inner = record[keys[0]];
      if (typeof inner === "string" && inner.trim()) return inner.trim().toLowerCase();
      return keys[0].trim().toLowerCase();
    }
  }
  return "";
}

/** Windows rfd may return Yes/No/Ok/Cancel instead of the custom button label. */
export function isAffirmativeDialogResult(result: unknown, yesLabel: string): boolean {
  const value = dialogValue(result);
  return value === "yes" || value === "ok" || value === yesLabel.trim().toLowerCase();
}

export function replacementDecisionFromDialog(result: unknown): ReplacementDecision {
  const value = dialogValue(result);
  if (value === "save" || value === "yes" || value === "ok") return "save";
  if (value === "discard" || value === "no") return "discard";
  return "cancel";
}

export async function handleWindowCloseRequest(options: {
  preventDefault: () => void;
  confirm: () => Promise<boolean>;
  destroy: () => Promise<void>;
}): Promise<void> {
  options.preventDefault();
  if (!(await options.confirm())) return;
  await options.destroy();
}

export async function askLabeledYesNo(
  question: string,
  options: {
    title: string;
    kind?: "info" | "warning" | "error";
    yes: string;
    no: string;
  },
): Promise<boolean> {
  const result = await message(question, {
    title: options.title,
    kind: options.kind ?? "warning",
    buttons: { ok: options.yes, cancel: options.no },
  });
  return isAffirmativeDialogResult(result, options.yes);
}
