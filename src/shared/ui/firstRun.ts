const WELCOME_KEY = "savage.welcome.dismissed";

type WelcomeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function browserWelcomeStorage(): WelcomeStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function isWelcomeDismissed(storage: WelcomeStorage | null = browserWelcomeStorage()): boolean {
  return storage?.getItem(WELCOME_KEY) === "1";
}

export function dismissWelcome(storage: WelcomeStorage | null = browserWelcomeStorage()) {
  storage?.setItem(WELCOME_KEY, "1");
  emit();
}

export function reopenWelcome(storage: WelcomeStorage | null = browserWelcomeStorage()) {
  storage?.removeItem(WELCOME_KEY);
  emit();
}

export function subscribeWelcome(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}
