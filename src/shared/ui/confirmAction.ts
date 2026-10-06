interface PendingConfirm {
  title: string;
  message: string;
  resolve: (accepted: boolean) => void;
}

let pending: PendingConfirm | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeConfirmAction(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function getConfirmAction(): PendingConfirm | null {
  return pending;
}

export function confirmAction(title: string, message: string): Promise<boolean> {
  if (pending) return Promise.resolve(false);
  return new Promise((resolve) => {
    pending = { title, message, resolve: finish(resolve) };
    emit();
  });
}

export function resolveConfirmAction(accepted: boolean) {
  pending?.resolve(accepted);
}

function finish(resolve: (accepted: boolean) => void) {
  return (accepted: boolean) => {
    pending = null;
    emit();
    resolve(accepted);
  };
}
