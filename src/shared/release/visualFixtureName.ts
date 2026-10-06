/** Packaged-window states captured by scripts/capture-pixels.ps1. Keep in sync with src-tauri/src/evidence.rs. */
export const VISUAL_FIXTURES = [
  "converter-empty",
  "converter-loaded",
  "converter-tracing",
  "converter-completed",
  "converter-stale",
  "converter-error",
  "editor-empty",
  "editor-populated",
  "menu-file",
  "dialog-unsaved",
  "dialog-conflict",
] as const;

export type VisualFixtureName = (typeof VISUAL_FIXTURES)[number];

export function isVisualFixtureName(value: string): value is VisualFixtureName {
  return (VISUAL_FIXTURES as readonly string[]).includes(value);
}

/** Set only by the native host when SAVAGE_VISUAL names an allowlisted fixture. */
export function readVisualFixture(): VisualFixtureName | null {
  const value = (globalThis as { __SAVAGE_VISUAL__?: unknown }).__SAVAGE_VISUAL__;
  return typeof value === "string" && isVisualFixtureName(value) ? value : null;
}

let ready: VisualFixtureName | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function markVisualFixtureReady(name: VisualFixtureName): void {
  ready = name;
  if (typeof document !== "undefined") {
    document.documentElement.dataset.savageVisual = name;
  }
  emit();
}

export function visualFixtureReady(): VisualFixtureName | null {
  return ready;
}

export function subscribeVisualFixtureReady(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function resetVisualFixtureReadyForTests(): void {
  ready = null;
  if (typeof document !== "undefined") {
    delete document.documentElement.dataset.savageVisual;
  }
  emit();
}
