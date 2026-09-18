import { message } from "@tauri-apps/plugin-dialog";

export type ReplacementDecision = "save" | "discard" | "cancel";

function dialogValue(result: unknown): string {
  return String(result ?? "").trim().toLowerCase();
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

export async function promptSaveDiscardCancel(
  question = "Save changes before replacing the current project?",
): Promise<ReplacementDecision> {
  return replacementDecisionFromDialog(
    await message(question, {
      title: "Unsaved changes",
      kind: "warning",
      buttons: { yes: "Save", no: "Discard", cancel: "Cancel" },
    }),
  );
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
