export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable === true
  );
}

export function isMenuTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('[role="menubar"], [role="menu"]'));
}

export function isListRowTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("[data-list-row]"));
}

/** Canvas tool/nudge shortcuts should not run while typing or driving a menu/list. */
export function shouldIgnoreCanvasShortcut(target: EventTarget | null, key: string): boolean {
  if (isTypingTarget(target)) return true;
  if (isMenuTarget(target)) return true;
  if (isListRowTarget(target) && isNavigationKey(key)) return true;
  return false;
}

export function isNavigationKey(key: string): boolean {
  return (
    key === "ArrowUp" ||
    key === "ArrowDown" ||
    key === "ArrowLeft" ||
    key === "ArrowRight" ||
    key === "Home" ||
    key === "End" ||
    key === "Enter" ||
    key === " " ||
    key === "Escape" ||
    key === "F2"
  );
}

export function adjacentIndex(current: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return (current + delta + length) % length;
}

export function focusListSibling(current: HTMLElement, direction: 1 | -1): HTMLElement | null {
  const root = current.closest("[data-list-root]") ?? current.parentElement;
  if (!root) return null;
  const rows = [...root.querySelectorAll<HTMLElement>("[data-list-row]")];
  const index = rows.indexOf(current);
  if (index < 0) return null;
  const next = rows[index + direction];
  if (!next) return null;
  next.focus();
  return next;
}
