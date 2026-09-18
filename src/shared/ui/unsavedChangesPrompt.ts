import type { ReplacementDecision } from "./nativeConfirm";

interface PendingUnsavedChanges {
  question: string;
  resolve: (decision: ReplacementDecision) => void;
}

let pending: PendingUnsavedChanges | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeUnsavedChangesPrompt(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function getUnsavedChangesPrompt(): PendingUnsavedChanges | null {
  return pending;
}

export function promptSaveDiscardCancel(
  question = "Save changes before replacing the current project?",
): Promise<ReplacementDecision> {
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

export function resolveUnsavedChangesPrompt(decision: ReplacementDecision): void {
  pending?.resolve(decision);
}
