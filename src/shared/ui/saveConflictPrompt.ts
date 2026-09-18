export type SaveConflictDecision = "reload" | "saveAs" | "overwrite" | "cancel";

interface PendingSaveConflict {
  question: string;
  resolve: (decision: SaveConflictDecision) => void;
}

let pending: PendingSaveConflict | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeSaveConflictPrompt(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function getSaveConflictPrompt(): PendingSaveConflict | null {
  return pending;
}

export function promptSaveConflict(
  question = "This file changed on disk. Reload the disk copy, save to a new file, or overwrite it?",
): Promise<SaveConflictDecision> {
  if (pending) {
    return Promise.resolve("cancel");
  }
  return new Promise((resolve) => {
    pending = {
      question,
      resolve: (decision) => {
        pending = null;
        emit();
        resolve(decision);
      },
    };
    emit();
  });
}

export function resolveSaveConflictPrompt(decision: SaveConflictDecision): void {
  pending?.resolve(decision);
}

export function isSaveConflictMessage(message: string): boolean {
  return message.toLowerCase().includes("conflict:");
}

export function saveFailureMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("conflict:")) {
    return "This file changed on disk. Reload, Save As, or overwrite.";
  }
  if (
    lower.includes("sharing") ||
    lower.includes("being used") ||
    lower.includes("os error 32")
  ) {
    return "Could not save because the file is in use. Close the other program and try again.";
  }
  if (lower.includes("os error 112") || lower.includes("no space") || lower.includes("disk is full")) {
    return "Could not save because the disk is full.";
  }
  if (lower.includes("permission") || lower.includes("access is denied") || lower.includes("os error 5")) {
    return "Could not save: permission denied.";
  }
  return message;
}
